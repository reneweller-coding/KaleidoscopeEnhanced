#version 330 core
out vec4 fragColor;
/**
 * @file CyanotypeSunPrint.frag
 * @brief TRANSITION CYANOTYPE SUN PRINT: the incoming scene exposes itself onto
 * the outgoing one as a blueprint, then a water front rinses the sheet and the
 * true colours come back.
 *
 * A cyanotype exposes in order of how much light each part receives, so the
 * shader gives every pixel a threshold taken from the incoming scene's own
 * luminance and lets one rising exposure value cross those thresholds.  The
 * picture therefore builds shadows-first, the way a real sun print does, rather
 * than fading in uniformly.
 *
 * The colour path matters as much as the order: unexposed sensitiser is a pale
 * yellow-green, and it goes through a dull sage before Prussian blue appears.
 * Taking the short way straight to blue would look like a blue tint instead of
 * a chemical change.
 *
 * Audio Reactivity:
 *   audioSwell -> how hard the sun is: the softness of the exposure edge (slow)
 *   audioMid   -> the paper's warmth (colour)
 *   audioHigh  -> the wet sheen along the rinse front (light)
 *   audioKick  -> the light on the wet paper (light)
 *
 * Per-activation variety: contrastP, washP, hueP.
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

uniform float contrastP;
uniform float washP;
uniform float hueP;

const float PI = 3.14159265358979;

float hash21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise2(vec2 p)
{
    vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x),
               mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), f.x), f.y);
}
float lum(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }

void main()
{
    float con  = (contrastP > 0.0) ? contrastP : 1.0;
    float wash = (washP     > 0.0) ? washP     : 1.0;
    float hue  = (hueP      > 0.0) ? hueP      : 0.0;

    float aspect = resolution.x / resolution.y;
    vec2  uv = gl_FragCoord.xy / resolution;
    vec2  p  = (uv - 0.5) * vec2(aspect, 1.0);
    float halfW = aspect * 0.5;

    float d = clamp(1.0 - interpolation, 0.0, 1.0);

    // The rinse front sweeps across at the end of the turn; the paper cockles
    // in a narrow band right at the water's edge and nowhere else.
    float fx  = mix(-halfW - 0.25, halfW + 0.25, smoothstep(0.66, 1.0, d));
    float band = exp(-pow((p.x - fx) / (0.075 * wash), 2.0));
    vec2  cockle = vec2(0.0);
    cockle.y = band * 0.010 * sin(p.y * 34.0 + audioAdvance * 0.05);
    cockle.x = band * 0.006 * noise2(vec2(p.y * 12.0, 5.1));
    vec2 suv = clamp(uv + cockle, 0.0, 1.0);

    vec3 src1 = texture(tex1, suv).rgb;
    vec3 src0 = texture(tex0, suv).rgb;

    // Exposure: every pixel carries its own threshold, the exposure value rises
    // past all of them.  The two ends are exact by construction -- at d = 0 the
    // value sits below every threshold, at d = 1 above every one.
    float w   = clamp(0.06 + 0.22 / max(con, 0.2) + 0.10 * clamp(audioSwell, 0.0, 1.0), 0.03, 0.45);
    float thr = lum(src1);
    float e   = d * (1.0 + 2.0 * w) - w;
    float a   = smoothstep(thr - w, thr + w, e);

    // The chemistry's own colour path: pale yellow-green, dull sage, then
    // Prussian blue.  The middle stop is what makes it read as a chemical turn.
    vec3 pale = mix(vec3(0.88, 0.86, 0.62), vec3(0.90, 0.87, 0.55),
                    clamp(audioMid * 2.0, 0.0, 1.0));
    vec3 sage = vec3(0.36, 0.52, 0.50);
    // hueP tones the print the way tannin or tea does with a real cyanotype.
    // Toning is a nudge, not a change of colour: a tea-toned cyanotype is
    // still a blue print.
    vec3 prus = mix(vec3(0.09, 0.26, 0.56), vec3(0.26, 0.20, 0.30), 0.35 * fract(hue * 0.159));
    // The sage is a stop on the way, not a destination: it is gone by a third
    // of the exposure, and everything past that is Prussian blue deepening.
    vec3 blue = (a < 0.32) ? mix(pale, sage, smoothstep(0.0, 0.32, a))
                           : mix(sage, prus, smoothstep(0.32, 0.90, a));
    // A cyanotype's shadows are the MOST exposed, so they are the darkest.
    // Brightening them was backwards and washed the whole print out.
    blue *= 0.88 + 0.34 * thr;

    // Paper: laid fibre, visible mostly where the sheet is still pale.
    float fibre = noise2(p * vec2(70.0, 300.0)) * 0.6 + noise2(p * 160.0) * 0.4;
    blue *= 0.93 + 0.14 * fibre * (1.0 - a * 0.6);

    // The emulsion sits ON the outgoing scene and takes it over as it exposes.
    vec3 col = mix(src0, blue, a);

    // The rinse: unexposed sensitiser washes out and the real picture returns.
    float wet = smoothstep(fx + 0.10 * wash, fx - 0.10 * wash, p.x);
    col = mix(col, src1, wet);

    // Wet paper is glossy right at the front, and only there.
    col += vec3(0.55, 0.72, 0.80) * band
         * (0.06 + 0.20 * clamp(audioHigh * 2.0, 0.0, 1.0) + 0.14 * clamp(audioKick, 0.0, 1.0));

    fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
