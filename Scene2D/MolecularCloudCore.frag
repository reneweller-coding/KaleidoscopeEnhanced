#version 330 core
out vec4 fragColor;
/**
 * @file MolecularCloudCore.frag
 * @brief MOLECULAR CLOUD CORE: a protostar deep in a dark molecular cloud,
 * as the infrared telescopes show it -- an hourglass of two cavities carved
 * by its outflow, their wispy walls lit gold above and cold blue below,
 * pinched at the neck by the dark lane of its edge-on disk.  Thin jets leave
 * both ways, Herbig-Haro knots travelling out along them.  Around it the
 * dust hides and reddens the background stars.  Everything moves at its own
 * slow pace; the music is the light.
 *   sceneTime     -> the knots travelling out, the dust drifting (continuous)
 *   audioSwell    -> the lobes and jets brighten (slow)
 *   audioKick     -> the protostar's glow at the neck (light only)
 *   audioChromaHue-> photo tint of the lobes
 *
 * Per-activation variety:
 *   dustP float density and opacity of the molecular cloud (0.5..1.5)
 *   starP float brightness of the jets (0.5..2.0)
 *   hueP float palette offset (0..6.28)
 */

uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float audioPhase;
uniform float audioAdvance;
uniform float sceneTime;
uniform float audioSwell;
uniform float audioLevel;
uniform float audioKick;
uniform float audioCentroid;
uniform float audioValence;
uniform float audioChromaHue;

uniform float dustP;
uniform float starP;
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
float hash21(vec2 p)  { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
vec3 hash33(vec3 p) {
    p = vec3(dot(p,vec3(127.1,311.7, 74.7)),
             dot(p,vec3(269.5,183.3,246.1)),
             dot(p,vec3(113.5,271.9,124.6)));
    return fract(sin(p)*43758.5453123);
}

float noise(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float n = i.x + i.y * 57.0 + i.z * 113.0;
    return mix(
        mix(mix(hash11(n + 0.0), hash11(n + 1.0), f.x),
            mix(hash11(n + 57.0), hash11(n + 58.0), f.x), f.y),
        mix(mix(hash11(n + 113.0), hash11(n + 114.0), f.x),
            mix(hash11(n + 170.0), hash11(n + 171.0), f.x), f.y), f.z);
}

float fbm(vec3 p) {
    float f = 0.0, a = 0.5;
    for(int i = 0; i < 4; i++) { f += a * noise(p); p *= 2.0; a *= 0.5; }
    return f;
}

float noise2(vec2 p)
{
    vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x),
               mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), f.x), f.y);
}
float fbm2(vec2 p)
{
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 5; ++i) { v += a * noise2(p); p = mat2(1.6, 1.2, -1.2, 1.6) * p + 1.7; a *= 0.5; }
    return v;
}
// Ridged: thin bright filaments, the wisps of a lit cavity wall.
float ridged(vec2 p)
{
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 4; ++i) { float n = 1.0 - abs(2.0 * noise2(p) - 1.0); v += a * n * n; p = mat2(1.6, 1.2, -1.2, 1.6) * p + 4.1; a *= 0.5; }
    return v;
}

