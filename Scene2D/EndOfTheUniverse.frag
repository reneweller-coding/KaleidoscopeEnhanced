#version 330 core
out vec4 fragColor;
/**
 * @file EndOfTheUniverse.frag
 * @brief END OF THE UNIVERSE: The heat death of the cosmos. A terrifyingly empty,
 * black void where only the faintest embers of dying red and black dwarfs remain.
 * A very dark, melancholic scene that flares up slightly during audio swells.
 *   audioAdvance -> incredibly slow drift through the void
 *   audioKick    -> weak, dying flashes from the last stars
 *   audioSwell   -> ambient brightness of the dying embers
 *   audioChromaHue-> palette offset for the remaining stars
 *
 * Per-activation variety:
 *   starP float density of the remaining stars (0.1..1.0)
 *   glowP float intensity of the embers (0.5..1.5)
 *   hueP float palette offset (0..6.28)
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
uniform float audioChromaHue;

uniform float starP;
uniform float glowP;
uniform float hueP;

vec3 img(vec2 uv) {
    return (interpolation * texture(tex0, uv) + (1.0 - interpolation) * texture(tex1, uv)).rgb;
}

vec3 imgPalette(float t)
{
    float ang = audioChromaHue + audioAdvance * 0.04 + t * 6.2831853;
    float rad = 0.16 + 0.08 * sin(audioAdvance * 0.013);
    vec3  pc  = img(clamp(vec2(0.5) + rad * vec2(cos(ang), sin(ang)), 0.0, 1.0));
    float pg  = dot(pc, vec3(0.333));
    return mix(vec3(pg), pc, 0.55 + 0.45 * audioValence);
}

vec3 hueRot(vec3 c, float a) {
    vec3 k = vec3(0.57735026919);
    float cs = cos(a), sn = sin(a);
    return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
}

float hash11(float n) { return fract(sin(n * 127.1) * 43758.5453); }

void main()
{
    float sp = (starP > 0.01 ? starP : 0.5); // Very sparse by default
    float gp = (glowP > 0.01 ? glowP : 1.0);
    float hue = (hueP > 0.01 ? hueP : 0.0);

    vec2 uv = (gl_FragCoord.xy - 0.5 * resolution) / resolution.y;

    // Extremely slow movement
    float drift = time * 0.6 + audioAdvance * 0.8;   // spuerbare Drift durch die Leere

    vec3 ro = vec3(0.0, 0.0, drift);

    // Very subtle camera rotation
    vec3 ta = ro + vec3(sin(time * 0.05) * 0.2, cos(time * 0.07) * 0.2, 1.0);

    vec3 ww = normalize(ta - ro);
    vec3 uu = normalize(cross(ww, vec3(0.0, 1.0, 0.0)));
    vec3 vv = cross(uu, ww);

    float roll = 0.02 * sin(time * 0.03);
    vec2 ruv = mat2(cos(roll), -sin(roll), sin(roll), cos(roll)) * uv;
    vec3 rd = normalize(ruv.x * uu + ruv.y * vv + 1.0 * ww);

    vec3 col = vec3(0.0);

    // Dying star colors (deep reds, dark purples)
    vec3 emberColor = max(imgPalette(0.1 + audioCentroid * 0.1), vec3(0.42, 0.16, 0.10));

    // We only render a background starfield, but it's very sparse and volumetric-looking
    for (int i = 0; i < 5; ++i) {
        float sc = 20.0 + 20.0 * float(i);
        vec3 st = rd * sc + vec3(0.0, 0.0, drift * (1.0 + float(i) * 0.1));
        vec3 cell = floor(st);
        vec3 f = fract(st) - 0.5;

        // Probability of a star existing is very low
        // Direkter fract(sin(dot))-Hash: hash11 multipliziert intern nochmal
        // mit 127.1, und mit Zellkoordinaten bis ~100 landet das Argument bei
        // ~1e6, wo die GPU-sin-Praezision zusammenbricht -- die Sterne
        // erschienen schlicht nicht, das Bild blieb leer.
        float h = fract(sin(dot(cell, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
        if (h > 1.0 - (0.10 * sp)) {
            float dist = length(f);

            // Core of the dying star
            float core = exp(-dist * 25.0);

            // Faint, dissipating nebula/corona around it
            float corona = exp(-dist * 3.0) * 0.8;

            // Dying pulse (very slow, weak reaction to kick)
            float pulse = sin(time * 2.0 + h * 10.0) * 0.5 + 0.5;
            float flash = step(0.95, hash11(floor(time * 2.00) + h * 100.0));

            vec3 localCol = emberColor * (core + corona);

            // Brighten slightly on swell
            localCol *= (0.7 + audioSwell * 0.8 + flash * audioKick * 2.0) * gp;

            // Shift older stars to be even darker red/brown
            localCol = mix(vec3(0.1, 0.01, 0.01), localCol, h);

            col += localCol;
        }
    }

    // The vast emptiness
    vec3 voidColor = mix(vec3(0.055, 0.024, 0.075), vec3(0.013, 0.007, 0.022), length(uv));
    col = max(col, voidColor * (1.0 + audioSwell * 0.5));   // no longer halved on quiet material: this preset's whole point is quiet material

    if (hue > 0.001) col = hueRot(col, 0.2 * sin(hue));

    // Soft-knee exposure
    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
