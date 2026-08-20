#version 330 core
/**
 * @file SandDuneBarchanMigration.vert
 * @brief Vertex stage companion to SandDuneBarchanMigration.frag -- see that file's header for
 * this scene's description.
 *
 * Audio Reactivity (geometry; see the .frag header for the shading side):
 *   audioAdvance -> slow downwind migration of the barchan field
 *   audioBass    -> swell of the crescent dune bodies
 *   audioHigh    -> saltation-ripple amplitude
 *   audioZCR     -> SAND GRAIN: the noisiness of the signal is the wind.  A
 *                   clean tone leaves the slip faces smooth; broadband, hissy
 *                   material rakes the whole field into wind ripples -- both
 *                   in the height field AND in the normal, so the ripples
 *                   actually catch the low sun instead of only bumping the
 *                   silhouette
 */
layout(location = 0) in vec4 attrA;
layout(location = 1) in vec4 attrB;

uniform mat4  projM;
uniform float eyeOff;
uniform float time;

uniform float audioPhase;
uniform float audioAdvance;
uniform float audioSwell;
uniform float audioLevel;
uniform float audioKick;
uniform float audioCentroid;
uniform float audioValence;
uniform float audioSubBass;
uniform float audioBass;
uniform float audioMid;
uniform float audioHigh;
uniform float audioFlux;
uniform float audioChromaHue;
uniform float audioZCR;

uniform float duneP;
uniform float rippleP;
uniform float speedP;
uniform float hueP;

out vec3 vWorldPos;
out vec3 vNormal;
out vec2 vTexCoord;

void main() {
    float dne = (duneP   > 0.0) ? duneP   : 1.0;
    float rpl = (rippleP > 0.0) ? rippleP : 1.0;
    float spd = (speedP  > 0.0) ? speedP  : 1.0;

    // Scene3DShader supplies attrA.xy in [0,1] for grid/quads geometry;
    // this shader's math assumes a centred [-1,1] domain, so remap it here
    // (otherwise everything lands in one quadrant, off to the side).
    vec2 gridUV = attrA.xy * 2.0 - 1.0;   // [-1,1]
    vTexCoord = gridUV * 0.5 + 0.5;

    float t = time * 0.35 * spd + audioAdvance * 0.18;

    // Barchan crescent dune profile: crescent horns pointing downwind
    vec2 p = gridUV * vec2(3.5, 3.5) + vec2(t * 0.4, 0.0);
    float crescentY = p.y - sin(p.x * 2.0) * 0.4;
    float duneHeight = max(0.0, sin(p.x * 2.0 * dne) * cos(crescentY * 2.0)) * 1.2 * (1.0 + 0.3 * audioBass);

    // Wind saltation ripples along the windward slope.  The ZERO-CROSSING
    // RATE is the wind: a clean tone leaves the slip faces smooth, hissy
    // broadband material rakes the sand into grain.  Only the AMPLITUDE is
    // audio-driven -- the 35.0 spatial frequency multiplies p.x, which
    // carries the migration time, and must stay a constant.
    float ripAmp  = 0.70 + audioHigh * 0.8 + 1.10 * clamp(audioZCR, 0.0, 1.0);
    float ripPh   = p.x * 35.0 * rpl + p.y * 15.0;
    float ripples = sin(ripPh) * 0.04 * ripAmp;
    duneHeight += ripples;

    vec3 pos = vec3(gridUV.x * 3.5, duneHeight - 0.5, gridUV.y * 3.5);
    vWorldPos = pos;

    // Normal estimation.  The ripple slope goes in too, otherwise the grain
    // exists only in the silhouette -- from this near-overhead camera it has
    // to tilt the surface to be seen at all.
    vNormal = normalize(vec3(-cos(p.x * 2.0) * 0.4 - 0.25 * ripAmp * cos(ripPh),
                             1.0,
                             -sin(crescentY * 2.0) * 0.4));

    // Camera transform: this surface lies in the XZ plane, so pitch it down
    // first (otherwise it is seen edge-on), then push away along +z and negate
    // -- projM expects NEGATIVE view-space z (clip-w = -z_view).
    vec3 vp = pos;
    vp.y -= 1.5;
    float camTilt = -0.5;
    float cosT = cos(camTilt), sinT = sin(camTilt);
    vp = vec3(vp.x, vp.y * cosT - vp.z * sinT, vp.y * sinT + vp.z * cosT);
    vp.z += 7.0;
    vp.x -= eyeOff;
    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;
}
