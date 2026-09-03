#version 330 core
out vec4 fragColor;
/**
 * @file CalligraphyBrushStrokes.frag
 * @brief CALLIGRAPHY BRUSH STROKES: a brush writing on paper.  Strokes
 * are laid down on the scene clock -- each a curve drawn from its start
 * with a pressure profile that swells and thins -- and the ink bleeds
 * into the paper on the swell (the strokes soften and spread), the bass
 * sets the pressure (stroke width, slow), the kick is a dab of the brush
 * (a splash of ink as round drops), the treble the dry-brush fibre.  The
 * photo is the paper's watermark and the ink's washes.  Camera fixed over
 * the desk.
 *
 * Audio Reactivity:
 *   sceneAdvance -> strokes drawn (continuous)
 *   audioSwell   -> ink bleed (slow)
 *   audioBass    -> pressure / stroke width (slow)
 *   audioKick    -> ink splash drops (light)
 *   audioHigh    -> dry-brush fibre (light)
 *   audioLevel   -> brightness
 *
 * Per-activation variety: strokesP, widthP, hueP.
 */
uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float sceneAdvance;
uniform float sceneTime;
uniform float audioAdvance;
uniform float audioSwell;
uniform float audioBass;
uniform float audioKick;
uniform float audioHigh;
uniform float audioLevel;
uniform float audioChromaHue;
uniform float audioValence;

uniform float strokesP;
uniform float widthP;
uniform float hueP;

vec3 img(vec2 uv) {
    return (interpolation * texture(tex0, uv) + (1.0 - interpolation) * texture(tex1, uv)).rgb;
}

vec3 imgPalette(float t)
{
    float ang = audioChromaHue + audioAdvance * 0.04 + t * 6.2831853;
    float rad = 0.16 + 0.08 * sin(audioAdvance * 0.013);
    vec3  col = img(clamp(vec2(0.5) + rad * vec2(cos(ang), sin(ang)), 0.0, 1.0));
    float g   = dot(col, vec3(0.333));
    return mix(vec3(g), col, 0.55 + 0.45 * audioValence);
}

float hash11(float n) { return fract(sin(n * 127.1) * 43758.5453); }
float hash21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

// A stroke: a cubic-ish curve from a start with two bends; returns the
// distance and the parameter along it (for the pressure profile).
float strokeDist(vec2 p, float seed, float drawn, out float along)
{
    vec2 s0 = vec2((hash11(seed) - 0.5) * 1.2, (hash11(seed + 1.0) - 0.5) * 0.8);
    vec2 d0 = normalize(vec2(hash11(seed + 2.0) - 0.5, hash11(seed + 3.0) - 0.5) + vec2(0.3, -0.5));
    float len = 0.3 + 0.4 * hash11(seed + 4.0);
    float best = 1e9; along = 0.0;
    vec2 prev = s0;
    for (int i = 1; i <= 24; ++i)
    {
        float t = float(i) / 24.0;
        if (t > drawn) break;
        float bend = 2.5 * sin(t * 6.0 + seed) * hash11(seed + 5.0);
        vec2 dir = vec2(cos(bend) * d0.x - sin(bend) * d0.y, sin(bend) * d0.x + cos(bend) * d0.y);
        vec2 q = prev + dir * len / 24.0;
        vec2 dd = q - prev; float u = clamp(dot(p - prev, dd) / max(dot(dd, dd), 1e-6), 0.0, 1.0);
        float dist = length(p - (prev + dd * u));
        if (dist < best) { best = dist; along = t - (1.0 - u) / 24.0; }
        prev = q;
    }
    return best;
}

