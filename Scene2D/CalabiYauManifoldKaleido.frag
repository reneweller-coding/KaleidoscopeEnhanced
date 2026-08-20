#version 330 core
out vec4 fragColor;
/**
 * @file CalabiYauManifoldKaleido.frag
 * @brief CALABI-YAU MANIFOLD KALEIDO: 2D cross-section through a 6D Calabi-Yau compactification
 * (Quintic Threefold in CP4) from superstring theory. Organic multi-curved complex
 * polynomial manifolds folding like a transcendent cosmic lotus with moduli-space morphing.
 *
 * Audio Reactivity:
 *   audioAdvance -> drives continuous navigation through Calabi-Yau moduli space psi
 *   audioKick    -> flashes manifold singularity nodes & triggers dimensional burst
 *   audioCentroid-> sharpens complex polynomial curve contours & string tension
 *   audioSubBass -> expands compactification breathing volume
 *   audioChromaHue-> rotates the superstring vacuum spectrum
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
uniform float moduliP;
uniform float petalsP;
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

// Complex power helper: z^n
vec2 cPow(vec2 z, float n) {
    float r = length(z);
    float a = atan(z.y, z.x);
    return vec2(cos(a * n), sin(a * n)) * pow(r, n);
}

void main() {
    vec2 uv = (gl_FragCoord.xy - 0.5 * resolution.xy) / min(resolution.x, resolution.y);

    float spd = (speedP > 0.01) ? speedP : 1.0;
    float psiMod = (moduliP > 0.01) ? moduliP : 1.0;
    float nPetals = (petalsP > 1.0) ? petalsP : 5.0;
    float glw = (glowP > 0.01) ? glowP : 1.0;

    float t = audioAdvance * 0.3 * spd;

    // Moduli space deformation parameter psi
    float psi = (0.85 + 0.4 * sin(t * 0.35) + 0.2 * audioFlux) * psiMod;

    // 5-Fold / multi-fold symmetry fold in complex plane
    float a = atan(uv.y, uv.x);
    float r = length(uv) * (2.2 + 0.3 * sin(audioSwell * 2.0));
    float seg = 6.2831853 / nPetals;
    a = mod(a + seg * 0.5, seg) - seg * 0.5;
    a = abs(a);
    vec2 z = vec2(cos(a), sin(a)) * r;

    // Calabi-Yau quintic polynomial evaluation: z1^5 + z2^5 - 5*psi*z1*z2 = 0
    vec2 z5 = cPow(z, 5.0);
    vec2 termInter = z * psi * 2.5;
    vec2 fVal = z5 - termInter + vec2(cos(t * 0.5), sin(t * 0.5)) * 0.3;

    // Sub-bass inflates the compactification radius itself, so the whole
    // manifold shell breathes outward rather than merely getting brighter.
    float dManifold = abs(length(fVal) - 0.7 * (1.0 + 0.4 * audioSubBass));

    // Glowing string manifold contour bands
    float stringGlow = exp(-dManifold * (12.0 + 8.0 * audioCentroid)) * glw;

    // Multi-scale string vibrations
    float stringVib = sin(length(z5) * 8.0 - t * 4.0);
    float nodeFlash = smoothstep(0.85, 1.0, abs(stringVib)) * (1.0 + 2.5 * audioKick);

    // Sample distorted background texture
    vec2 sampleUV = fract(z * 0.3 + fVal * 0.1 + 0.5);
    vec3 texCol = img(sampleUV);

    // Superstring spectrum palette
    vec3 palA = imgPalette(dManifold * 0.2 + t * 0.05);
    vec3 palB = imgPalette(dManifold * 0.2 + 0.5);
    vec3 col = mix(palA, palB, 0.5 + 0.5 * sin(a * nPetals));

    col = mix(col, texCol, 0.35 + 0.15 * audioValence);

    // Add glowing string filaments and kick node flashes
    vec3 stringTint = vec3(1.3, 1.1, 1.8) * stringGlow * (1.0 + 2.5 * audioKick);
    col += stringTint + vec3(1.5, 1.4, 1.9) * nodeFlash * 0.6;

    // Center compactification singularity flare
    float centerBloom = exp(-r * 4.0) * (0.8 + 1.5 * audioKick);
    col += imgPalette(0.85) * centerBloom;

    col = pow(col, vec3(0.88));
    fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