void main()
{
    float dp = (dustP > 0.01 ? dustP : 1.0);
    float sp = (starP > 0.01 ? starP : 1.0);
    float hue = (hueP > 0.01 ? hueP : 0.0);
    float swell = clamp(audioSwell, 0.0, 1.0);

    vec2 uv = (gl_FragCoord.xy - 0.5 * resolution) / resolution.y;
    float T = sceneTime;

    // The outflow axis, tilted a little off vertical.
    vec2 ax = normalize(vec2(0.22, 1.0));
    vec2 sx = vec2(-ax.y, ax.x);
    float along = dot(uv, ax), across = dot(uv, sx);
    float aa = abs(along);

    // Background stars, reddened behind the dust.
    vec3 col = vec3(0.0);
    {
        vec2 g = uv * 70.0;
        vec2 gi = floor(g), gf = fract(g);
        vec2 c = 0.2 + 0.6 * vec2(hash21(gi), hash21(gi + 3.3));
        float h = hash21(gi + 7.7);
        float star = smoothstep(0.09, 0.0, length(gf - c)) * step(0.93, h);
        col += mix(vec3(1.0, 0.55, 0.35), vec3(0.9, 0.9, 1.0), hash21(gi + 1.1)) * star * (0.5 + 1.2 * (h - 0.93) / 0.07);
    }

    // The dark cloud: thick dust with slow internal drift; it hides the
    // stars and the outer lobes where it is densest.
    vec2 dq = uv * 2.2 + vec2(0.0, T * 0.004);
    float dust = smoothstep(0.35, 0.75, fbm2(dq + 0.3 * vec2(fbm2(dq * 1.7 + T * 0.006), fbm2(dq * 1.7 + 5.0)))) * dp;
    // Faint glowing gas far behind, so the dust reads as silhouettes.
    col += vec3(0.11, 0.05, 0.035) * smoothstep(0.3, 0.8, fbm2(uv * 1.4 + 7.0)) * 1.4;
    col *= exp(-dust * 3.0);
    col += vec3(0.05, 0.03, 0.03) * (1.0 - dust) * 0.4;

    // The hourglass: two cavities carved by the outflow, their walls lit by
    // the protostar -- warm gold above, cold blue below (the lobes differ by
    // how much dust lies in front of them).
    float wallR = 0.05 + 0.55 * pow(aa, 0.75);                // cavity half width
    float edge = abs(across) / max(wallR, 1e-3);                // 0 axis .. 1 wall
    vec2 fq = vec2(across * 4.0, along * 3.0 - T * 0.01 * sign(along));
    float wisp = ridged(fq * 2.5 + vec2(0.0, sign(along) * 3.0));
    float wall = exp(-pow((edge - 1.0) * 2.6, 2.0)) * (0.55 + 0.9 * wisp);
    float fill = smoothstep(1.1, 0.2, edge) * (0.25 + 0.5 * wisp);
    float lobe = (wall + fill) * exp(-aa * 1.3) * smoothstep(0.0, 0.08, aa);
    vec3 warmC = mix(vec3(1.0, 0.62, 0.25), imgPalette(0.08 + hue * 0.159), 0.22);
    vec3 coldC = mix(vec3(0.35, 0.55, 1.0), imgPalette(0.58 + hue * 0.159), 0.22);
    vec3 lobeC = mix(coldC, warmC, smoothstep(-0.05, 0.05, along));
    // Lobes are veiled by the dust in front, not cut out by it.
    col += lobeC * lobe * (0.9 + 0.6 * swell) * (1.0 - 0.55 * dust);

    // The protostar's glow at the neck, and the edge-on disk that shadows it:
    // a dark lane across the neck.
    float core = exp(-dot(uv, uv) * 90.0);
    col += mix(warmC, vec3(1.0, 0.95, 0.85), 0.5) * core * (1.2 + 0.8 * swell + 0.4 * audioKick);
    float lane = exp(-along * along / 0.0012) * smoothstep(0.32, 0.05, abs(across));
    col *= 1.0 - 0.92 * lane;

    // Jets: thin beams with knots that travel outward (Herbig-Haro knots).
    {
        float w = 0.004 + 0.02 * aa;
        float beam = exp(-across * across / (w * w)) * exp(-aa * 1.6) * smoothstep(0.02, 0.06, aa);
        float knots = 0.0;
        for (int k = 0; k < 6; ++k) {
            float pos = fract(T * 0.012 + float(k) / 6.0) * 0.95;
            knots += exp(-pow((aa - pos) / 0.012, 2.0)) * (1.0 - pos);
        }
        vec3 jetC = vec3(1.0, 0.45, 0.5);                     // shocked hydrogen and sulphur
        col += jetC * beam * (0.35 + 2.2 * knots) * (0.7 + 0.6 * swell) * sp;
    }

    // A few young stars nearby, with soft diffraction-free halos.
    for (int k = 0; k < 4; ++k) {
        float fk = float(k);
        vec2 sc = vec2(hash11(fk * 3.1) - 0.5, hash11(fk * 7.3) - 0.5) * vec2(1.6, 0.9);
        float r2 = dot(uv - sc, uv - sc);
        col += vec3(1.0, 0.85, 0.7) * (exp(-r2 * 6000.0) * 1.5 + exp(-r2 * 250.0) * 0.08) * (1.0 - 0.6 * dust);
    }

    col *= 0.9 + 0.2 * audioLevel;
    if (hue > 0.001) col = hueRot(col, 0.15 * sin(hue));

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
