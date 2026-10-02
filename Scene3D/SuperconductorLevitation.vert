#version 330 core
/**
 * @file SuperconductorLevitation.vert
 * @brief Vertex stage companion to SuperconductorLevitation.frag -- see that file's header for
 * this scene's description.
 */
// SuperconductorLevitation.vert — 4,900 quantum-locked superconducting tiles
// levitating and undulating over an active magnetic flux field.
// 70x70 field of depth-tested cubes. Tiles tilt, pitch, and hover in concentric
// wave ripples driven by the 32 spectrum bands and audio kick transients.
//   attrA.xyz = unit-cube corner (-0.5..0.5), attrA.w = cube index
//   attrB     = per-cube seeds
// True stereo: eyeOff shifts the view; convergence re-centres after proj.

in vec4 attrA;   ///< Vertex attribute A (meaning per geometry kind, see the stage's header; e.g. position or u/v and an index).
in vec4 attrB;   ///< Vertex attribute B (meaning per geometry kind; e.g. normal or per-element seeds).

uniform mat4  projM;   ///< Projection matrix.
uniform float eyeOff;   ///< Stereo eye offset (0 in mono).
uniform float time;   ///< Seconds since the program started (never reset; see sceneTime).
uniform float cubeBudget;

uniform float audioAdvance;   ///< The music's advance: integrated tempo-weighted energy (never jumps, never runs backwards).
uniform float audioSpectrum[32];   ///< Spectrum bands, 0..1.
uniform float audioKick;   ///< Kick-drum envelope, 0..1 (fast attack, short decay).
uniform float audioCentroid;   ///< Spectral centroid (brightness of the sound), 0..1.
uniform float audioChromaHue;   ///< Hue of the dominant pitch class (radians, unwrapped: continuous).
uniform float audioSwell;   ///< Slow loudness envelope, 0..1 (seconds).
uniform float audioDrop;   ///< Drop envelope: high after a detected drop, decaying.
uniform float audioBeatPhase;   ///< Position within the current beat, 0..1.

uniform float levitateP;
uniform float tiltP;   ///< Tilt knob, 0..1.
uniform float glowP;   ///< Glow / afterglow knob, 0..1.
uniform float hueP;   ///< Hue knob (radians), usually the music's chroma hue plus a rolled offset.
uniform sampler2D tex0;   ///< The current photo.
uniform sampler2D tex1;   ///< The next photo (cross-faded in by interpolation).
uniform float interpolation;   ///< Cross-fade between the photos: 1 = tex0, 0 = tex1.
uniform float audioValence;   ///< Mood valence: 0 dark .. 1 bright.

out vec4 vCol;   ///< Colour (from the vertex stage).
out vec3 vNormal;   ///< Surface normal (from the vertex stage).
out vec3 vWorldPos;   ///< World position (from the vertex stage).
out vec2 vUV;   ///< Texture coordinate 0..1 over the screen (from the vertex stage).

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
vec3 hueRot(vec3 c, float a) {
    vec3 k = vec3(0.57735026919);
    float cs = cos(a), sn = sin(a);
    return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
}

/// @brief Entry point of this shader stage (the file description says what it draws).
void main() {
    float i = attrA.w;

    // FPS budget
    if (cubeBudget < 0.75 && mod(i, 2.0) > 0.5) {
        gl_Position = vec4(0.0, 0.0, -3.0, 1.0);
        vCol = vec4(0.0);
        return;
    }

    float lev = (levitateP > 0.0) ? levitateP : 1.0;
    float tlt = (tiltP     > 0.0) ? tiltP     : 1.0;
    float glw = (glowP     > 0.0) ? glowP     : 1.0;
    float hue = (hueP      > 0.0) ? hueP      : 0.0;

    // 70x70 tile coordinates
    float gx = mod(i, 70.0) - 34.5;
    float gz = floor(i / 70.0) - 34.5;
    float r = sqrt(gx * gx + gz * gz);
    float a = atan(gz, gx);

    // Spectrum band assignment based on radius
    int band = int(clamp(r / 35.0 * 31.0, 0.0, 31.0));
    float specAmp = audioSpectrum[band];

    // Levitation height calculation (concentric magnetic Bessel wave)
    float wavePhase = r * 0.45 - time * 2.5 - audioAdvance * 2.0;
    float levitationH = sin(wavePhase) * (1.2 * lev) + specAmp * 3.5;
    
    // Magnetic shockwave expansion on kick
    float shock = sin(r * 0.8 - fract(time * 2.0) * 15.0) * exp(-r * 0.08) * audioKick * 4.0;
    levitationH += shock;

    // Tile dimensions: thin levitating superconductor plates
    vec3 localCorner = attrA.xyz;
    vec3 tileSize = vec3(0.85, 0.12, 0.85);
    vec3 tilePos = localCorner * tileSize;

    // Quantum magnetic tilt along surface normal gradient
    float tiltAngleX = cos(wavePhase) * 0.25 * tlt;
    float tiltAngleZ = sin(wavePhase) * 0.25 * tlt;

    // Rotate tile corner
    mat3 rotX = mat3(1.0, 0.0, 0.0, 0.0, cos(tiltAngleX), -sin(tiltAngleX), 0.0, sin(tiltAngleX), cos(tiltAngleX));
    mat3 rotZ = mat3(cos(tiltAngleZ), -sin(tiltAngleZ), 0.0, sin(tiltAngleZ), cos(tiltAngleZ), 0.0, 0.0, 0.0, 1.0);
    tilePos = rotZ * rotX * tilePos;

    // World placement
    vec3 worldP = vec3(gx * 1.05, levitationH, gz * 1.05);
    vec3 finalWorld = worldP + tilePos;

    // Camera flight circling above the levitation array
    float camDist = 28.0 - audioSwell * 6.0;
    float camAngle = time * 0.15 + audioAdvance * 0.05;
    vec3 camPos = vec3(sin(camAngle) * camDist, 14.0 + 4.0 * sin(time * 0.2), cos(camAngle) * camDist);
    vec3 lookTarget = vec3(0.0, 0.0, 0.0);

    vec3 ww = normalize(lookTarget - camPos);
    vec3 uu = normalize(cross(ww, vec3(0.0, 1.0, 0.0)));
    vec3 vv = cross(uu, ww);

    vec3 relP = finalWorld - camPos;
    vec3 viewP = vec3(dot(relP, uu), dot(relP, vv), dot(relP, ww));

    // True stereo view offset
    viewP.x -= eyeOff;
    gl_Position = projM * vec4(viewP.x, viewP.y, -viewP.z, 1.0);
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;

    // Normal calculation
    vec3 rawNormal = rotZ * rotX * vec3(0.0, 1.0, 0.0);
    vNormal = rawNormal;
    vWorldPos = finalWorld;
    vUV = attrA.xy + 0.5;

    // Color: Cryogenic superconductor cyan & ultraviolet flux glow
    vec3 baseCol = imgPalette(0.30 * clamp(specAmp * 1.5, 0.0, 1.0)) * 1.4;
    baseCol = mix(baseCol, vec3(1.0, 0.8, 0.2), shock * 0.5);
    
    if (hue > 0.001) baseCol = hueRot(baseCol, hue);

    vCol = vec4(baseCol, 1.0);
}
