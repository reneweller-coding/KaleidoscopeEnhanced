#version 330 core
/**
 * @file NeuralAxonSynapseCloud.vert
 * @brief 60,000 particles (geom="points") simulating the human cerebral cortex connectome.
 * Action potentials race along axonal pathways, igniting synaptic neurotransmitter
 * flares in an interactive 3D neural cloud.
 */

layout(location = 0) in vec4 attrA; // w = point ID [0..59999]
layout(location = 1) in vec4 attrB; // seeds

uniform mat4  projM;
uniform float eyeOff;
uniform float time;
uniform vec2  resolution;

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
uniform float audioSpectrum[32];

uniform float neuralP;
uniform float pulseP;
uniform float speedP;
uniform float hueP;

out vec4 vColor;
out float vSize;

void main() {
    float neu = (neuralP > 0.0) ? neuralP : 1.0;
    float pls = (pulseP  > 0.0) ? pulseP  : 1.0;
    float spd = (speedP  > 0.0) ? speedP  : 1.0;

    float id = attrA.w;
    vec3 seed = attrB.xyz;

    float t = time * 0.4 * spd + audioAdvance * 0.2;

    // Connectome cortical column coordinates
    float clusterID = floor(id / 3000.0); // 20 cortical clusters
    float clusterAngle = clusterID * (6.2831853 / 20.0);
    vec3 clusterCenter = vec3(cos(clusterAngle), sin(clusterAngle), sin(clusterID * 1.5)) * (2.2 * neu);

    // Dendritic branching within cluster
    float inClusterID = mod(id, 3000.0);
    float branchAngle = inClusterID * 0.15 + t * 0.2;
    float branchR = sqrt(inClusterID / 3000.0) * 1.6;

    vec3 localPos = vec3(
        cos(branchAngle) * branchR,
        sin(branchAngle) * branchR,
        sin(inClusterID * 0.3) * 0.8
    );

    // Axon action potential travel
    float actionProg = fract(t * 1.5 + inClusterID * 0.005);
    float isSynapse = exp(-abs(actionProg - 0.5) * 20.0);

    // Spectrum excitation per cluster
    int specIdx = int(clamp(clusterID * 1.5, 0.0, 31.0));
    float clusterEnergy = audioSpectrum[specIdx];

    // Global cognitive wave surge on kick
    float cognitiveSurge = exp(-length(localPos) * 2.0) * audioKick * 1.5 * pls;

    vec3 pos = clusterCenter + localPos * (1.0 + 0.3 * audioBass);

    // 3D rotation of connectome
    float rotY = t * 0.3 + audioPhase * 0.1;
    float cy = cos(rotY), sy = sin(rotY);
    pos.xz = vec2(pos.x * cy - pos.z * sy, pos.x * sy + pos.z * cy);

    // Synapse neurotransmitter colors: Cyan (GABA), Violet (Glutamate), Golden-Amber (Dopamine)
    vec3 gabaCyan     = vec3(0.0, 0.85, 1.0);
    vec3 gluViolet    = vec3(0.7, 0.15, 1.0);
    vec3 dopaGold     = vec3(1.0, 0.85, 0.2);

    vec3 synCol = mix(gabaCyan, gluViolet, sin(id * 0.1) * 0.5 + 0.5);
    synCol = mix(synCol, dopaGold, isSynapse);

    // Redesign after the white-out diagnosis: gain cuts alone can never fix
    // this scene — 60k sprites at up to 64 px meant >100x additive overdraw,
    // so the fix is AREA (quadratic) plus dim resting neurons, not brightness.
    float brightness = (0.10 + 0.9 * isSynapse + 0.5 * clusterEnergy + 1.0 * cognitiveSurge);
    vColor = vec4(synCol * brightness, 1.0);

    // Stereo 3D camera projection
    vec3 vp = pos;
    vp.z += 6.5;
    vp.x -= eyeOff;
    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;

    // Perspective point size — small on purpose: sprite AREA is what the
    // additive sum integrates, so radius is the real exposure control here.
    float baseSize = (3.0 + 6.0 * isSynapse + 7.0 * cognitiveSurge);
    gl_PointSize = clamp(baseSize * (6.5 / max(vp.z, 1.0)), 1.5, 20.0);
    vSize = gl_PointSize;
}
