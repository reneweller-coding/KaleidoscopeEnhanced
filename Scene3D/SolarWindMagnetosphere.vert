#version 330 core
/**
 * @file SolarWindMagnetosphere.vert
 * @brief 220x120 heightfield grid (geom="grid") simulating a planetary magnetosphere
 * bow shock in the supersonic solar wind with auroral emission curtains.
 */

layout(location = 0) in vec4 attrA; ///< xy = grid UV [0,1], w = cell ID
layout(location = 1) in vec4 attrB; ///< seeds

uniform mat4  projM;   ///< Projection matrix.
uniform float eyeOff;   ///< Stereo eye offset (0 in mono).
uniform float time;   ///< Seconds since the program started (never reset; see sceneTime).

uniform float audioPhase;   ///< Rotation phase driven by the music (integrated, never jumps).
uniform float audioAdvance;   ///< The music's advance: integrated tempo-weighted energy (never jumps, never runs backwards).
uniform float audioSwell;   ///< Slow loudness envelope, 0..1 (seconds).
uniform float audioLevel;   ///< Overall loudness, 0..1.
uniform float audioKick;   ///< Kick-drum envelope, 0..1 (fast attack, short decay).
uniform float audioCentroid;   ///< Spectral centroid (brightness of the sound), 0..1.
uniform float audioValence;   ///< Mood valence: 0 dark .. 1 bright.
uniform float audioSubBass;   ///< Sub-bass band level, 0..1.
uniform float audioBass;   ///< Bass band level, 0..1.
uniform float audioMid;   ///< Mid band level, 0..1.
uniform float audioHigh;   ///< High band level, 0..1.
uniform float audioFlux;   ///< Spectral flux (how fast the spectrum changes), 0..1.
uniform float audioChromaHue;   ///< Hue of the dominant pitch class (radians, unwrapped: continuous).

uniform float bowShockP;
uniform float auroraP;
uniform float speedP;   ///< Speed knob, 0..1.
uniform float hueP;   ///< Hue knob (radians), usually the music's chroma hue plus a rolled offset.

out vec3 vNormal;   ///< Surface normal (from the vertex stage).
out vec2 vTexCoord;   ///< Texture coordinate (from the vertex stage).
out vec4 vColor;
out float vHeight;

/// @brief Entry point of this shader stage (the file description says what it draws).
void main() {
    float bsp = (bowShockP > 0.0) ? bowShockP : 1.0;
    float aur = (auroraP   > 0.0) ? auroraP   : 1.0;
    float spd = (speedP    > 0.0) ? speedP    : 1.0;

    vec2 uv = attrA.xy;
    vTexCoord = uv;

    // Grid world coordinates
    vec2 p = (uv - vec2(0.5)) * vec2(8.0, 5.0);

    float t = time * 0.4 * spd + audioAdvance * 0.2;

    // Magnetopause bow shock curve (parabolic shield facing supersonic solar wind)
    float r = length(p);
    float bowCurve = -0.3 * (p.x * p.x) + 1.2;
    
    // Magnetic dipole field line displacement
    float dipoleField = sin(p.x * 3.0 + t) * cos(p.y * 2.0 - t * 0.5) * (0.8 + 0.6 * audioBass);
    
    // Auroral curtain oscillations (Kelvin-Helmholtz waves)
    float khWave = sin(p.x * 6.0 - time * 6.0) * sin(p.y * 4.0 + audioPhase);
    float auroraHeight = khWave * (0.5 + 1.0 * audioHigh) * aur;

    // Solar wind compression on kick
    float solarSurge = exp(-abs(p.y - bowCurve) * 2.0) * audioKick * 0.8 * bsp;

    float z = (dipoleField + auroraHeight + solarSurge) * (0.7 + 0.3 * audioSwell);
    vHeight = z;

    vec3 pos = vec3(p.x, p.y * 0.8 - 0.2, z);

    // Approximate surface normal via finite difference derivatives
    float dx = cos(p.x * 3.0 + t) * cos(p.y * 2.0 - t * 0.5) * 3.0;
    float dy = -sin(p.x * 3.0 + t) * sin(p.y * 2.0 - t * 0.5) * 2.0;
    vNormal = normalize(vec3(-dx, -dy, 1.0));

    // Auroral colors: Oxygen emerald (557.7nm) & Nitrogen crimson (630nm)
    vec3 emerald = vec3(0.1, 1.0, 0.5);
    vec3 crimson = vec3(1.0, 0.1, 0.4);
    vec3 auroralCol = mix(emerald, crimson, sin(p.x * 2.0 + t) * 0.5 + 0.5);

    vColor = vec4(auroralCol * (0.8 + 1.2 * abs(z)), 1.0);

    // Stereo 3D camera projection
    vec3 vp = pos;
    vp.z += 6.5;
    vp.x -= eyeOff;
    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;
}
