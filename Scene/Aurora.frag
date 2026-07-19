// Aurora.frag
// -----------------------------------------------------------------------
// AURORA BOREALIS: slowly waving curtains of light over a dark starfield,
// the image glowing through the curtains as their colour texture.  Calm and
// majestic — an ambient-first effect.
//   swell     -> the display flares up (real aurora "breathing")
//   centroid  -> how high the curtains reach / their brightness
//   chroma    -> hue drift of the whole display (via audioChromaHue)
//   pitch     -> the curtains' altitude drifts with the dominant tone
// Jump-free: curtain waves ride time + audioPhase (integrated).
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

uniform float bandsP;
uniform float hueP;
uniform float heightP;
uniform float speedP;

vec3 img(vec2 uv) { return (interpolation * texture2D(tex0, uv)
                          + (1.0 - interpolation) * texture2D(tex1, uv)).rgb; }
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

    // --- The aurora curtains. ---
    // Curtain profile along x: layered waves, drifting with the integrated
    // phase; the wave FIELD (not the amplitude) moves -> silky motion.
    float t = time * 0.05 * spd + audioAdvance * 0.15;
    float wave = 0.0;
    wave += 0.55 * sin(uv.x * 6.0 * bands + t * 1.00 + audioPhase * 0.20);
    wave += 0.30 * sin(uv.x * 11.0 * bands - t * 0.63 + 1.7);
    wave += 0.18 * fbm(vec2(uv.x * 4.0 * bands, t * 0.35)) * 2.0 - 0.18;

    // The curtain hangs from an upper edge that waves; light falls off
    // downward (exp) and cuts off softly at the lower rim.  Reach and
    // brightness VARY along x (fbm envelope), so the display has bright
    // active regions and dark gaps instead of a uniform picket fence.
    float env    = fbm(vec2(uv.x * 2.3 * bands + wave * 0.3, t * 0.22));
    float base   = 0.55 + 0.18 * wave + (audioPitch - 0.5) * 0.18;
    float reach  = (0.30 + 0.25 * audioCentroid + 0.10 * audioSwell)
                 * height * (0.55 + 0.9 * env);
    float d      = base - uv.y;
    float body   = exp(-max(d, 0.0) / max(reach, 0.05))
                 * smoothstep(-0.02, 0.10, d);

    // Vertical RAYS inside the curtain: fine striation whose phase is bent
    // by the wave field and the envelope, so no two rays look alike.
    float rays = 0.55 + 0.45 * sin(uv.x * 95.0 * bands + wave * 9.0 + env * 7.0);
    rays = pow(rays, 2.0);

    float glow = body * rays * (0.25 + 1.15 * env)
               * (0.45 + 0.85 * audioSwell + 0.25 * audioLevel);

    // Colour: green core -> purple fringe (top), tinted by the image and the
    // music's key colour; hueP re-rolls the whole family per activation.
    vec3 cGreen  = vec3(0.10, 0.95, 0.45);
    vec3 cPurple = vec3(0.55, 0.20, 0.85);
    float fringe = clamp(max(d, 0.0) / max(reach, 0.05), 0.0, 1.0);
    vec3 acol = mix(cGreen, cPurple, fringe * fringe);
    vec3 pic  = img(vec2(uv.x, base) );
    acol = mix(acol, acol * (0.4 + 1.4 * pic), 0.45);
    acol = hueRot(acol, hueP + audioChromaHue * 1.2);

    vec3 col = sky + acol * glow;

    // Ground silhouette: a dark ridge line at the bottom.
    float ridge = 0.06 + 0.04 * fbm(vec2(uv.x * 3.0, 7.7));
    col *= smoothstep(ridge - 0.015, ridge + 0.015, uv.y);

    // Mood grade.
    float lum = dot(col, vec3(0.299, 0.587, 0.114));
    col = mix(vec3(lum), col, 0.65 + 0.5 * audioValence);
    col *= 0.9 + 0.3 * audioLevel;

    gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
