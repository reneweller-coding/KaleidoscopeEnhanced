#version 330 core
/**
 * @file OceanAbyssalBrinePool.vert
 * @brief Vertex stage companion to OceanAbyssalBrinePool.frag -- see that file's header for
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

uniform float brineP;
uniform float haloclineP;
uniform float speedP;   ///< Speed knob, 0..1.
uniform float hueP;   ///< Hue knob (radians), usually the music's chroma hue plus a rolled offset.

out vec3 vWorldPos;   ///< World position (from the vertex stage).
out vec3 vNormal;   ///< Surface normal (from the vertex stage).
out vec2 vTexCoord;   ///< Texture coordinate (from the vertex stage).

/// @brief Entry point of this shader stage (the file description says what it draws).
void main() {
    float brn = (brineP      > 0.0) ? brineP      : 1.0;
    float hlc = (haloclineP  > 0.0) ? haloclineP  : 1.0;
    float spd = (speedP      > 0.0) ? speedP      : 1.0;

    // Scene3DShader supplies attrA.xy in [0,1] for grid/quads geometry;
    // this shader's math assumes a centred [-1,1] domain, so remap it here
    // (otherwise everything lands in one quadrant, off to the side).
    vec2 gridUV = attrA.xy * 2.0 - 1.0;   // [-1,1]
    vTexCoord = gridUV * 0.5 + 0.5;

    float t = time * 0.35 * spd + audioAdvance * 0.18;

    // Brine pool shoreline basin (bowl depression: r > 0.8 is underwater beach, r < 0.8 is dense brine pool)
    float r = length(gridUV) * 2.5;
    float basinDepth = smoothstep(1.5, 0.4, r) * -0.8 * brn;

    // Dense hypersaline internal waves on the brine pool surface
    float internalWave = sin(gridUV.x * 12.0 * hlc + t * 2.0) * cos(gridUV.y * 10.0 - t * 1.5) * 0.08 * (1.0 + audioBass * 0.6);

    float height = basinDepth + internalWave;
    vec3 pos = vec3(gridUV.x * 4.6, height, gridUV.y * 4.6);
    vWorldPos = pos;

    vNormal = normalize(vec3(-gridUV.x * 0.4, 1.0, -gridUV.y * 0.4));

    // Camera: slow ORBIT around the brine basin (yaw), then pitch DOWN onto
    // it (negative tilt — the old +0.45 tipped the pool into a ceiling seen
    // from below), then push away along +z and negate -- projM expects
    // NEGATIVE view-space z (clip-w = -z_view).
    vec3 vp = pos;
    float yaw = time * 0.12 * spd + audioAdvance * 0.06;
    float cy = cos(yaw), sy = sin(yaw);
    vp.xz = mat2(cy, -sy, sy, cy) * vp.xz;
    // Closer and steeper: at 7 units the basin filled half the frame (reported).
    vp.y -= 1.1;
    float camTilt = -0.80;
    float cosT = cos(camTilt), sinT = sin(camTilt);
    vp = vec3(vp.x, vp.y * cosT - vp.z * sinT, vp.y * sinT + vp.z * cosT);
    vp.z += 3.9;
    vp.x -= eyeOff;
    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;
}
