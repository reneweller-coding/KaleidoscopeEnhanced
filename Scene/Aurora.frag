#version 330 core
out vec4 fragColor;
// Aurora.frag
// -----------------------------------------------------------------------
// AURORA BOREALIS v2: TWO waving curtain layers over a starfield with a
// moon — the back layer higher, dimmer and hue-shifted for real depth.
// The display DANCES: kicks surge the rays, onsets flare the active
// regions, the swell breathes the whole sky, and rare high-reaching parts
// tip into the classic red top fringe.  The image glows through the
// curtains as their colour texture; a faint aurora glow warms the ground.
//   swell    -> sky-wide flare-up (aurora "breathing")
//   kick     -> ray surge (slew-limited envelope, no strobe)
//   onset    -> brief flare of the bright regions
//   centroid -> curtain reach / brightness
//   chroma   -> hue drift; pitch -> curtain altitude
// Jump-free: all wave fields ride time + audioPhase (integrated).
//
// Per-activation variety (0 = default):
//   bandsP   float curtain frequency multiplier (0 -> 1.0; 0.7..1.8)
//   hueP     float hue rotation                 (0 -> classic green; 0..6.28)
//   heightP  float curtain height multiplier    (0 -> 1.0; 0.7..1.5)
//   speedP   float wave speed multiplier        (0 -> 1.0; 0.6..1.6)
// -----------------------------------------------------------------------

uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float audioPhase;
uniform float audioAdvance;
uniform float audioSwell;
uniform float audioLevel;
uniform float audioCentroid;
uniform float audioValence;
uniform float audioPitch;
uniform float audioChromaHue;
uniform float audioKick;
uniform float audioOnset;

uniform float bandsP;
uniform float hueP;
uniform float heightP;
uniform float speedP;

vec3 img(vec2 uv) { return (interpolation * texture(tex0, uv)
                          + (1.0 - interpolation) * texture(tex1, uv)).rgb; }

// IMG-PALETTE (house standard): colours come from a rotating arc in the
// CURRENT slideshow image, so every activation inherits a fresh palette from
// the photos; the arc follows the musical key (audioChromaHue is circular-
// slewed = jump-free) with a slow advance drift, valence shapes saturation.
vec3 imgPalette(float t)
{
    float ang = audioChromaHue + audioAdvance * 0.04 + t * 6.2831853;
    float rad = 0.16 + 0.08 * sin(audioAdvance * 0.013);
    vec3  pc  = img(clamp(vec2(0.5) + rad * vec2(cos(ang), sin(ang)), 0.0, 1.0));
    float pg  = dot(pc, vec3(0.333));
    return mix(vec3(pg), pc, 0.55 + 0.45 * audioValence);
}


