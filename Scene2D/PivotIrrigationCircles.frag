#version 330 core
out vec4 fragColor;
/**
 * @file PivotIrrigationCircles.frag
 * @brief PIVOT IRRIGATION CIRCLES: centre-pivot fields seen from above,
 * as a satellite sees them -- a grid of green discs on dry ground, each
 * with its irrigation arm sweeping round on the scene clock and leaving a
 * darker, wetter wedge behind it that dries out again over the turn.
 * Each field takes a chroma class for its crop colour; the kick raises a
 * dust plume behind a tractor on one of the section roads.  The photo is
 * the soil and the crop texture.  Camera fixed, straight down.
 *
 * Audio Reactivity:
 *   audioChroma[12] -> crop colour per field (light)
 *   sceneAdvance    -> the pivot arms sweep (continuous)
 *   audioSwell      -> how green the season is (slow)
 *   audioKick       -> a dust plume on a road (light)
 *   audioHigh       -> the sprinkler mist sparkle (light)
 *
 * Per-activation variety: fieldsP, dryP, hueP.
 */
uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float sceneAdvance;
uniform float sceneTime;
uniform float audioAdvance;
uniform float audioChroma[12];
uniform float audioSwell;
uniform float audioKick;
uniform float audioHigh;
uniform float audioLevel;
uniform float audioChromaHue;
uniform float audioValence;

uniform float fieldsP;
uniform float dryP;
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
float noise2(vec2 p)
{
    vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x),
               mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), f.x), f.y);
}
float fbm(vec2 p) { float v = 0.0, a = 0.5; for (int i = 0; i < 4; ++i) { v += a * noise2(p); p = p * 2.03 + 8.7; a *= 0.5; } return v; }

void main()
{
    float aspect = resolution.x / resolution.y;
    vec2 uv = gl_FragCoord.xy / resolution;
    vec2 p = (uv - 0.5) * vec2(aspect, 1.0);

    float hue = (hueP > 0.001) ? hueP : 0.0;
    float cols = 3.0 + floor(clamp(fieldsP, 0.0, 1.0) * 2.0);           // fields across
    float dry = 0.4 + 0.8 * clamp(dryP, 0.0, 1.0);
    float season = clamp(audioSwell, 0.0, 1.0);
    float hi = clamp(audioHigh * 2.0, 0.0, 1.0);
    float clock = sceneAdvance * 0.4 + sceneTime * 0.08;

    // The ground between the fields: dry soil from the photo, with the
    // section roads laid on a square grid.
    vec3 soil = img(uv * 2.0) * mix(vec3(0.68, 0.55, 0.38), imgPalette(hue * 0.159 + 0.1), 0.25);
    soil *= 0.7 + 0.45 * fbm(p * 14.0);
    soil *= 0.85 + 0.25 * dry;
    vec3 col = soil;

    // The field lattice.
    float pitch = aspect * 2.0 / cols;
    vec2 g = (p + vec2(aspect, 0.5)) / pitch;
    vec2 ci = floor(g);
    vec2 cf = (fract(g) - 0.5) * pitch;                                  // metric offset in the cell
    float radius = pitch * 0.44;
    float r = length(cf);
    float ang = atan(cf.y, cf.x);
    int cls = int(mod(ci.x * 3.0 + ci.y * 5.0, 12.0));
    float e = clamp(audioChroma[cls] * 1.6, 0.0, 1.0);
    // The crop: green, tinted by the class, textured from the photo.
    vec3 crop = mix(vec3(0.22, 0.45, 0.16), imgPalette(hue * 0.159 + float(cls) / 12.0), 0.4);
    crop = mix(crop, crop * vec3(1.3, 1.15, 0.7), 0.35 * (1.0 - season));  // drier late in the season
    crop *= 0.6 + 0.55 * fbm((cf + ci * 3.1) * 30.0);
    crop *= 0.75 + 0.5 * e;
    // Each pivot turns at its own steady rate; the arm angle is the clock.
    float rate = 0.18 + 0.12 * hash21(ci + 3.3);
    float armA = clock * rate + hash21(ci + 7.7) * 6.2831853;
    // The wetted wedge: behind the arm it is dark and wet, drying out over
    // the rest of the turn (a smooth ramp, so nothing snaps at the seam).
    float behind = mod(armA - ang, 6.2831853) / 6.2831853;               // 0 just watered, 1 about to be
    float wet = exp(-behind * 3.2);
    crop = mix(crop, crop * vec3(0.55, 0.75, 0.6), wet * 0.7);
    // Tracks: the faint concentric wheel ruts of the towers.
    crop *= 0.92 + 0.12 * smoothstep(0.06, 0.2, abs(fract(r / radius * 6.0) - 0.5));
    float inField = smoothstep(radius, radius - 0.006, r);
    col = mix(col, crop, inField);
    // The corners between circles: dry, sometimes with a small square plot.
    float corner = (1.0 - inField) * step(0.55, hash21(ci + 11.3));
    col = mix(col, mix(soil, vec3(0.35, 0.4, 0.2), 0.4), corner * 0.4);
    // The arm itself: a thin bright line from the centre out, with the
    // sprinkler mist just behind it.
    vec2 armDir = vec2(cos(armA), sin(armA));
    float alongArm = dot(cf, armDir);
    float acrossArm = length(cf - armDir * alongArm);
    float arm = smoothstep(0.006, 0.002, acrossArm) * step(0.0, alongArm) * step(alongArm, radius);
    col = mix(col, vec3(0.85, 0.86, 0.88), arm * inField * 0.9);
    // The mist: a soft band trailing the arm.
    float trail = mod(armA - ang, 6.2831853);
    float mist = exp(-trail * 22.0) * smoothstep(radius, radius * 0.05, r) * inField;
    col += mix(vec3(0.8, 0.9, 1.0), imgPalette(hue * 0.159 + 0.5), 0.3) * mist * (0.3 + 0.9 * hi) * 0.7;
    // The pivot point.
    col = mix(col, vec3(0.5, 0.5, 0.5), smoothstep(0.012, 0.006, r) * inField);
    // Roads on the lattice lines, and a tractor raising dust on the kick.
    float road = smoothstep(0.012, 0.006, abs(fract(g.x) - 0.5) * pitch)
               + smoothstep(0.012, 0.006, abs(fract(g.y) - 0.5) * pitch);
    col = mix(col, mix(vec3(0.62, 0.55, 0.42), soil, 0.3), clamp(road, 0.0, 1.0) * 0.8);
    for (int i = 0; i < 2; ++i)
    {
        float fi = float(i);
        float ph = fract(clock * 0.07 + fi * 0.5);
        vec2 t = vec2((ph - 0.5) * aspect * 2.0, (floor(hash11(fi * 3.3) * cols) + 0.5) * pitch - 0.5);
        float d = length(p - t);
        col = mix(col, vec3(0.15, 0.12, 0.1), smoothstep(0.01, 0.004, d));
        // The plume: round dust behind it.
        vec2 dq = p - t + vec2(0.035, 0.0);
        col += vec3(0.75, 0.65, 0.5) * exp(-length(dq * vec2(0.7, 2.2)) * 22.0) * (0.15 + 1.1 * audioKick);
    }
    // A high thin cloud shadow drifting across everything.
    col *= 0.88 + 0.2 * smoothstep(0.35, 0.65, fbm(p * 1.6 + vec2(clock * 0.05, 0.0)));
    col *= 0.9 + 0.2 * audioLevel;

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
