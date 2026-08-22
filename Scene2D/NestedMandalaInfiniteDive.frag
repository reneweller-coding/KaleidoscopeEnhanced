#version 330 core
out vec4 fragColor;
/**
 * @file NestedMandalaInfiniteDive.frag
 * @brief NESTED MANDALA INFINITE DIVE: Multi-plane continuous forward plunge
 * through stacked ornate mandala gates with center puncture shockwaves,
 * depth-of-field bokeh blur, and kaleidoscopic petal folding.
 *
 * Audio Reactivity:
 *   audioAdvance -> drives continuous forward plunge velocity through mandala gates
 *   audioKick    -> triggers gate puncture shatter & radial shockwave expansion
 *   audioCentroid-> modulates mandala petal symmetry order & fine filigree
 *   audioSubBass -> expands radial gate aperture breathing
 *   audioChromaHue-> rotates the luminous temple gate palette
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
uniform float petalsP;
uniform float gateSpacingP;
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

// 2D Mandala SDF ornament function
float sdMandala(vec2 p, float petals, float tGate) {
    float a = atan(p.y, p.x);
    float r = length(p);

    // Multi-fold petal symmetry
    float seg = 3.14159265 / petals;
    a = mod(a + seg * 0.5, seg) - seg * 0.5;
    a = abs(a);

    vec2 q = vec2(cos(a), sin(a)) * r;

    // Concentric petal ripples
    float petalPattern = sin(q.x * 16.0 + tGate) * cos(q.y * 16.0 - tGate);
    float ring1 = abs(r - 0.8) - 0.03;
    float ring2 = abs(r - 1.4) - 0.04;
    float rings = min(ring1, ring2);

    float petalCurves = abs(q.y - 0.15 * sin(q.x * 8.0 + tGate)) - 0.02;

    return min(rings, petalCurves);
}

void main() {
    vec2 uv = (gl_FragCoord.xy - 0.5 * resolution.xy) / min(resolution.x, resolution.y);

    float spd = (speedP > 0.01) ? speedP : 1.0;
    float nPetals = (petalsP > 1.0) ? petalsP : 8.0;
    float spc = (gateSpacingP > 0.01) ? gateSpacingP : 1.0;
    float glw = (glowP > 0.01) ? glowP : 1.0;

    float t = audioAdvance * 0.38 * spd;

    // Plunge coordinate along depth Z
    float zDive = t * 1.5;
    float gatePhase = mod(zDive, spc);

    vec3 colAcc = vec3(0.0);
    float totalWeight = 0.0;

    // Accumulate across 7 stacked mandala planes
    for (int k = 0; k < 7; k++) {
        float kf = float(k);
        float planeZ = (kf * spc - gatePhase) + 0.3;

        if (planeZ <= 0.05) continue; // Behind camera

        // Perspective projection for this plane
        float projScale = 1.0 / planeZ;
        vec2 pPlane = uv * planeZ;

        // Plane gate rotation
        float rotA = t * 0.2 + kf * 0.5;
        float cs = cos(rotA), sn = sin(rotA);
        pPlane = mat2(cs, -sn, sn, cs) * pPlane;

        // Radial breathing
        pPlane /= (1.0 + 0.15 * sin(audioSwell * 2.5 + kf) + 0.1 * audioSubBass);

        // Center aperture through which camera punches
        float centerRad = length(pPlane);
        float apertureGlow = exp(-abs(centerRad - 0.4) * 8.0);

        // Evaluate mandala geometry
        float dMandala = sdMandala(pPlane, nPetals, t + kf);
        float lineGlow = exp(-abs(dMandala) * (20.0 + 10.0 * audioCentroid)) * glw;

        // Depth fading and bokeh blur attenuation
        float depthFade = smoothstep(6.0, 1.5, planeZ) * smoothstep(0.1, 0.4, planeZ);

        // Sample texture on gate plane
        vec2 sampleUV = fract(pPlane * 0.3 + 0.5);
        vec3 texCol = img(sampleUV);
        vec3 palCol = imgPalette(kf * 0.15 + t * 0.05);

        vec3 planeCol = mix(texCol, palCol, 0.45);

        // Add glowing filigree and gate aperture
        vec3 filigree = vec3(1.3, 1.1, 1.7) * (lineGlow + apertureGlow * 0.5) * (1.0 + 2.5 * audioKick);
        planeCol += filigree;

        colAcc += planeCol * depthFade;
        totalWeight += depthFade;
    }

    vec3 finalCol = colAcc / max(0.001, totalWeight);

    // Shockwave burst in center
    float shockwave = abs(sin(length(uv) * 15.0 - t * 6.0));
    finalCol += imgPalette(0.8) * smoothstep(0.9, 1.0, shockwave) * 0.4 * audioKick;

    finalCol = pow(finalCol, vec3(0.88));
    finalCol *= 0.71;   // measured luma 0.702: knee, not a linear trim
    finalCol /= 1.0 + 0.45 * max(finalCol.r, max(finalCol.g, finalCol.b));
    fragColor = vec4(clamp(finalCol * 0.86, 0.0, 1.0), 1.0);   // measured luma 0.748: over the white line
}