// House tint: bend a colour toward the photo palette while keeping its
// luminance -- the identity look survives, only the hue follows the photos.
vec3 palTint(vec3 c, float t, float k)
{
    vec3 tp = imgPalette(t);
    tp *= dot(c, vec3(0.3333)) / max(dot(tp, vec3(0.3333)), 1e-3);
    return mix(c, tp, k);
}
vec3 hueRot(vec3 c, float a)
{
    vec3  k = vec3(0.57735026919);
    float cs = cos(a), sn = sin(a);
    return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
}
float hash21(vec2 p)
{
    p = fract(p * vec2(123.34, 345.45));
    p += dot(p, p + 34.345);
    return fract(p.x * p.y);
}
float vnoise(vec2 p)
{
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = hash21(i), b = hash21(i + vec2(1.0, 0.0));
    float c = hash21(i + vec2(0.0, 1.0)), d = hash21(i + vec2(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
float fbm(vec2 p)
{
    float s = 0.0, a = 0.5;
    for (int i = 0; i < 4; i++) { s += a * vnoise(p); p = p * 2.11 + vec2(5.2, 1.3); a *= 0.5; }
    return s;
}

// One curtain layer: .x = glow, .y = colour fringe 0..1, .z = brightness env.
vec3 curtainLayer(vec2 uv, float t, float bands, float height,
                  float baseOff, float seed)
{
    float wave = 0.0;
    wave += 0.55 * sin(uv.x * 6.0 * bands + t + seed * 3.1 + audioPhase * 0.25);
    wave += 0.30 * sin(uv.x * 11.0 * bands - t * 0.63 + 1.7 + seed * 5.7);
    wave += 0.36 * fbm(vec2(uv.x * 4.0 * bands + seed * 7.7, t * 0.35)) - 0.18;

    float env   = fbm(vec2(uv.x * 2.3 * bands + wave * 0.3 + seed * 13.1, t * 0.22));
    float base  = baseOff + 0.18 * wave + (audioPitch - 0.5) * 0.18;
    float reach = (0.30 + 0.25 * audioCentroid + 0.10 * audioSwell)
                * height * (0.55 + 0.9 * env);
    float d     = base - uv.y;
    float body  = exp(-max(d, 0.0) / max(reach, 0.05))
                * smoothstep(-0.02, 0.10, d);

    // Fine striation, phase-bent by the wave + envelope (no two rays alike);
    // the kick SURGES the rays (envelope-driven -> smooth, in tempo).
    float rays = 0.55 + 0.45 * sin(uv.x * 95.0 * bands + wave * 9.0 + env * 7.0);
    rays = pow(rays, 2.0) * (1.0 + 0.5 * audioKick * env);

    float glow = body * rays * (0.25 + 1.15 * env);
    float fringe = clamp(max(d, 0.0) / max(reach, 0.05), 0.0, 1.0);
    return vec3(glow, fringe, env);
}

// Colour a curtain layer: green core -> purple fringe -> RED top, image-lit.
vec3 curtainColour(vec2 uv, float base, float fringe, float hueOff)
{
    vec3 acol = palTint(mix(vec3(0.10, 0.95, 0.45), vec3(0.55, 0.20, 0.85),
                    fringe * fringe), hueOff + 0.15 * fringe, 0.22);
    // Classic red top fringe on the highest-reaching parts.
    acol = mix(acol, vec3(0.95, 0.18, 0.30),
               smoothstep(0.70, 1.00, fringe) * 0.55);
    vec3 pic = img(vec2(uv.x, base));
    acol = mix(acol, acol * (0.4 + 1.4 * pic), 0.45);
    return hueRot(acol, hueP + audioChromaHue * 1.2 + hueOff);
}

void main()
{
    float bands  = (bandsP  > 0.0) ? bandsP  : 1.0;
    float height = (heightP > 0.0) ? heightP : 1.0;
    float spd    = (speedP  > 0.0) ? speedP  : 1.0;

    vec2 uv = gl_FragCoord.xy / resolution;             // 0..1, y up
    vec2 p  = (gl_FragCoord.xy - 0.5 * resolution) / resolution.y;

    // --- Night sky backdrop: the image, darkened, as a faint nebula. ---
    vec3 sky = img(uv * 0.6 + 0.2) * 0.10 * (1.0 - uv.y * 0.5);

    // Stars: sparse hash points, twinkling SLOWLY (no strobing).
    vec2  cell = floor(p * 90.0);
    float star = step(0.985, hash21(cell));
    float tw   = 0.5 + 0.5 * sin(time * 0.8 + hash21(cell + 7.0) * 31.0);
    vec2  sf   = fract(p * 90.0) - 0.5;
    sky += vec3(0.8, 0.85, 1.0) * star * tw * smoothstep(0.35, 0.0, length(sf))
           * (0.5 + 0.5 * uv.y);

    // Moon with a soft halo (upper right, image-tinted).
    {
        float md   = length(p - vec2(0.58, 0.30));
        float disc = smoothstep(0.050, 0.045, md);
        float halo = exp(-md * 7.0);
        sky += vec3(0.92, 0.92, 0.82) * disc * 0.75
             + vec3(0.55, 0.60, 0.72) * halo * 0.14;
    }

    // --- Two aurora curtain layers (back: higher, dimmer, hue-shifted). ---
    float t  = time * 0.055 * spd + audioAdvance * 0.18;
    float energy = 0.45 + 0.85 * audioSwell + 0.25 * audioLevel;

    vec3 L2 = curtainLayer(uv, t * 0.8, bands * 0.7, height * 1.15, 0.70, 1.0);
    vec3 C2 = curtainColour(uv, 0.70, L2.y, 0.8);
    float g2 = L2.x * energy * (1.0 + 0.35 * audioOnset * L2.z);

    vec3 L1 = curtainLayer(uv, t, bands, height, 0.55, 0.0);
    vec3 C1 = curtainColour(uv, 0.55, L1.y, 0.0);
    float g1 = L1.x * energy * (1.0 + 0.35 * audioOnset * L1.z);

    vec3 col = sky + C2 * g2 * 0.45 + C1 * g1;

    // Ground silhouette with a faint aurora glow on the snow.
    float ridge = 0.06 + 0.04 * fbm(vec2(uv.x * 3.0, 7.7));
    float ground = smoothstep(ridge - 0.015, ridge + 0.015, uv.y);
    vec3  gcol = (C1 * g1 + C2 * g2 * 0.45) * 0.22 + vec3(0.010, 0.014, 0.022);
    col = mix(gcol, col, ground);

    // Mood grade.
    float lum = dot(col, vec3(0.299, 0.587, 0.114));
    col = mix(vec3(lum), col, 0.65 + 0.5 * audioValence);
    col *= 0.9 + 0.3 * audioLevel;

    fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
