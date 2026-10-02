#version 330 core
/**
 * @file LissajousOrbits.vert
 * @brief Vertex stage companion to LissajousOrbits.frag -- see that file's header for
 * this scene's description.
 */
// LissajousOrbits.vert — six particle streams trace closed 3D Lissajous
// figures whose phase relation drifts imperceptibly, so the figures morph
// through their whole family over minutes.  Classic scope art, floating in a
// field of scope phosphor.
//
// The figure used to be a 13-unit curve seen from 40 units away, drawn with
// points that came out 1.5-2 px wide -- a small dim scribble in the middle of
// a black frame.  The camera sits closer, the figure is scaled to reach past
// the edges, the sprites are large enough to read, and a sixth of the points
// become a phosphor haze placed in FRUSTUM coordinates so the corners are
// never empty.

in vec4 attrA;   ///< Vertex attribute A (meaning per geometry kind, see the stage's header; e.g. position or u/v and an index).
in vec4 attrB;   ///< Vertex attribute B (meaning per geometry kind; e.g. normal or per-element seeds).

uniform mat4  projM;   ///< Projection matrix.
uniform float eyeOff;   ///< Stereo eye offset (0 in mono).
uniform float time;   ///< Seconds since the program started (never reset; see sceneTime).
uniform vec2  resolution;   ///< Size of the render target in pixels.

uniform float audioAdvance;   ///< The music's advance: integrated tempo-weighted energy (never jumps, never runs backwards).
uniform float audioSwell;   ///< Slow loudness envelope, 0..1 (seconds).
uniform float audioBass;   ///< Bass band level, 0..1.
uniform float audioChromaHue;   ///< Hue of the dominant pitch class (radians, unwrapped: continuous).
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

/// @brief Rotates a colour's hue by an angle (about the grey axis).
vec3 hueRot(vec3 c, float a)
{
    vec3  k = vec3(0.57735026919);
    float cs = cos(a), sn = sin(a);
    return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
}

/// @brief Pseudo-random number 0..1 from two values and a seed.
float hsh(float a, float b, float s)
{
    return fract(sin(a * 91.73 + b * 47.31 + s) * 43758.5453);
}

/// @brief Entry point of this shader stage (the file description says what it draws).
void main()
{
    float r1 = attrB.x, r2 = attrB.y, r3 = attrB.z, r4 = attrB.w;

    float stream = mod(attrA.w, 6.0);

    // The scene projection: 55 deg vertical FOV (see Scene3DShader::draw).
    const float kTanY = 0.5206;
    float aspect = (resolution.y > 0.5) ? resolution.x / resolution.y : 1.7778;

    vec3  vp;
    vec3  col;
    float sizeBase, sizeCap, sizeMin;

    if (r1 < 0.17)
    {
        // ---- SCOPE PHOSPHOR HAZE -------------------------------------
        // Afterglow shed by the beam, spread evenly over the frustum from just
        // in front of the camera out to the far dark.  A background layer:
        // clearly dimmer than the traces, but bright enough that no tile of
        // the picture is ever empty.
        float hx = hsh(r2, r3, 0.41);
        float hy = hsh(r3, r4, 1.83);
        float hz = hsh(r4, r2, 3.07);

        float dz = 12.0 + hz * 78.0;
        float ph = r2 * 6.2831853 + time * 0.07 + audioAdvance * 0.05;

        // 2.0 would fit the frustum exactly; 2.3 so the field still reaches
        // past all four edges when the preset camera rig rolls and yaws.
        float open = 2.3;
        vp = vec3((hx - 0.5) * open * dz * kTanY * aspect + 2.0 * cos(ph),
                  (hy - 0.5) * open * dz * kTanY          + 2.0 * sin(ph * 0.79),
                  dz);

        col = imgPalette(fract(hz * 0.6 + stream * 0.167));
        col *= (0.26 + 0.38 * r3) * (0.75 + 0.5 * audioSwell)
             * clamp(1.0 - dz / 150.0, 0.0, 1.0);

        // A speck must stay legible at any distance -- below roughly two and a
        // half pixels an additive sprite averages away to nothing and the far
        // field reads as black again.
        sizeBase = 96.0;
        sizeCap  = 10.0;
        sizeMin  = 2.7;
    }
    else
    {
        // ---- THE SIX LISSAJOUS FIGURES -------------------------------
        // r1 doubles as the layer selector and, rescaled inside its band, as
        // the position along the closed curve -- so the traces stay evenly
        // populated end to end.
        float u = (r1 - 0.17) / 0.83;

        // Frequency ratios per stream (small integers -> closed curves).
        float fa = 1.0 + mod(stream, 3.0);           // 1,2,3
        float fb = 2.0 + mod(stream * 1.7, 3.0);     // 2,3,4
        float fc = 3.0 + mod(stream * 2.3, 2.0);     // 3,4

        // Particles stream along the curve; the phase relation drifts slowly.
        float s     = u * 6.2831853 + time * 0.12 + audioAdvance * 0.2;
        float drift = time * 0.015;

        float A = (17.0 + stream * 1.8) * (1.0 + 0.05 * audioBass);
        vec3 world = vec3(sin(fa * s + drift) * A,
                          sin(fb * s + drift * 1.6) * A * 0.62,
                          sin(fc * s + drift * 0.7) * A * 0.5);

        // Soft tube spread.
        world += (vec3(r2, r3, r4) - 0.5) * 1.5;

        float ra = time * 0.05;
        world.xz = mat2(cos(ra), -sin(ra), sin(ra), cos(ra)) * world.xz;

        // 34, not the old 40: close enough that a 17-26 unit figure reaches
        // past the top and bottom edges, far enough that the xz spin never
        // swings a lobe of the curve through the near plane.
        vp = world + vec3(0.0, 0.0, 34.0);

        // Trimmed from 1.35: the sprites are now four times the area they
        // were, so the same gain would have pushed the trace cores past white.
        col = imgPalette(stream * 0.167) * 1.15;
        col *= (0.4 + 0.6 * r3) * (0.7 + 0.5 * audioSwell)
             * clamp(1.0 - vp.z / 95.0, 0.0, 1.0);

        sizeBase = 210.0;
        sizeCap  = 15.0;
        sizeMin  = 2.6;
    }

    vp.x -= eyeOff;
    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.05 * gl_Position.w;
    if (vp.z < 0.4)
        gl_Position = vec4(0.0, 0.0, -3.0, 1.0);

    float px   = resolution.y / 1080.0;
    float dist = max(vp.z, 0.5);
    gl_PointSize = clamp(sizeBase * (0.4 + 0.8 * r4) * px / dist,
                         sizeMin, max(sizeCap * px, sizeMin));

    vCol = vec4(col * 2.7, 1.0);
}
