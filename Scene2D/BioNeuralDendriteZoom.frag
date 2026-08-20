#version 330 core
out vec4 fragColor;
/**
 * @file BioNeuralDendriteZoom.frag
 * @brief BIO NEURAL DENDRITE ZOOM: Microscopic continuous dive through a dense
 * bioluminescent neural axon arborization. Luminous synaptic vesicles, action potentials
 * firing like high-voltage electric pulses along dendrites, and glowing soma cell bodies.
 *
 * Audio Reactivity:
 *   audioAdvance -> drives continuous forward plunge along neural axon pathways
 *   audioKick    -> flashes synaptic neurotransmitter bursts & triggers action potential
 *   audioCentroid-> modulates dendrite branching frequency & synapse resolution
 *   audioSubBass -> expands soma neuron cell body diameter breathing
 *   audioChromaHue-> rotates the bioluminescent neural bio-fluorescence spectrum
 */

uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

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

// Per-activation variety
uniform float speedP;
uniform float branchP;
uniform float pulseSpeedP;
uniform float glowP;
uniform float hueP;

vec3 img(vec2 uv) {
    return (interpolation * texture(tex0, uv) + (1.0 - interpolation) * texture(tex1, uv)).rgb;
}

vec3 imgPalette(float t) {
    float ang = audioChromaHue + audioAdvance * 0.04 + t * 6.2831853 + hueP;
    float rad = 0.16 + 0.08 * sin(audioAdvance * 0.013);
    vec3  pc  = img(clamp(vec2(0.5) + rad * vec2(cos(ang), sin(ang)), 0.0, 1.0));
    float pg  = dot(pc, vec3(0.333));
    return mix(vec3(pg), pc, 0.55 + 0.45 * audioValence);
}

// Distance estimator for neural dendrite branching
float mapNeural(vec3 p, float t, float brMod, out float synapseNode) {
    vec3 q = p;
    float d = 1e5;
    synapseNode = 0.0;

    float dendScale = 1.0;
    for (int i = 0; i < 4; i++) {
        // Absolute fold with rotation
        q = abs(q) - vec3(0.4, 0.4, 0.6);
        float cs = cos(0.5 + t * 0.1), sn = sin(0.5 + t * 0.1);
        q.xy = mat2(cs, -sn, sn, cs) * q.xy;

        // Normalise by the scale accumulated SO FAR, not by the loop's
        // final total: dividing every iteration's distance by the same
        // fixed pow(1.45,4) over-shrinks whichever early iteration actually
        // produced the minimum, making the raymarcher hit one step off the
        // camera for nearly every ray -- a flat wash instead of branching
        // dendrites.
        float dBranch = (length(q.xy) - 0.05 * (1.0 + 0.2 * sin(audioSubBass))) / dendScale;
        d = min(d, dBranch);

        synapseNode += exp(-length(q) * 8.0);
        q *= 1.45 * brMod;
        dendScale *= 1.45 * brMod;
    }

    return d;
}

void main() {
    vec2 uv = (gl_FragCoord.xy - 0.5 * resolution.xy) / min(resolution.x, resolution.y);

    float spd = (speedP > 0.01) ? speedP : 1.0;
    float br = (branchP > 0.01) ? branchP : 1.0;
    float pSpd = (pulseSpeedP > 0.01) ? pulseSpeedP : 1.0;
    float glw = (glowP > 0.01) ? glowP : 1.0;

    float t = audioAdvance * 0.35 * spd;

    // Flight camera position through neural network
    vec3 ro = vec3(sin(t * 0.3) * 0.3, cos(t * 0.25) * 0.3, t * 2.2);
    vec3 rd = normalize(vec3(uv, 1.25 + 0.2 * sin(audioSwell * 2.0)));

    // Raymarching
    float totDist = 0.0;
    float minD = 1e4;
    float hitSynapse = 0.0;
    vec3 hitCol = vec3(0.0);

    for (int i = 0; i < 48; i++) {
        vec3 p = ro + rd * totDist;
        float curSynapse;
        float d = mapNeural(p, t, br, curSynapse);
        minD = min(minD, abs(d));

        if (abs(d) < 0.003 || totDist > 8.0) {
            hitSynapse = curSynapse;
            // Action potential pulse firing along axon
            float actionPulse = abs(sin(p.z * 12.0 - t * 8.0 * pSpd));
            float pulseGlow = smoothstep(0.85, 1.0, actionPulse);

            vec2 sampleUV = fract(p.xy * 0.4 + p.z * 0.2 + 0.5);
            vec3 texCol = img(sampleUV);
            vec3 palCol = imgPalette(p.z * 0.15 + hitSynapse * 0.3);

            hitCol = mix(texCol, palCol, 0.45) * (0.6 + 0.4 * (1.0 - d));
            hitCol += vec3(1.7, 1.6, 2.0) * pulseGlow * (1.0 + 2.5 * audioKick);
            break;
        }

        totDist += max(0.015, d * 0.7);
    }

    // Glowing dendrite axons
    float axonGlow = exp(-minD * (24.0 + 12.0 * audioCentroid)) * glw;
    vec3 glowTint = vec3(0.3, 1.4, 1.9) * axonGlow * (1.0 + 2.0 * audioKick);

    vec3 bgCol = imgPalette(length(uv) * 0.4 + 0.1) * (0.2 + 0.15 * audioLevel);
    vec3 finalCol = mix(bgCol, hitCol, clamp(length(hitCol), 0.0, 1.0));
    finalCol += glowTint;

    finalCol = pow(finalCol, vec3(0.88));
    fragColor = vec4(clamp(finalCol, 0.0, 1.0), 1.0);
}
