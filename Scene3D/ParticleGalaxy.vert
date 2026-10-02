#version 330 core
/**
 * @file ParticleGalaxy.vert
 * @brief Vertex stage companion to ParticleGalaxy.frag -- see that file's header for
 * this scene's description.
 */
// ParticleGalaxy.vert — a REAL 3D spiral galaxy of 60k point sprites.
// The camera orbits the core; the bass pumps the central bulge, every kick
// sends a bright shock ring rolling outward along the beat phase, and a drop
// lights the whole disc.  All positions are built here in the vertex shader
// from (index, seeds) — the VBO is static, the GPU does everything.
//   attrA.w = particle index, attrB = 4 seeds in [0,1)
// True stereo: eyeOff shifts the view; convergence re-centres after proj.

in vec4 attrA;   ///< Vertex attribute A (meaning per geometry kind, see the stage's header; e.g. position or u/v and an index).
in vec4 attrB;   ///< Vertex attribute B (meaning per geometry kind; e.g. normal or per-element seeds).

uniform mat4  projM;   ///< Projection matrix.
uniform float eyeOff;   ///< Stereo eye offset (0 in mono).
uniform float time;   ///< Seconds since the program started (never reset; see sceneTime).
uniform vec2  resolution;   ///< Size of the render target in pixels.

uniform float audioPhase;   ///< Rotation phase driven by the music (integrated, never jumps).
uniform float audioAdvance;   ///< The music's advance: integrated tempo-weighted energy (never jumps, never runs backwards).
uniform float audioBass;   ///< Bass band level, 0..1.
uniform float audioKick;   ///< Kick-drum envelope, 0..1 (fast attack, short decay).
uniform float audioBeatPhase;   ///< Position within the current beat, 0..1.
uniform float audioSwell;   ///< Slow loudness envelope, 0..1 (seconds).
uniform float audioChromaHue;   ///< Hue of the dominant pitch class (radians, unwrapped: continuous).
uniform float audioCentroid;   ///< Spectral centroid (brightness of the sound), 0..1.
uniform float audioDrop;   ///< Drop envelope: high after a detected drop, decaying.
uniform sampler2D tex0;   ///< The current photo.
uniform sampler2D tex1;   ///< The next photo (cross-faded in by interpolation).
uniform float interpolation;   ///< Cross-fade between the photos: 1 = tex0, 0 = tex1.
uniform float audioValence;   ///< Mood valence: 0 dark .. 1 bright.

out vec4 vCol;   ///< Colour (from the vertex stage).

/// @brief The photo at a coordinate: the cross-fade of tex0 and tex1.
vec3 img(vec2 uv) {
    return (interpolation * texture(tex0, uv) + (1.0 - interpolation) * texture(tex1, uv)).rgb;
}


/// IMG-PALETTE (house standard): colours come from a rotating arc in the
/// CURRENT slideshow image, so every activation inherits a fresh palette from
/// the photos; the arc follows the musical key (audioChromaHue is circular-
/// slewed = jump-free) with a slow advance drift, valence shapes saturation.
vec3 imgPalette(float t)
{
    float ang = audioChromaHue + audioAdvance * 0.04 + t * 6.2831853;
    float rad = 0.16 + 0.08 * sin(audioAdvance * 0.013);
    vec3  pc  = img(clamp(vec2(0.5) + rad * vec2(cos(ang), sin(ang)), 0.0, 1.0));
    float pg  = dot(pc, vec3(0.333));
    return mix(vec3(pg), pc, 0.55 + 0.45 * audioValence);
}


/// House tint: bend a colour toward the photo palette while keeping its
/// luminance -- the identity look survives, only the hue follows the photos.
vec3 palTint(vec3 c, float t, float k)
{
    vec3 tp = imgPalette(t);
    tp *= dot(c, vec3(0.3333)) / max(dot(tp, vec3(0.3333)), 1e-3);
    return mix(c, tp, k);
}
/// @brief Rotates a colour's hue by an angle (about the grey axis).
vec3 hueRot(vec3 c, float a)
{
    vec3  k = vec3(0.57735026919);
    float cs = cos(a), sn = sin(a);
    return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
}

/// @brief Entry point of this shader stage (the file description says what it draws).
void main()
{
    float r1 = attrB.x, r2 = attrB.y, r3 = attrB.z, r4 = attrB.w;

    // Log-spiral galaxy, three arms, gentle differential rotation.
    float arm   = mod(attrA.w, 3.0);
    float rad   = pow(r1, 0.62) * 30.0;
    float bulge = exp(-rad * 0.09);
    float ang   = rad * 0.22 + arm * 2.0944
                + time * 0.02 + audioPhase * 0.06
                + (r3 - 0.5) * (0.35 + rad * 0.012);

    // The bass breathes the core (slew-limited -> smooth).
    rad *= 1.0 - 0.10 * audioSwell * bulge;
    float y = (r2 - 0.5) * (0.8 + 9.0 * bulge)
            + sin(ang * 3.0 + r4 * 6.2831) * 0.3;

    // Kick shock ring: rides outward with the beat phase, lit by the kick.
    float ringR = 4.0 + audioBeatPhase * 26.0;
    float ring  = exp(-abs(rad - ringR) * 0.35) * audioKick;

    vec3 world = vec3(cos(ang) * rad, y, sin(ang) * rad);

    // Orbiting camera looking at the core; the swell pulls it closer.
    float ca  = time * 0.05 + audioAdvance * 0.10;
    float cr  = 34.0 - 6.0 * audioSwell;
    vec3 cam  = vec3(cos(ca) * cr, 9.0 + 5.0 * sin(time * 0.031), sin(ca) * cr);
    vec3 fwd  = normalize(-cam);
    vec3 rgt  = normalize(cross(fwd, vec3(0.0, 1.0, 0.0)));
    vec3 up   = cross(rgt, fwd);
    vec3 rel  = world - cam;
    vec3 vp   = vec3(dot(rel, rgt), dot(rel, up), dot(rel, fwd));

    vp.x -= eyeOff;                                   // true-stereo eye shift
    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;  // converge ~30 units out
    if (vp.z < 0.3)
        gl_Position = vec4(0.0, 0.0, -3.0, 1.0);      // behind camera: clipped

    // Point size in PIXELS: scale with the render height so the galaxy looks
    // identical at every resolution / render scale.
    float px   = resolution.y / 1080.0;
    float dist = max(vp.z, 0.5);
    gl_PointSize = clamp((70.0 + 160.0 * bulge) * (0.35 + 0.9 * r4) * px / dist,
                         1.5, 30.0 * px)
                 * (1.0 + 0.8 * ring + 0.6 * audioDrop);

    // Warm core -> cool arms; the music's key drifts the hue.
    vec3 col = palTint(mix(vec3(0.35, 0.55, 1.0), vec3(1.0, 0.75, 0.4), bulge), 0.30 * bulge, 0.22);
    col = mix(col, vec3(1.0, 0.5, 0.75), r3 * 0.35);
    col = hueRot(col, rad * 0.012);
    col *= 0.30 + 0.55 * r4 + 1.6 * ring + 0.9 * audioDrop * bulge;
    col *= 0.75 + 0.5 * audioCentroid;
    float fog = clamp(1.0 - vp.z / 130.0, 0.0, 1.0);
    vCol = vec4(col * fog * 1.7, 1.0);
}
