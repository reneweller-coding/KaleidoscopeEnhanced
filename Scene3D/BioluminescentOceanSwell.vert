#version 330 core
/**
 * @file BioluminescentOceanSwell.vert
 * @brief attrA.xy = u, w (0..1), attrA.w = cell ID, attrB = seeds (GEOM_GRID).
 */
in vec4 attrA;   ///< Vertex attribute A (meaning per geometry kind, see the stage's header; e.g. position or u/v and an index).
in vec4 attrB;   ///< Vertex attribute B (meaning per geometry kind; e.g. normal or per-element seeds).

uniform mat4 projM;   ///< Projection matrix.
uniform float eyeOff;   ///< Stereo eye offset (0 in mono).
uniform float time;   ///< Seconds since the program started (never reset; see sceneTime).
uniform float audioPhase;   ///< Rotation phase driven by the music (integrated, never jumps).
uniform float audioAdvance;   ///< The music's advance: integrated tempo-weighted energy (never jumps, never runs backwards).
uniform float audioKick;   ///< Kick-drum envelope, 0..1 (fast attack, short decay).
uniform float audioBass;   ///< Bass band level, 0..1.
uniform float audioMid;   ///< Mid band level, 0..1.
uniform float audioHigh;   ///< High band level, 0..1.
uniform float audioSwell;   ///< Slow loudness envelope, 0..1 (seconds).

out vec3 vPos;   ///< Position (from the vertex stage).
out vec3 vNormal;   ///< Surface normal (from the vertex stage).
out vec2 vUV;   ///< Texture coordinate 0..1 over the screen (from the vertex stage).
out float vCrest;
out float vHeight;

/// Gerstner wave function
vec3 gerstnerWave(vec2 p, vec2 dir, float steepness, float wavelength, float speed, inout vec3 normal) {
    float k = 6.2831853 / wavelength;
    float c = sqrt(9.8 / k) * speed;
    float f = k * (dot(dir, p) - c * time - audioAdvance * 0.2);
    float a = steepness / k;

    normal.x -= dir.x * (steepness * cos(f));
    normal.y -= steepness * sin(f);
    normal.z -= dir.y * (steepness * cos(f));

    return vec3(
        dir.x * (a * cos(f)),
        a * sin(f),
        dir.y * (a * cos(f))
    );
}

/// @brief Entry point of this shader stage (the file description says what it draws).
void main() {
    vec2 uv = attrA.xy;
    vec2 worldXZ = (uv - vec2(0.5)) * vec2(16.0, 10.0);

    // FLIGHT: the wave field scrolls beneath the camera, so we glide
    // forward over open water (audioAdvance = jump-free music push).
    vec2 flow = vec2(0.18, 0.85) * (time * 0.5 + audioAdvance * 0.6);
    vec2 wp = worldXZ + flow;

    vec3 n = vec3(0.0, 1.0, 0.0);
    vec3 disp = vec3(0.0);

    float amp = (0.7 + 0.6 * audioBass) * (0.8 + 0.4 * audioSwell);

    // Superposition of 4 Gerstner wave harmonics
    disp += gerstnerWave(wp, normalize(vec2( 1.0,  0.2)), 0.30 * amp, 3.2, 0.6, n);
    disp += gerstnerWave(wp, normalize(vec2( 0.7,  0.7)), 0.22 * amp, 2.1, 0.8, n);
    disp += gerstnerWave(wp, normalize(vec2(-0.4,  0.9)), 0.15 * amp, 1.4, 1.1, n);
    disp += gerstnerWave(wp, normalize(vec2( 0.9, -0.3)), 0.10 * amp, 0.8, 1.5, n);

    // Beat splash impulse
    float splash = sin(length(worldXZ) * 4.0 - time * 6.0) * audioKick * 0.4;
    disp.y += splash;

    vec3 pos = vec3(worldXZ.x + disp.x, disp.y - 2.2, worldXZ.y + disp.z);
    n = normalize(n);

    // Wave crest sharpness for bioluminescent foam emission
    float crest = clamp(disp.y * 1.8 + (1.0 - n.y) * 2.0, 0.0, 3.0);

    vPos = pos;
    vNormal = n;
    vUV = uv;
    vCrest = crest;
    vHeight = disp.y;

    // Stereoscopic 3D camera projection.  NEGATIVE tilt = the camera looks
    // DOWN onto the swell (the old +0.38 tipped the ocean into a ceiling
    // seen from below), with a gentle glide-bob.
    vec3 vp = pos;
    vp.y += 0.15 * sin(time * 0.4);
    float tiltAngle = -0.35;
    float cosT = cos(tiltAngle), sinT = sin(tiltAngle);
    vec3 rotatedVP = vec3(vp.x, vp.y * cosT - vp.z * sinT, vp.y * sinT + vp.z * cosT);

    rotatedVP.z += 6.5;
    rotatedVP.x -= eyeOff;

    gl_Position = projM * vec4(rotatedVP.x, rotatedVP.y, -rotatedVP.z, 1.0);
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;
}
