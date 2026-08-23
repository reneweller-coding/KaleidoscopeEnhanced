#version 330 core
/**
 * @file MyceliumNeuralPulse.vert
 * @brief Vertex stage companion to MyceliumNeuralPulse.frag -- see that file's header for
 * this scene's description.
 *
 * Audio Reactivity:
 *   audioAdvance   -> camera orbit around the thicket (pre-integrated phase)
 *   audioKick      -> action-potential firing (in the .comp generator)
 *   audioLowMid    -> harmonic breath: the whole mycelium mat inflates on
 *                     150-500 Hz pad/body warmth and contracts when the
 *                     harmony thins out
 *   audioRoughness -> dissonance tangle: rough/clustered harmony bends every
 *                     strand off its clean radial path through a smooth
 *                     spatial field, so the network visibly snarls
 *
 * NOTE: the compute generator (MyceliumNeuralPulse.comp) is a SEPARATE
 * program and only receives the small hand-picked uniform set in
 * Scene3DShader::runGenerator(), so anything outside that set has to be
 * applied here on the baked geometry instead.
 */
// attrA.xyz = world pos (baked by the compute generator), attrA.w = pulse
// attrB.w   = branchLevel (Scene3DShader.cpp GEOM_INDIRECT, 8-float layout)
in vec4 attrA;
in vec4 attrB;

uniform mat4 projM;
uniform float eyeOff;
uniform float audioAdvance;
uniform float time;
uniform float audioKick;
uniform float audioLowMid;
uniform float audioRoughness;

out vec3 vPos;
out float vPulse;
out float vLevel;

void main() {
    vec3 worldP = attrA.xyz;

    // HARMONIC BREATH: pad/body warmth (150-500 Hz) inflates the mat; a thin
    // harmony lets it settle back.  Pure shape scale -- no time factor.
    worldP *= 1.0 + 0.26 * clamp(audioLowMid, 0.0, 1.0);

    // DISSONANCE TANGLE: a smooth (C1-continuous) spatial field, so every
    // vertex of one hyphae ribbon moves together -- a per-vertex hash here
    // would tear the two-triangle ribbons apart.  Consonant harmony leaves
    // the network clean, rough clusters snarl it.
    vec3 tangle = vec3(sin(worldP.y * 3.1 + worldP.z * 2.3),
                       sin(worldP.z * 2.7 + worldP.x * 3.5),
                       sin(worldP.x * 2.9 + worldP.y * 2.1));
    worldP += tangle * (0.34 * clamp(audioRoughness, 0.0, 1.0));

    vPos = worldP;
    vPulse = attrA.w;
    vLevel = attrB.w;

    // Stereoscopic 3D camera projection
    // ORBIT (user feedback): the camera circles the structure
    vec3 vp = worldP;
    float oyaw = time * 0.12 + audioAdvance * 0.07;
    float ocy = cos(oyaw), osy = sin(oyaw);
    vp.xz = mat2(ocy, -osy, osy, ocy) * vp.xz;
    float opit = -1.00 + 0.08 * sin(time * 0.11);   // look down onto the mycelium mat instead of into the tangle
    float opc = cos(opit), ops = sin(opit);
    vp.yz = mat2(opc, -ops, ops, opc) * vp.yz;
    vp.z += 6.5;
    vp.x -= eyeOff;

    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;
}