void main()
{
    float aspect = resolution.x / resolution.y;
    vec2 p = (gl_FragCoord.xy / resolution - 0.5) * vec2(aspect, 1.0);

    float hue = (hueP > 0.001) ? hueP : 0.0;
    int nStrokes = 5 + int(clamp(strokesP, 0.0, 1.0) * 5.0);
    float width = (0.02 + 0.02 * clamp(widthP, 0.0, 1.0)) * (0.7 + 0.7 * clamp(audioBass, 0.0, 1.0));
    float bleed = 0.005 + 0.03 * clamp(audioSwell, 0.0, 1.0);
    float hi = clamp(audioHigh * 2.0, 0.0, 1.0);
    float clock = sceneAdvance * 0.25 + sceneTime * 0.05;

    // Paper: warm white, the photo as a faint watermark, fibre.
    vec3 paper = vec3(0.94, 0.9, 0.8) * (0.9 + 0.1 * dot(img(gl_FragCoord.xy / resolution), vec3(0.333)));
    paper *= 0.97 + 0.03 * hash21(floor(p * 250.0));
    vec3 col = paper;
    vec3 ink = mix(vec3(0.05, 0.04, 0.06), imgPalette(hue * 0.159 + 0.6) * 0.25, 0.35);
    // Strokes: the set cycles on the clock -- stroke i is drawn during its
    // window, stays, and the whole page fades and starts again every cycle
    // (the fade is a slow crossfade, not a cut).
    float cycle = fract(clock);
    float pageFade = smoothstep(0.92, 1.0, cycle);                    // the page washes out at the end of the cycle
    float pageIn = smoothstep(0.0, 0.03, cycle);
    for (int i = 0; i < 10; ++i)
    {
        if (i >= nStrokes) break;
        float fi = float(i);
        float start = fi / float(nStrokes) * 0.85;
        float drawn = clamp((cycle - start) / 0.12, 0.0, 1.0);
        if (drawn <= 0.0) continue;
        float along;
        float seed = fi * 7.3 + floor(clock) * 3.1;
        float d = strokeDist(p, seed, drawn, along);
        // Pressure: swells in the middle, thin at the ends; the tip taper.
        float pressure = sin(along * 3.14159) * (0.6 + 0.4 * hash11(seed + 6.0)) + 0.15;
        float w = width * pressure;
        float body = smoothstep(w + bleed, w - 0.002, d);
        // Dry-brush fibre: streaks along the stroke where the treble is high.
        float fibre = 1.0 - hi * 0.6 * step(0.5, fract(d * 120.0 + along * 40.0)) * smoothstep(w * 0.4, w, d);
        float density = body * fibre * (1.0 - pageFade) * pageIn;
        // The wet edge: the freshly drawn end is darker and glossy.
        float fresh = smoothstep(drawn - 0.08, drawn, along) * step(drawn, 0.999);
        col = mix(col, ink, density * (0.85 + 0.15 * fresh));
        col += vec3(0.3, 0.3, 0.35) * fresh * body * 0.3;
    }
    // Ink splash on the kick: round drops near the current brush position.
    float curStroke = floor(cycle * float(nStrokes) / 0.85);
    vec2 splashC = vec2((hash11(curStroke * 7.3 + floor(clock) * 3.1) - 0.5) * 1.2, (hash11(curStroke * 7.3 + floor(clock) * 3.1 + 1.0) - 0.5) * 0.8);
    vec2 su = (p - splashC) * 40.0; vec2 sc = floor(su); vec2 sf = fract(su) - 0.5;
    vec2 so = vec2(hash21(sc + 1.3), hash21(sc + 5.9)) - 0.5;
    float drops = smoothstep(0.25, 0.1, length(sf - so * 0.6)) * step(0.9, hash21(sc)) * exp(-length(p - splashC) * 6.0);
    col = mix(col, ink, drops * audioKick * (1.0 - pageFade));
    // The red seal stamp in the corner.
    vec2 seal = p - vec2(aspect * 0.4, -0.38);
    float stamp = step(abs(seal.x), 0.05) * step(abs(seal.y), 0.05) * smoothstep(0.25, 0.75, 0.5 + 0.5 * sin(seal.x * 140.0) * sin(seal.y * 140.0 + 2.0 * sin(seal.x * 90.0)));   // carved strokes, smooth
    col = mix(col, vec3(0.75, 0.15, 0.1), stamp * 0.85);
    col *= 0.75 + 0.5 * audioLevel;

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
