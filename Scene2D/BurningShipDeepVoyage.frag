#version 330 core
out vec4 fragColor;
/**
 * @file BurningShipDeepVoyage.frag
 * @brief BURNING SHIP DEEP VOYAGE: Continuous deep plunge into the non-analytic
 * Burning Ship fractal z -> (|Re(z)| + i|Im(z)|)^2 + c. Glowing fire kathedrals,
 * burning masts, and high-temperature plasma flares.
 *
 * Audio Reactivity:
 *   audioAdvance -> drives continuous deep zoom into fractal mast structures
 *   audioKick    -> flashes interior ship core & explodes solar flares
 *   audioCentroid-> sharpens flame filigree & iteration escape boundaries
 *   audioSubBass -> expands ship hull breathing amplitude
 *   audioChromaHue-> steers the fiery aurum/crimson/violet palette
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
uniform float zoomP;
uniform float flameP;
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

void main() {
    vec2 uv = (gl_FragCoord.xy - 0.5 * resolution.xy) / min(resolution.x, resolution.y);

    float spd = (speedP > 0.01) ? speedP : 1.0;
    float zm = (zoomP > 0.01) ? zoomP : 1.0;
    float flm = (flameP > 0.01) ? flameP : 1.0;
    float glw = (glowP > 0.01) ? glowP : 1.0;

    float t = audioAdvance * 0.25 * spd;

    // Deep zoom target on a prominent Burning Ship mast cusp: c_center = (-0.45, -0.6)
    vec2 cCenter = vec2(-0.45, -0.6);
    // Zoom cycle. exp(mod(t * 0.7, 6.0)) snapped from e^6 (403x) back to e^0
    // every ~8.6 s -- a hard cut. A raised cosine over the same period dives
    // in and eases back out instead: continuous in value AND velocity (the
    // derivative vanishes at both turns), so no seam anywhere.
    // Sub-bass makes the hull swell by tightening the visible c-window. The
    // factor sits OUTSIDE the exp(), so the running zoom phase is untouched.
    float zc = 0.5 - 0.5 * cos(6.2831853 * fract(t * 0.7 / 6.0));   // 0..1..0
    float zoomLevel = exp(zc * 6.0) * (2.0 * zm) * (1.0 + 0.35 * audioSubBass);
    vec2 c = cCenter + uv / zoomLevel;

    // Invert Y to orient the "ship" right-side up
    c.y = -c.y;

    vec2 z = c;
    float iterCount = 0.0;
    float trap = 1e5;

    // Burning ship iteration loop: z = (|x| + i|y|)^2 + c
    for (int i = 0; i < 48; i++) {
        vec2 zAbs = abs(z);
        z = vec2(zAbs.x * zAbs.x - zAbs.y * zAbs.y, 2.0 * zAbs.x * zAbs.y) + c;

        float r2 = dot(z, z);
        trap = min(trap, abs(z.y) + abs(z.x) * 0.5);

        if (r2 > 16.0) {
            iterCount = float(i) - log2(max(1.0, log2(r2)));
            break;
        }
    }

    if (iterCount == 0.0) iterCount = 48.0;

    // Sample texture mapped across chaotic coordinate
    vec2 sampleUV = fract(z * 0.2 + 0.5);
    vec3 texCol = img(sampleUV);

    // Glowing flame edge calculation
    float flameGlow = exp(-abs(sin(iterCount * 0.4 + t)) * (15.0 - 5.0 * audioCentroid)) * glw;

    // Fire palette: gold/crimson/violet
    vec3 palA = imgPalette(iterCount * 0.04 + trap * 0.15);
    vec3 palB = imgPalette(iterCount * 0.04 + 0.5);
    vec3 fireCol = mix(palA, palB, 0.5 + 0.5 * sin(iterCount * 0.6 + t));

    fireCol = mix(fireCol, texCol, 0.35 + 0.15 * audioValence);

    // Add glowing fire mast highlights and kick flare
    vec3 flameTint = vec3(1.6, 1.2, 0.6) * flameGlow * (1.0 + 2.5 * audioKick) * flm;
    fireCol += flameTint;

    // Core bloom
    float coreBloom = exp(-trap * 4.0) * (0.8 + 1.5 * audioKick);
    fireCol += imgPalette(0.8) * coreBloom;

    fireCol = pow(fireCol, vec3(0.88));
    fragColor = vec4(clamp(fireCol, 0.0, 1.0), 1.0);
}
