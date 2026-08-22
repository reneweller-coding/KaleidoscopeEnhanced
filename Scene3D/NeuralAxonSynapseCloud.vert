#version 330 core
/**
 * @file NeuralAxonSynapseCloud.vert
 * @brief 60,000 particles (geom="points") simulating the human cerebral cortex connectome.
 * Action potentials race along axonal pathways, igniting synaptic neurotransmitter
 * flares in an interactive 3D neural cloud.
 *
 * Three quarters of the particles build the clusters; the remaining quarter
 * become the FAR CORTICAL HAZE, laid out in frustum coordinates so the
 * picture is filled at every depth instead of only where the compact ball of
 * clusters happens to be. audioSwell lifts that haze, and audioSpectrum bands
 * it the same way it bands the clusters.
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

    // The scene projection: 55 deg vertical FOV (see Scene3DShader::draw).
    const float kTanY = 0.5206;
    float aspect = (resolution.y > 0.5) ? resolution.x / resolution.y : 1.7778;

    // ---- FAR CORTICAL HAZE --------------------------------------------
    // A quarter of the particles are pulled out of the clusters and laid out
    // in FRUSTUM coordinates -- x and y scaled by their own depth -- across a
    // wide range of distances.  The connectome itself is a compact ball
    // however big it is made, so on its own it left the frame's corners
    // black; this is the diffuse tissue it is embedded in.
    if (attrB.w < 0.25)
    {
        float hx = seed.x, hy = seed.y, hz = seed.z;
        float dz = 11.0 + hz * 82.0;
        float ph = hx * 6.2831853 + time * 0.06 + audioAdvance * 0.05;
        float open = 2.3;   // 2.0 fits the frustum exactly; 2.3 covers the rig's roll
        vec3 hp = vec3((hx - 0.5) * open * dz * kTanY * aspect + 1.5 * cos(ph),
                       (hy - 0.5) * open * dz * kTanY          + 1.5 * sin(ph * 0.79),
                       dz);

        vec3 hcol = mix(vec3(0.0, 0.85, 1.0), vec3(0.7, 0.15, 1.0), hy);
        hcol *= (0.55 + 0.95 * hx) * (0.75 + 0.5 * audioSwell)
              * (1.0 + 0.5 * audioSpectrum[int(clamp(hy * 31.0, 0.0, 31.0))])
              * clamp(1.0 - dz / 120.0, 0.0, 1.0);
        vColor = vec4(min(hcol, vec3(1.4)), 1.0);

        vec3 hv = hp;
        hv.x -= eyeOff;
        gl_Position = projM * vec4(hv.x, hv.y, -hv.z, 1.0);
        gl_Position.x += eyeOff * 0.045 * gl_Position.w;
        if (hv.z < 0.4)
            gl_Position = vec4(0.0, 0.0, -3.0, 1.0);

        // A speck must stay legible at any distance -- below about 2.5 px an
        // additive sprite averages away to nothing and the far field reads
        // black again.
        gl_PointSize = clamp(133.3 * (0.5 + 1.0 * hz) / max(hv.z, 1.0), 2.6, 27.4);   // sprite sweep 2026-08-22: measured luma 0.048, area x2.9
        vSize = gl_PointSize;
        return;
    }

    // Connectome cortical column coordinates.  Widened: at 2.2 units the ring
    // of clusters filled barely half the frame's width.
    float clusterID = floor(id / 3000.0); // 20 cortical clusters
    float clusterAngle = clusterID * (6.2831853 / 20.0);
    vec3 clusterCenter = vec3(cos(clusterAngle), sin(clusterAngle), sin(clusterID * 1.5)) * (3.1 * neu);

    // Dendritic branching within cluster
    float inClusterID = mod(id, 3000.0);
    float branchAngle = inClusterID * 0.15 + t * 0.2;
    float branchR = sqrt(inClusterID / 3000.0) * 2.1;

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
    // The resting floor was cut so far, though (0.10, on a 3 px sprite) that
    // five sixths of the connectome contributed essentially nothing and the
    // cloud measured near-black between its flashes.  Raised, with a hard cap
    // on the peak so a kick still cannot take the whole cloud to white.
    // Resting floor and firing peak BOTH raised, and the gap between them
    // widened: the previous pass balanced the exposure but left the whole cloud
    // inside a narrow band (measured luma 0.024, contrast 0.044). Contrast here
    // is the distance between a resting neuron and a firing one, so the peak is
    // lifted more than the floor. The hard cap still stops a kick taking the
    // whole connectome to white.
    float brightness = min(0.30 + 1.35 * isSynapse + 0.55 * clusterEnergy
                           + 1.0 * cognitiveSurge, 3.0);
    // Cap the TINTED colour, not the scalar that fed it.
    vColor = vec4(min(synCol * brightness, vec3(2.2)), 1.0);

    // Stereo 3D camera projection
    vec3 vp = pos;
    vp.z += 6.5;
    vp.x -= eyeOff;
    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;

    // Perspective point size — small on purpose: sprite AREA is what the
    // additive sum integrates, so radius is the real exposure control here.
    float baseSize = (5.5 + 7.0 * isSynapse + 8.0 * cognitiveSurge);
    gl_PointSize = clamp(baseSize * (6.5 / max(vp.z, 1.0)), 2.2, 22.0);
    vSize = gl_PointSize;
}
