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

    float t = time * 0.150 * spd + audioAdvance * 0.150 * spd;
    // Zeit-Basis + Musik-Schub: audioAdvance ALLEIN steht bei ruhiger
    // Musik still (die gemeldete "wirkt wie ein Bild"-Klasse).

    // Voyage course: the dive now has a DESTINATION. At zoom-out the frame
    // holds the whole burning ship hull; as the raised-cosine zoom deepens,
    // the centre glides to the famous "armada" cusp where the little ship
    // replicas line up -- so every cycle reads as travel toward something,
    // not as marble mush (the old centre (-0.45,-0.6) landed in a featureless
    // region and every pixel escaped within 2 iterations).
    vec2 cOverview = vec2(-0.6, -0.55);
    vec2 cArmada   = vec2(-1.7629, -0.0286);
    float zc = 0.5 - 0.5 * cos(6.2831853 * fract(t * 0.7 / 6.0));   // 0..1..0
    vec2 cCenter = mix(cOverview, cArmada, smoothstep(0.0, 0.35, zc));
    float zoomLevel = exp(zc * 7.5) * (0.55 * zm) * (1.0 + 0.08 * audioSwell);
    // The ship renders upright with the y-window inverted (applied to the
    // WINDOW, so the centre coordinates above are true fractal coordinates).
    vec2 c = cCenter + vec2(uv.x, -uv.y) / zoomLevel;

    vec2 z = c;
    float iterCount = -1.0;
    float trap = 1e5;

    // Burning ship iteration loop: z = (|x| + i|y|)^2 + c
    for (int i = 0; i < 90; i++) {
        vec2 zAbs = abs(z);
        z = vec2(zAbs.x * zAbs.x - zAbs.y * zAbs.y, 2.0 * zAbs.x * zAbs.y) + c;

        float r2 = dot(z, z);
        trap = min(trap, abs(z.y) + abs(z.x) * 0.5);

        if (r2 > 16.0) {
            iterCount = float(i) - log2(max(1.0, log2(r2)));
            break;
        }
    }

    vec3 fireCol;
    if (iterCount < 0.0) {
        // INTERIOR: the hull itself -- near-black iron with a faint ember
        // texture, the iconic silhouette against the fire outside.
        vec3 ember = img(fract(z * 0.15 + 0.5));
        fireCol = vec3(0.02, 0.015, 0.02) + ember * 0.06;
    } else {
        // EXTERIOR: fire gradient hugging the boundary. High iteration
        // counts (close to the set) burn bright, open water stays dark.
        float g = pow(clamp(iterCount / 42.0, 0.0, 1.0), 1.1);
        vec2 sampleUV = fract(z * 0.2 + 0.5);
        vec3 texCol = img(sampleUV);
        vec3 palA = imgPalette(g * 0.55 + trap * 0.10);
        vec3 palB = imgPalette(g * 0.55 + 0.5);
        fireCol = mix(palA, palB, 0.5 + 0.5 * sin(iterCount * 0.6 + t));
        fireCol = mix(fireCol, texCol, 0.25);
        fireCol *= 0.22 + 2.0 * g;
        // Flame licks on the iteration bands + kick flare
        float flameGlow = exp(-abs(sin(iterCount * 0.4 + t)) * (15.0 - 5.0 * audioCentroid)) * glw;
        fireCol += vec3(1.6, 1.2, 0.6) * flameGlow * g * (0.5 + 1.5 * audioKick) * flm;
    }

    fireCol = pow(fireCol, vec3(0.88));
    fragColor = vec4(clamp(fireCol, 0.0, 1.0), 1.0);
}
