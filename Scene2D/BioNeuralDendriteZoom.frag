#version 330 core
out vec4 fragColor;
/**
 * @file BioNeuralDendriteZoom.frag
 * @brief BIO NEURAL DENDRITE ZOOM: Microscopic continuous dive through a dense
 * bioluminescent neural axon arborization. Luminous synaptic vesicles, action potentials
 * firing like high-voltage electric pulses along dendrites, and glowing soma cell bodies.
 *
 * Audio Reactivity:
 *   audioAdvance -> surges the forward plunge along the axon on top of a steady flight
 *   audioKick    -> flashes synaptic neurotransmitter bursts & triggers action potential
 *   audioCentroid-> tightens the axon halo around rays that miss the arborization
 *   audioSubBass -> expands soma neuron cell body diameter breathing
 *   audioSwell   -> field of view of the dive
 *   audioLevel   -> brightness of the neuropil behind the branches
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

// Overall level of the photo currently on the texture units, from a fixed
// 5-tap grid. Every base colour here is photo-derived, so a bright photo left
// the action-potential and axon glows no headroom at all. The probe rides the
// tex0/tex1 crossfade, so the gain it feeds can never pop, and being one
// number for the whole frame it rescales exposure without touching local
// contrast.
float photoLevel() {
    vec3 s = img(vec2(0.25, 0.25)) + img(vec2(0.75, 0.25))
           + img(vec2(0.25, 0.75)) + img(vec2(0.75, 0.75))
           + img(vec2(0.50, 0.50));
    return dot(s * 0.2, vec3(0.299, 0.587, 0.114));
}

// World scale of the arborization. At 1.0 the tube lattice sat so close to
// the flight path that the median ray landed 0.14 units from the camera --
// one unlit tube wall filling the whole frame, which is exactly why the
// picture read as a single flat bright field. Building the lattice in a
// half-scale coordinate (and converting the distance back with the same
// factor, so the estimator stays correct) doubles the tube spacing AND the
// tube radius: the median hit now sits at 0.62 with a p95 of 2.5, so there is
// a real depth range for the light to fall off across.
const float NEURAL_WS = 0.5;

// Distance estimator for neural dendrite branching
float mapNeural(vec3 p, float t, float brMod, out float synapseNode) {
    vec3 q = p * NEURAL_WS;
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

    return d / NEURAL_WS;
}

// Surface normal by the 4-tap tetrahedron trick -- the arborization had NO
// surface shading at all before (the only depth term, 0.6 + 0.4*(1.0-d), is
// evaluated at the hit where d is the 0.003 epsilon, i.e. a constant 0.999),
// so every lit tube came out the same brightness no matter which way it faced.
vec3 neuralNormal(vec3 p, float t, float brMod) {
    const vec2 k = vec2(1.0, -1.0);
    const float e = 0.0025;
    float s;
    vec3 g = k.xyy * mapNeural(p + k.xyy * e, t, brMod, s)
           + k.yyx * mapNeural(p + k.yyx * e, t, brMod, s)
           + k.yxy * mapNeural(p + k.yxy * e, t, brMod, s)
           + k.xxx * mapNeural(p + k.xxx * e, t, brMod, s);
    // Guarded, not normalize(): a miss leaves hitP at the origin and a
    // degenerate gradient there would hand back NaN, which mix() propagates
    // even when the hit mask is zero (NaN * 0.0 is still NaN).
    return g / max(length(g), 1e-6);
}

void main() {
    vec2 uv = (gl_FragCoord.xy - 0.5 * resolution.xy) / min(resolution.x, resolution.y);

    float spd = (speedP > 0.01) ? speedP : 1.0;
    float br = (branchP > 0.01) ? branchP : 1.0;
    float pSpd = (pulseSpeedP > 0.01) ? pulseSpeedP : 1.0;
    float glw = (glowP > 0.01) ? glowP : 1.0;

    // audioAdvance integrates at only ~0.1 units/s, far too slow to carry a
    // "continuous dive" on its own. A CONSTANT coefficient on `time` supplies
    // the steady plunge and the audio phase is ADDED on top (anti-flicker:
    // no audio value ever multiplies `time`).
    float t = time * 0.06 * spd + audioAdvance * 0.35 * spd;

    // Flight camera position through neural network
    vec3 ro = vec3(sin(t * 0.3) * 0.3, cos(t * 0.25) * 0.3, t * 2.2);
    vec3 rd = normalize(vec3(uv, 1.25 + 0.2 * sin(audioSwell * 2.0)));

    // Hold the neuropil back to a fixed dark base: a bioluminescent axon only
    // reads if the tissue around it is dark, and with a bright photo the
    // mix(texCol, palCol) base alone already sat near 1.0 so the firing pulses
    // had nowhere left to go.
    float expGain = clamp(0.30 / max(0.05, photoLevel()), 0.20, 1.6);

    // Raymarching
    float totDist = 0.0;
    float minD = 1e4;
    float hitSynapse = 0.0;
    float hitDist = 0.0;
    vec3  hitP = vec3(0.0);
    // Composite on an explicit hit flag, not on length(hitCol): once the base
    // is held down to a dark exposure a legitimately dark dendrite has a short
    // colour vector, and a length() mask would fade those branches back into
    // the background.
    float hitMask = 0.0;

    for (int i = 0; i < 48; i++) {
        vec3 p = ro + rd * totDist;
        float curSynapse;
        float d = mapNeural(p, t, br, curSynapse);
        minD = min(minD, abs(d));

        // A ray that runs past the far limit is a MISS. Flagging it as a hit
        // (the old `|| totDist > 8.0` inside the same branch) shaded empty
        // space with surface colour and left nothing for the background.
        if (totDist > 8.0) break;

        if (abs(d) < 0.003) {
            hitMask = 1.0;
            hitSynapse = curSynapse;
            hitDist = totDist;
            hitP = p;
            break;
        }

        totDist += max(0.015, d * 0.7);
    }

    // ---- SURFACE SHADING -------------------------------------------------
    // Normal + headlight + key light + inverse-square falloff. This is the
    // local light/dark separation the scene never had.
    vec3  n     = neuralNormal(hitP, t, br);
    float head  = clamp(dot(-rd, n), 0.0, 1.0);
    float key   = clamp(dot(n, vec3(0.55, 0.66, -0.51)), 0.0, 1.0);
    float atten = 1.0 / (1.0 + 0.8 * hitDist * hitDist);
    float shade = 0.10 + 0.75 * head * atten + 0.35 * key * atten;

    // Action potential pulse firing along the axon
    float actionPulse = abs(sin(hitP.z * 12.0 - t * 8.0 * pSpd));
    float pulseGlow = smoothstep(0.82, 1.0, actionPulse);

    vec2 sampleUV = fract(hitP.xy * 0.4 + hitP.z * 0.2 + 0.5);
    vec3 texCol = img(sampleUV);
    vec3 palCol = imgPalette(hitP.z * 0.15 + hitSynapse * 0.3);

    vec3 hitCol = mix(texCol, palCol, 0.45) * (0.9 * shade * expGain);

    // Luminous synaptic vesicles: hitSynapse is the accumulated exp(-|q|*8)
    // around the fold nodes, so unlike minD it genuinely varies across the
    // surface -- squared so only the node cores light up.
    float ves = clamp(hitSynapse * 0.55, 0.0, 1.0);
    hitCol += min(vec3(0.9, 1.5, 1.9) * (ves * ves * 0.30), vec3(0.27, 0.45, 0.57));
    // The tint constant exceeds 1.0 on every channel, so the TINTED vector
    // carries the cap. Gated on `head` so the pulse rides the facing surface
    // instead of painting a flat band across grazing geometry.
    hitCol += min(vec3(1.7, 1.6, 2.0) * pulseGlow * head * (0.55 + 1.6 * audioKick),
                  vec3(0.68, 0.64, 0.80));

    // Glowing dendrite axons -- HALO AROUND THE MISSES ONLY.
    // This was the single biggest defect in the scene: 97% of rays terminate
    // on abs(d) < 0.003, so for 97% of the frame minD WAS the hit epsilon and
    // exp(-minD*30) evaluated to a constant (measured p5/p50/p95 =
    // 0.916/0.954/0.995). The vec3(0.95)-capped result was therefore a
    // frame-wide additive term of luma 0.918 with a standard deviation of
    // 0.007 -- a perfectly uniform bright wash pasted over a picture whose own
    // structure had a healthy std of 0.31. That is the whole of luma 0.63 /
    // contrast 0.05 / occ 0.09. A closest-approach glow only means anything
    // for a ray that never lands, so gate it on exactly that.
    float axonGlow = exp(-minD * (24.0 + 12.0 * audioCentroid)) * glw * (1.0 - hitMask);
    vec3 glowTint = min(vec3(0.3, 1.4, 1.9) * axonGlow * 0.55 * (1.0 + 2.0 * audioKick),
                        vec3(0.15, 0.70, 0.95));

    // Neuropil behind the arborization: dark cytoplasm, so the bioluminescent
    // branches read as bright strokes on it rather than being level with it.
    vec3 bgCol = imgPalette(length(uv) * 0.4 + 0.1) * (0.10 * expGain) * (0.55 + 0.35 * audioLevel);
    vec3 finalCol = mix(bgCol, hitCol, hitMask);
    finalCol += glowTint;

    // No gamma lift: pow(finalCol, 0.88) raised the dark neuropil by a fifth,
    // which is the end of the picture that has to stay dark.
    vec3 _catTone = clamp(finalCol, 0.0, 1.0);
    _catTone /= 1.0 + 0.28 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(_catTone, 1.0);
}
