#version 330 core
/**
 * @file PolaritonCondensateVortexLattice.vert
 * @brief Vertex stage companion to PolaritonCondensateVortexLattice.frag -- see that file's
 * header for this scene's description.
 */

in vec4 attrA; ///< xy = Cell UV [0,1], z = 0, w = Cell index
in vec4 attrB; ///< 4 seeds in [0,1)

out vec2 vUV;   ///< Texture coordinate 0..1 over the screen (from the vertex stage).
out vec3 vNormal;   ///< Surface normal (from the vertex stage).
out vec3 vCol;   ///< Colour (from the vertex stage).
out float vPhase;

uniform mat4 projM;   ///< Projection matrix.
uniform float eyeOff;   ///< Stereo eye offset (0 in mono).
uniform float time;   ///< Seconds since the program started (never reset; see sceneTime).

uniform float audioPhase;   ///< Rotation phase driven by the music (integrated, never jumps).
uniform float audioAdvance;   ///< The music's advance: integrated tempo-weighted energy (never jumps, never runs backwards).
uniform float audioKick;   ///< Kick-drum envelope, 0..1 (fast attack, short decay).
uniform float audioSwell;   ///< Slow loudness envelope, 0..1 (seconds).
uniform float audioCentroid;   ///< Spectral centroid (brightness of the sound), 0..1.
uniform float audioValence;   ///< Mood valence: 0 dark .. 1 bright.
uniform float audioChromaHue;   ///< Hue of the dominant pitch class (radians, unwrapped: continuous).

uniform sampler2D tex0;   ///< The current photo.
uniform sampler2D tex1;   ///< The next photo (cross-faded in by interpolation).
uniform float interpolation;   ///< Cross-fade between the photos: 1 = tex0, 0 = tex1.

uniform float vortexDensityP;
uniform float waveHeightP;

/// @brief The photo at a coordinate: the cross-fade of tex0 and tex1.
vec3 img(vec2 uv) {
    return (interpolation * texture(tex0, uv) + (1.0 - interpolation) * texture(tex1, uv)).rgb;
}

/// @brief The house palette: a colour of the photo on an arc that turns with the music's hue.
vec3 imgPalette(float t)
{
    float ang = audioChromaHue + audioAdvance * 0.04 + t * 6.2831853;
    float rad = 0.16 + 0.08 * sin(audioAdvance * 0.013);
    vec3  col = img(clamp(vec2(0.5) + rad * vec2(cos(ang), sin(ang)), 0.0, 1.0));
    float g   = dot(col, vec3(0.333));
    return mix(vec3(g), col, 0.55 + 0.45 * audioValence);
}

/// @brief Entry point of this shader stage (the file description says what it draws).
void main()
{
    // Remap grid UV [0,1] to centered [-1,1] domain
    vec2 uv = attrA.xy * 2.0 - 1.0;
    vUV = attrA.xy;

    float t = time * 0.4 + audioAdvance * 0.35;

    // Scale spatial coordinates
    vec2 p = uv * 3.5;

    // Triangular Abrikosov-like vortex lattice in macroscopic polariton wavefield
    float vScale = (vortexDensityP > 0.01 ? vortexDensityP : 2.5);
    vec2 q = p * vScale;

    float phaseAcc = 0.0;
    float heightAcc = 0.0;

    for (float i = 1.0; i <= 4.0; i += 1.0) {
        vec2 vPos = vec2(cos(i * 1.57 + t * 0.3), sin(i * 1.57 + t * 0.3)) * (0.8 + 0.3 * sin(t * 0.5 + i));
        vec2 diff = p - vPos;
        float angle = atan(diff.y, diff.x);
        float dist = length(diff);

        // Quantized 2pi vortex winding
        phaseAcc += angle;
        // Vortex core dip
        heightAcc += (1.0 - exp(-dist * dist * 3.0));
    }

    // Superfluid acoustic phonon waves
    float phonons = sin(length(p) * 6.0 - t * 3.0) * 0.15;

    float hScale = (waveHeightP > 0.01 ? waveHeightP : 0.45) * (1.0 + 0.5 * audioSwell);
    float zHeight = (heightAcc * 0.25 - 0.5 + phonons) * hScale;

    // Approximate surface normal
    float dHdx = cos(p.x * 6.0 - t * 3.0) * 0.2;
    float dHdy = cos(p.y * 6.0 - t * 3.0) * 0.2;
    vNormal = normalize(vec3(-dHdx, -dHdy, 1.0));

    vPhase = phaseAcc;
    vCol = imgPalette(fract(phaseAcc * 0.159 + t * 0.05 + audioCentroid));

    vec3 worldPos = vec3(p.x, p.y, zHeight);

    // Camera Transform (V3)
    // Tilt FIRST, then push away.  The old order rotated the already-pushed
    // plate about the CAMERA, which dropped the plate's centre by D*sin(tilt)
    // and left it sitting in the lower half of the frame with black above.
    // Tilting about the plate's own centre keeps it on the view axis, and at
    // this distance it then fills the frame (reported: "bildschirmfuellender").
    vec3 vp = worldPos;
    float tilt = 0.65;
    float c = cos(tilt), s = sin(tilt);
    vp = vec3(vp.x, vp.y * c - vp.z * s, vp.y * s + vp.z * c);
    vp.z += 4.2;
    vp.x -= eyeOff;

    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;
}
