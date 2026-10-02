#version 330 core
/**
 * @file MetamaterialNegativeRefraction.vert
 * @brief Vertex stage companion to MetamaterialNegativeRefraction.frag -- see that file's header for
 * this scene's description.
 */
layout(location = 0) in vec4 attrA;   ///< Vertex attribute A (meaning per geometry kind, see the stage's header; e.g. position or u/v and an index).
layout(location = 1) in vec4 attrB;   ///< Vertex attribute B (meaning per geometry kind; e.g. normal or per-element seeds).

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

uniform float nP;
uniform float lensP;   ///< Lens knob, 0..1.
uniform float speedP;   ///< Speed knob, 0..1.
uniform float hueP;   ///< Hue knob (radians), usually the music's chroma hue plus a rolled offset.

out vec3 vWorldPos;   ///< World position (from the vertex stage).
out vec3 vNormal;   ///< Surface normal (from the vertex stage).
out vec2 vTexCoord;   ///< Texture coordinate (from the vertex stage).
out float vPhaseVelocity;

/// @brief Entry point of this shader stage (the file description says what it draws).
void main() {
    float nVal = (nP     > 0.0) ? nP     : 1.0;
    float lns  = (lensP  > 0.0) ? lensP  : 1.0;
    float spd  = (speedP > 0.0) ? speedP : 1.0;

    // Scene3DShader supplies attrA.xy in [0,1] for grid/quads geometry;
    // this shader's math assumes a centred [-1,1] domain, so remap it here
    // (otherwise everything lands in one quadrant, off to the side).
    vec2 gridUV = attrA.xy * 2.0 - 1.0;   // [-1,1]
    vTexCoord = gridUV * 0.5 + 0.5;

    float t = time * 0.45 * spd + audioAdvance * 0.22;

    // Interface at gridUV.y = 0: positive index region (y > 0), negative index metamaterial (y < 0)
    float isNegative = (gridUV.y < 0.0) ? -1.0 : 1.0;
    vPhaseVelocity = isNegative;

    // Backwards phase velocity in negative index medium: k_y flips sign!
    float kx = gridUV.x * 12.0 * lns;
    float ky = abs(gridUV.y) * 12.0 * nVal;
    float wavePhase = (isNegative > 0.0) ? (kx + ky - t * 4.0) : (kx - ky - t * 4.0);

    // Negative refraction superlens focusing peak at y = -0.5
    float superlensFocus = exp(-length(vec2(gridUV.x * 2.0, gridUV.y + 0.5)) * 6.0);

    float height = sin(wavePhase) * 0.35 * (1.0 + 0.3 * audioBass) + superlensFocus * (0.6 + audioKick * 0.8);
    vec3 pos = vec3(gridUV.x * 4.6, height, gridUV.y * 4.6);
    vWorldPos = pos;

    vNormal = normalize(vec3(-cos(wavePhase) * 0.4, 1.0, -isNegative * sin(wavePhase) * 0.4));

    // Camera transform: this surface lies in the XZ plane, so pitch it down
    // first (otherwise it is seen edge-on), then push away along +z and negate
    // -- projM expects NEGATIVE view-space z (clip-w = -z_view).
    // Closer and steeper than before: at 7 units and -0.45 the plate covered
    // about half the frame with black above (reported).
    vec3 vp = pos;
    vp.y -= 1.0;
    float camTilt = -0.80;
    float cosT = cos(camTilt), sinT = sin(camTilt);
    vp = vec3(vp.x, vp.y * cosT - vp.z * sinT, vp.y * sinT + vp.z * cosT);
    vp.z += 4.0;
    vp.x -= eyeOff;
    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;
}
