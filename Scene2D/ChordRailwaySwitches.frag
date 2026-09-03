#version 330 core
out vec4 fragColor;
/**
 * @file ChordRailwaySwitches.frag
 * @brief CHORD RAILWAY SWITCHES: a marshalling yard from above -- five
 * parallel tracks crossing the field diagonally, twelve crossovers along
 * them, one per chroma class: each crossover has a signal lit by its
 * class and a switch blade that leans over smoothly as the class sounds.
 * Trains of photo wagons run the yard on the scene clock, each on a route
 * fixed for the activation, sliding across the crossovers on smooth
 * S-curves; the kick lights the headlamps.  The photo is the landscape.
 * Camera fixed above the yard.
 *
 * Audio Reactivity:
 *   audioChroma[12] -> signals and switch blades (light / gentle)
 *   sceneAdvance    -> the trains (continuous)
 *   audioKick       -> headlamps (light)
 *   audioSwell      -> daylight (slow)
 *   audioLevel      -> brightness
 *
 * Per-activation variety: trainsP, routeP, hueP.
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
uniform float audioKick;
uniform float audioSwell;
uniform float audioLevel;
uniform float audioChromaHue;
uniform float audioValence;

uniform float trainsP;
uniform float routeP;
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

const float kTrackGap = 0.13;
const float kYardLen  = 2.6;                                           // yard length along the track axis

// The track a train is on at yard position s: its route is a list of
// track indices, changing at the crossovers (every 0.2 along s) with an
// S-curve; the lateral coordinate is continuous.
float routeLateral(float s, float routeSeed)
{
    float seg = floor(s / 0.2);
    float f = fract(s / 0.2);
    // Track at this segment and the next (a random walk within 0..4).
    float t0 = floor(hash11(seg * 3.3 + routeSeed) * 5.0);
    float t1 = floor(hash11((seg + 1.0) * 3.3 + routeSeed) * 5.0);
    if (abs(t1 - t0) > 1.0) t1 = t0 + sign(t1 - t0);                   // only to a neighbour
    float blend = smoothstep(0.55, 1.0, f);                             // the S-curve at the end of the segment
    return (mix(t0, t1, blend) - 2.0) * kTrackGap;
}

void main()
{
    float aspect = resolution.x / resolution.y;
    vec2 p = (gl_FragCoord.xy / resolution - 0.5) * vec2(aspect, 1.0);

    float hue = (hueP > 0.001) ? hueP : 0.0;
    float trains = 2.0 + floor(clamp(trainsP, 0.0, 1.0) * 3.0);
    float routeSeed = floor(clamp(routeP, 0.0, 1.0) * 97.0) * 1.7;
    float day = 0.55 + 0.6 * clamp(audioSwell, 0.0, 1.0);
    float clock = sceneAdvance * 0.25 + sceneTime * 0.05;

    // Yard axes: the track axis runs diagonally (bottom-left to top-right).
    vec2 axis = normalize(vec2(1.0, 0.42));
    vec2 nrm = vec2(-axis.y, axis.x);
    float s = dot(p, axis) + kYardLen * 0.5;                            // 0 .. kYardLen across the screen
    float t = dot(p, nrm);                                              // lateral
    // The landscape: the photo as fields, a little desaturated, day light.
    vec3 col = img(gl_FragCoord.xy / resolution) * mix(vec3(0.7), imgPalette(hue * 0.159 + 0.3), 0.3) * day;
    // The ballast bed across the five tracks.
    float bed = smoothstep(kTrackGap * 2.8, kTrackGap * 2.5, abs(t));
    col = mix(col, vec3(0.42, 0.4, 0.38) * day * (0.85 + 0.15 * sin(s * 300.0) * sin(t * 250.0)), bed * 0.85);
    // Tracks: five, with sleepers and two rails each; every track glows in the colour of the class of the nearest crossover.
    for (int k = 0; k < 5; ++k)
    {
        float ty = (float(k) - 2.0) * kTrackGap;
        float dt = abs(t - ty);
        float sleepers = step(dt, 0.03) * pow(0.5 + 0.5 * cos(s * 120.0), 8.0);
        col = mix(col, vec3(0.3, 0.22, 0.15) * day, sleepers * 0.9);
        float rail = smoothstep(0.004, 0.002, abs(dt - 0.016));
        col = mix(col, vec3(0.75, 0.75, 0.8) * day, rail);
    }
    // Crossovers and signals: twelve along the yard, one per class.
    for (int c = 0; c < 12; ++c)
    {
        float sc = (float(c) + 0.85) * 0.2;                             // crossover position along s
        float e = clamp(audioChroma[c] * 1.5, 0.0, 1.0);
        vec3 cc = imgPalette(hue * 0.159 + float(c) / 12.0) * 1.4 + 0.15;
        // The crossover: a diagonal rail pair between two neighbouring tracks (which ones: by c).
        float ta = (mod(float(c), 4.0) - 2.0) * kTrackGap;
        float tb = ta + kTrackGap;
        float u = clamp((s - sc + 0.06) / 0.12, 0.0, 1.0);
        float ys = mix(ta, tb, smoothstep(0.0, 1.0, u));
        float within = step(sc - 0.06, s) * step(s, sc + 0.06);
        float xrail = smoothstep(0.004, 0.002, abs(abs(t - ys) - 0.016)) * within;
        col = mix(col, vec3(0.75, 0.75, 0.8) * day, xrail);
        // The blade: a short bright rail at the start of the crossover, leaning over with the class (gentle).
        float lean = 0.3 + 0.7 * smoothstep(0.15, 0.6, e);
        float bladeT = ta + lean * 0.035;
        float blade = smoothstep(0.005, 0.002, abs(t - bladeT)) * step(sc - 0.06, s) * step(s, sc - 0.02);
        col = mix(col, cc * 0.9, blade);
        // The signal: a post beside the bed with a lamp lit by the class.
        vec2 sp = vec2(sc - kYardLen * 0.5, kTrackGap * 3.0) ;
        vec2 sq = vec2(s - kYardLen * 0.5, t) - sp;
        float post = smoothstep(0.006, 0.003, abs(sq.x)) * step(0.0, sq.y) * step(sq.y, 0.08);
        col = mix(col, vec3(0.2) * day, post);
        float lamp = smoothstep(0.02, 0.014, length(sq - vec2(0.0, 0.09)));
        col = mix(col, vec3(0.12), lamp);
        col += cc * e * (smoothstep(0.016, 0.006, length(sq - vec2(0.0, 0.09))) * 1.6 + exp(-length(sq - vec2(0.0, 0.09)) * 30.0) * 0.8);
        // Track light: the class lights the track section around its crossover.
        col += cc * e * 0.25 * bed * exp(-abs(s - sc) * 8.0) * smoothstep(0.03, 0.0, min(abs(abs(t - ta) - 0.016), abs(abs(t - tb) - 0.016)));
    }
    // The trains: each a locomotive and wagons of the photo, running along s on the clock, on its route.
    for (int n = 0; n < 5; ++n)
    {
        if (float(n) >= trains) break;
        float fn = float(n);
        float speed = 0.6 + 0.3 * hash11(fn * 7.1 + routeSeed);
        float head = fract(clock * speed + fn / trains) * (kYardLen + 0.6) - 0.3;   // head position along s
        float seed = routeSeed + fn * 11.0;
        for (int w = 0; w < 5; ++w)
        {
            float ws = head - float(w) * 0.075;
            float wl = routeLateral(ws, seed);
            vec2 wq = vec2(s - ws, t - wl);
            // The car: a rounded box along the axis.
            float car = smoothstep(0.004, 0.0, max(abs(wq.x) - 0.032, abs(wq.y) - 0.022));
            vec3 body = (w == 0) ? vec3(0.25, 0.25, 0.28) : img(clamp(vec2(0.2 + 0.15 * float(w) + fn * 0.1, 0.5) + wq * 3.0, 0.0, 1.0)) * mix(vec3(1.0), imgPalette(hue * 0.159 + fn * 0.2), 0.4) * 1.3;
            body *= day * (0.8 + 0.2 * smoothstep(-0.022, 0.0, wq.y));
            col = mix(col, body, car);
            // Roof line and shadow.
            col = mix(col, body * 0.6, smoothstep(0.003, 0.0, abs(wq.y - 0.012)) * car);
            col *= 1.0 - smoothstep(0.02, 0.0, max(abs(wq.x + 0.01) - 0.032, abs(wq.y + 0.02) - 0.022)) * 0.3 * (1.0 - car);
            // Headlamps on the locomotive, bright on the kick, a beam ahead.
            if (w == 0)
            {
                float lampD = length(wq - vec2(0.035, 0.0));
                col += vec3(1.0, 0.95, 0.8) * (smoothstep(0.008, 0.003, lampD) * 1.5 + exp(-lampD * 25.0) * 0.6) * (0.4 + 1.2 * audioKick);
                float beam = smoothstep(0.03, 0.0, abs(wq.y)) * step(0.03, wq.x) * exp(-(wq.x - 0.03) * 8.0);
                col += vec3(1.0, 0.95, 0.8) * beam * 0.35 * (0.4 + 0.8 * audioKick);
            }
        }
    }
    col *= 0.75 + 0.5 * audioLevel;

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
