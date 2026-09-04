#version 330 core
out vec4 fragColor;
/**
 * @file ThermalIronbowStreet.frag
 * @brief THERMAL IRONBOW STREET: a street seen through a thermal camera.
 * The photo becomes a temperature field in the ironbow palette -- black
 * through purple and orange to white -- warm bodies walk across it on the
 * scene clock as soft blobs with a bright core, exhaust breath drifts,
 * and the ambient heat rises with the swell.  The kick is a hot doorway
 * opening (a local flare, not a frame flash).  The camera's own furniture
 * (spot meter, scale bar, noise) sits on top.  Camera fixed.
 *
 * Audio Reactivity:
 *   audioSwell   -> ambient temperature and the scale (slow)
 *   sceneAdvance -> the walkers and their breath (continuous)
 *   audioKick    -> the doorway flare (light, local)
 *   audioBass    -> the road's stored heat (slow)
 *   audioHigh    -> sensor noise (light)
 *
 * Per-activation variety: walkP, gainP, hueP.
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
uniform float audioKick;
uniform float audioBass;
uniform float audioHigh;
uniform float audioLevel;
uniform float audioChromaHue;
uniform float audioValence;

uniform float walkP;
uniform float gainP;
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

// Ironbow: the standard thermal ramp, cold black -> purple -> red -> orange
// -> yellow -> white.  Kept smooth so a moving edge never bands.
vec3 ironbow(float t)
{
    t = clamp(t, 0.0, 1.0);
    vec3 c = mix(vec3(0.0, 0.0, 0.06), vec3(0.22, 0.03, 0.42), smoothstep(0.0, 0.22, t));
    c = mix(c, vec3(0.62, 0.08, 0.42), smoothstep(0.22, 0.42, t));
    c = mix(c, vec3(0.92, 0.28, 0.12), smoothstep(0.42, 0.62, t));
    c = mix(c, vec3(1.0, 0.68, 0.1), smoothstep(0.62, 0.8, t));
    c = mix(c, vec3(1.0, 0.97, 0.85), smoothstep(0.8, 1.0, t));
    return c;
}

void main()
{
    float aspect = resolution.x / resolution.y;
    vec2 uv = gl_FragCoord.xy / resolution;
    vec2 p = (uv - 0.5) * vec2(aspect, 1.0);

    float hue = (hueP > 0.001) ? hueP : 0.0;
    float walkers = 3.0 + floor(clamp(walkP, 0.0, 1.0) * 4.0);
    float gain = 0.75 + 0.5 * clamp(gainP, 0.0, 1.0);
    float swell = clamp(audioSwell, 0.0, 1.0);
    float hi = clamp(audioHigh * 2.0, 0.0, 1.0);
    float clock = sceneAdvance * 0.4 + sceneTime * 0.08;
    float horizon = 0.06;

    // The scene as a temperature field.  The photo's luminance is the base
    // temperature; the sky reads cold, the road holds the day's heat (bass),
    // and everything is lifted a little by the ambient swell.
    vec3 ph = img(uv);
    float lum = dot(ph, vec3(0.299, 0.587, 0.114));
    float sky = smoothstep(horizon - 0.05, horizon + 0.25, p.y);
    float road = smoothstep(horizon + 0.02, horizon - 0.3, p.y);
    float temp = lum * 0.55 + 0.12;
    temp = mix(temp, temp * 0.35, sky);                                  // sky is cold
    temp += road * (0.12 + 0.22 * clamp(audioBass, 0.0, 1.0));           // asphalt stores heat
    temp += 0.1 * swell;
    // A little structure so windows and edges read as separate surfaces.
    temp += 0.06 * (noise2(p * 26.0) - 0.5);
    // The street itself, drawn rather than hoped for: a facade block on each
    // side with warm windows, the road plane between them, a cold sky above.
    float facL = smoothstep(-0.1, -0.16, p.x + aspect * 0.5 - 0.34) * step(horizon - 0.02, p.y);
    float facR = smoothstep(-0.1, -0.16, aspect * 0.5 - 0.34 - p.x) * step(horizon - 0.02, p.y);
    float facade = clamp(facL + facR, 0.0, 1.0);
    temp = mix(temp, temp * 0.55 + 0.1, facade);
    // Windows: a grid of warm rectangles on the facades, each with its own
    // steady temperature, a few of them hot.
    vec2 wg = vec2((abs(p.x) - 0.34) * 9.0, (p.y - horizon) * 11.0);
    vec2 wc = floor(wg);
    vec2 wf = fract(wg) - 0.5;
    float pane = step(abs(wf.x), 0.32) * step(abs(wf.y), 0.3) * facade * step(horizon, p.y);
    float warm = hash21(wc + 3.7);
    temp += pane * (0.1 + 0.45 * warm) * (0.7 + 0.5 * swell);
    // Road: a warm plane with tyre tracks, cooling toward the kerbs.
    float roadPlane = smoothstep(horizon, horizon - 0.35, p.y) * (1.0 - facade);
    temp += roadPlane * 0.06;
    temp -= roadPlane * 0.05 * smoothstep(0.18, 0.34, abs(p.x));
    temp += roadPlane * 0.05 * smoothstep(0.1, 0.02, abs(abs(p.x) - 0.14));
    temp *= gain;
    // A hot doorway on the left: the kick opens it.
    vec2 door = vec2(-aspect * 0.28, horizon + 0.08);
    float doorShape = smoothstep(0.09, 0.0, max(abs(p.x - door.x) - 0.02, abs(p.y - door.y) - 0.07));
    temp += doorShape * (0.12 + 0.55 * audioKick);
    temp += exp(-length((p - door) * vec2(1.0, 0.7)) * 7.0) * (0.05 + 0.35 * audioKick);

    // Walkers: warm bodies crossing on the clock.  A body is a soft blob
    // with a hotter head and a cooler outline; they never pop in.
    for (int i = 0; i < 7; ++i)
    {
        if (float(i) >= walkers) break;
        float fi = float(i);
        float speed = 0.05 + 0.05 * hash11(fi * 3.3);
        float dir = (hash11(fi * 7.1) > 0.5) ? 1.0 : -1.0;
        float ph2 = fract(clock * speed + hash11(fi * 5.9));
        float wx = (ph2 - 0.5) * aspect * 2.2 * dir;
        // Depth: further walkers are higher and smaller.
        float depth = 0.25 + 0.7 * hash11(fi * 11.3);
        float scale = mix(0.5, 1.15, depth);
        float wy = horizon - 0.02 - 0.14 * depth;
        vec2 wq = (p - vec2(wx, wy)) / scale;
        // A gentle bob on the clock, so the walk reads without a beat.
        wq.y -= 0.006 * sin(clock * 6.0 + fi * 2.0);
        float bodyD = length(wq * vec2(2.6, 1.0) - vec2(0.0, 0.02));
        float body = smoothstep(0.115, 0.03, bodyD);
        float headD = length((wq - vec2(0.0, 0.1)) * vec2(1.6, 1.0));
        float head = smoothstep(0.045, 0.012, headD);
        // Legs: two short warm strokes that swing on the clock.
        float swing = 0.02 * sin(clock * 9.0 + fi * 1.3);
        float leg = smoothstep(0.02, 0.006, min(
            length(wq - vec2( swing, -0.09)),
            length(wq - vec2(-swing, -0.09))));
        float human = clamp(body * 0.85 + head * 0.9 + leg * 0.7, 0.0, 1.4);
        temp += human * (0.55 + 0.15 * swell) * mix(0.8, 1.05, depth);
        // Breath: a cool-warm plume in front of the head, drifting on the clock.
        vec2 br = wq - vec2(dir * 0.06, 0.11);
        float breath = exp(-length(br * vec2(1.4, 2.2)) * 9.0) * (0.5 + 0.5 * noise2(wq * 12.0 + clock * 1.5));
        temp += breath * 0.16;
    }
    vec3 col = ironbow(temp);
    // Sensor noise: fine, on the treble, and a faint horizontal fixed pattern.
    col += vec3(hash21(uv * 900.0 + fract(clock)) - 0.5) * (0.03 + 0.05 * hi);
    col *= 0.97 + 0.03 * sin(uv.y * resolution.y * 3.14159);
    // Camera furniture: the centre spot meter with its reading bar, and the
    // temperature scale down the right edge.
    float cross = smoothstep(0.004, 0.0, min(abs(p.x) - 0.0, abs(p.y) - 0.0));
    float ticks = smoothstep(0.0025, 0.0, abs(abs(p.x) - 0.03)) * step(abs(p.y), 0.006)
                + smoothstep(0.0025, 0.0, abs(abs(p.y) - 0.03)) * step(abs(p.x), 0.006);
    col = mix(col, vec3(0.95), clamp(ticks, 0.0, 1.0) * 0.8);
    float sx = aspect * 0.5 - 0.045;
    float onScale = step(abs(p.x - sx), 0.018) * step(abs(p.y), 0.3);
    col = mix(col, ironbow(p.y / 0.6 + 0.5), onScale);
    float marker = smoothstep(0.006, 0.0, abs(p.y - (temp - 0.5) * 0.6)) * step(abs(p.x - sx), 0.03);
    col = mix(col, vec3(1.0), marker * 0.7);
    col *= 0.85 + 0.3 * audioLevel;

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
