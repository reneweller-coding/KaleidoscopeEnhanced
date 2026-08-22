#version 330 core
/**
 * @file ChladniAcousticPlate.vert
 * @brief Vertex stage companion to ChladniAcousticPlate.frag -- see that file's header for
 * this scene's description.
 *
 * Audio Reactivity:
 *   audioAdvance   -> slow walk through the Chladni mode numbers (jump-free)
 *   audioBass      -> n mode number + bounce height
 *   audioMid       -> m mode number
 *   audioKick      -> grains jump off the plate and briefly stop settling
 *   audioSpread    -> modal complexity: a pure tone rings a simple low-order
 *                     figure, a broadband spectrum drives high-order lines
 *   audioZCR       -> grain scatter: hiss keeps the sand skittering, a held
 *                     tone lets it settle into razor-sharp nodal lines
 *   audioHarmChange-> a chord change re-tunes the plate; the sand is thrown
 *                     off the lines and has to settle all over again
 */
layout(location = 0) in vec3 inPos;
layout(location = 1) in vec3 inNormal;

uniform mat4 projM;
uniform float eyeOff;
uniform float time;
uniform float audioPhase;
uniform float audioAdvance;
uniform float audioKick;
uniform float audioBass;
uniform float audioMid;
uniform float audioHigh;
uniform float audioSwell;
uniform float audioSpread;       // narrow (pure tone) .. wide (rich/noisy)
uniform float audioZCR;          // signal noisiness -> grain scatter
uniform float audioHarmChange;   // spikes on chord / key changes

out vec3 vPos;
out float vNodalDist;
out float vPlateEnergy;

float hash11(float p) {
    p = fract(p * 0.1031);
    p *= p + 113.17;
    p *= p + p;
    return fract(p);
}

void main() {
    float id = float(gl_VertexID);
    float seedX = hash11(id);
    float seedY = hash11(id + 5000.0);

    // Initial random position on square plate [-1, 1]
    vec2 p = vec2(seedX * 2.0 - 1.0, seedY * 2.0 - 1.0);

    // Chladni modal numbers (m, n) driven by spectrum / audio frequencies.
    // Spectral SPREAD is the plate's modal complexity: a narrow, pure spectrum
    // rings a simple low-order figure, a rich broadband one drives the plate
    // into high-order patterns with many more nodal lines.
    float m = 3.0 + floor(mod(audioAdvance * 0.5 + audioMid * 4.0 + audioSpread * 3.0, 5.0));
    float n = 2.0 + floor(mod(audioAdvance * 0.3 + audioBass * 3.0 + audioSpread * 2.0, 4.0));

    float pi = 3.14159265;
    // Chladni vibration amplitude function
    float w = sin(n * pi * p.x * 0.5) * sin(m * pi * p.y * 0.5) - sin(m * pi * p.x * 0.5) * sin(n * pi * p.y * 0.5);

    // Gradient of vibration field: particles drift down the gradient towards w = 0 (nodal lines)
    float eps = 0.01;
    float wX = (sin(n * pi * (p.x + eps) * 0.5) * sin(m * pi * p.y * 0.5) - sin(m * pi * (p.x + eps) * 0.5) * sin(n * pi * p.y * 0.5) - w) / eps;
    float wY = (sin(n * pi * p.x * 0.5) * sin(m * pi * (p.y + eps) * 0.5) - sin(m * pi * p.x * 0.5) * sin(n * pi * (p.y + eps) * 0.5) - w) / eps;
    vec2 gradW = vec2(wX, wY);

    // Dynamic displacement towards nodal lines.  A chord / key change re-tunes
    // the plate: the grains lose their grip on the lines and have to settle
    // all over again as the new harmony holds.
    float retune = clamp(audioHarmChange, 0.0, 1.0);
    float drift = 0.4 * (1.0 - 0.5 * audioKick) * (1.0 - 0.55 * retune);
    vec2 nodalPos = p - gradW * w * drift;

    // Broadband hiss keeps the sand skittering across the plate; a pure held
    // tone lets it collapse onto razor-sharp nodal lines.  The wobble rides
    // audioPhase (pre-integrated) so the scatter drifts instead of snapping.
    float scatter = clamp(audioZCR, 0.0, 1.0) * 0.22 + retune * 0.10;
    nodalPos += vec2(sin(audioPhase * 3.0 + seedX * 40.0),
                     cos(audioPhase * 2.6 + seedY * 40.0)) * scatter;

    // Bounce height on beat kicks
    float bounce = abs(w) * (0.2 + 0.8 * audioKick) * (0.8 + 0.4 * audioBass);

    vec3 pos = vec3(nodalPos.x * 3.0, bounce - 0.8, nodalPos.y * 3.0);

    vPos = pos;
    vNodalDist = abs(w);
    vPlateEnergy = (1.0 - abs(w)) * (1.0 + audioKick * 2.0);

    // Stereoscopic 3D camera projection with downward plate angle
    vec3 vp = pos;
    float tilt = 0.45;
    float cosT = cos(tilt), sinT = sin(tilt);
    vec3 rotatedVP = vec3(vp.x, vp.y * cosT - vp.z * sinT, vp.y * sinT + vp.z * cosT);

    rotatedVP.z += 5.2;
    rotatedVP.x -= eyeOff;

    gl_Position = projM * vec4(rotatedVP.x, rotatedVP.y, -rotatedVP.z, 1.0);
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;

    gl_PointSize = clamp((5.0 + 5.5 * vPlateEnergy) * (9.5 / rotatedVP.z), 2.0, 34.0);   // sprite sweep
}
