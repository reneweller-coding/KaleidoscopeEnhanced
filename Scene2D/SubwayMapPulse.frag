#version 330 core
out vec4 fragColor;
/**
 * @file SubwayMapPulse.frag
 * @brief SUBWAY MAP PULSE: a transit diagram in the style of a network
 * map -- straight runs, forty-five degree bends, interchange circles.
 * Twelve lines, one per chroma class; a train runs each line as a pulse
 * of light on the scene clock, and a station lights as its line sounds.
 * The photo is the printed paper the map sits on.  Camera fixed on the map.
 *
 * Audio Reactivity:
 *   audioChroma[12] -> line brightness and its stations (light)
 *   sceneAdvance    -> the trains run (continuous)
 *   audioSwell      -> the paper light (slow)
 *   audioKick       -> interchange rings flash (light)
 *   audioLevel      -> brightness
 *
 * Per-activation variety: linesP, benchP (layout), hueP.
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
uniform float audioLevel;
uniform float audioChromaHue;
uniform float audioValence;

uniform float linesP;
uniform float benchP;
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

float segD(vec2 p, vec2 a, vec2 b, out float t)
{
    vec2 d = b - a;
    t = clamp(dot(p - a, d) / max(dot(d, d), 1e-6), 0.0, 1.0);
    return length(p - (a + d * t));
}

// Node k of line L: a polyline with only horizontal, vertical and
// diagonal runs, which is what makes a diagram read as a transit map.
vec2 node(float L, float k, float aspect, float bench)
{
    float seed = L * 4.7 + k * 1.31;
    // Start on the left rim, walk right in steps; the direction is one of
    // three, chosen per node but fixed for the activation.
    float x = -aspect * 0.44 + k * (aspect * 0.88 / 6.0);
    float y = (hash11(L * 3.3) - 0.5) * 0.5;
    // Accumulate the walk so the line is continuous.
    for (float i = 1.0; i <= 6.0; i += 1.0)
    {
        if (i > k) break;
        float r = hash11(seed * 0.0 + L * 9.1 + i * 2.7);
        float step_ = (r < 0.33) ? -1.0 : (r < 0.66 ? 0.0 : 1.0);
        y += step_ * (0.06 + 0.06 * bench);
    }
    return vec2(x, clamp(y, -0.42, 0.42));
}

void main()
{
    float aspect = resolution.x / resolution.y;
    vec2 uv = gl_FragCoord.xy / resolution;
    vec2 p = (uv - 0.5) * vec2(aspect, 1.0);

    float hue = (hueP > 0.001) ? hueP : 0.0;
    float lines = 6.0 + floor(clamp(linesP, 0.0, 1.0) * 6.0);           // once per activation
    float bench = clamp(benchP, 0.0, 1.0);
    float light = 0.7 + 0.5 * clamp(audioSwell, 0.0, 1.0);
    float clock = sceneAdvance * 0.5 + sceneTime * 0.1;

    // The paper: the photo, washed out to a printed cream, with fibre grain.
    vec3 paper = mix(vec3(0.94, 0.93, 0.89), img(uv), 0.22) * light;
    paper *= 0.97 + 0.03 * img(uv * 4.0).r;
    vec3 col = paper;
    // Water and park blocks, the pale shapes a map has behind its lines.
    float river = smoothstep(0.05, 0.0, abs(p.y + 0.28 + 0.09 * sin(p.x * 2.2)));
    col = mix(col, mix(paper, vec3(0.72, 0.85, 0.95), 0.55), river * 0.8);
    float park = smoothstep(0.13, 0.1, length((p - vec2(0.32, 0.24)) * vec2(1.0, 1.4)));
    col = mix(col, mix(paper, vec3(0.8, 0.9, 0.75), 0.6), park * 0.8);

    // The lines.  Each is a 7-node polyline drawn as a thick round-capped
    // stroke; a pulse of light runs along it on the clock.
    float interD = 1e9;                                                  // nearest interchange
    float interE = 0.0;
    for (int L = 0; L < 12; ++L)
    {
        if (float(L) >= lines) break;
        float fL = float(L);
        float e = clamp(audioChroma[L] * 1.6, 0.0, 1.0);
        vec3 lc = imgPalette(hue * 0.159 + fL / 12.0) * 1.35 + 0.1;
        // Run position along the whole line, in node units.
        float trainPos = fract(clock * (0.055 + 0.02 * hash11(fL * 5.3)) + hash11(fL * 7.1)) * 6.0;
        float best = 1e9, bestS = 0.0;
        for (int k = 0; k < 6; ++k)
        {
            vec2 a = node(fL, float(k), aspect, bench);
            vec2 b = node(fL, float(k) + 1.0, aspect, bench);
            float t;
            float d = segD(p, a, b, t);
            if (d < best) { best = d; bestS = float(k) + t; }
        }
        float w = 0.013;
        float stroke = smoothstep(w, w * 0.6, best);
        col = mix(col, lc * (0.55 + 0.45 * e) * light, stroke);
        // The train: a bright bead running along, with a short tail.
        float ahead = bestS - trainPos;
        float tail = exp(-max(-ahead, 0.0) * 3.2) * smoothstep(0.35, 0.0, max(ahead, 0.0));
        col += lc * stroke * tail * (0.6 + 1.0 * e) * 1.5;
        col += lc * smoothstep(w * 2.4, 0.0, best) * exp(-abs(ahead) * 14.0) * (0.3 + 0.7 * e);
        // Stations: a tick at every node, an interchange circle at the ends.
        for (int k = 0; k <= 6; ++k)
        {
            vec2 n = node(fL, float(k), aspect, bench);
            float dn = length(p - n);
            if (k == 0 || k == 6)
            {
                float ring = smoothstep(0.024, 0.019, dn) * smoothstep(0.012, 0.017, dn);
                col = mix(col, vec3(0.12) * light, ring);
                col = mix(col, paper, smoothstep(0.013, 0.011, dn));
                if (dn < interD) { interD = dn; interE = e; }
            }
            else
            {
                float tick = smoothstep(0.009, 0.004, dn);
                col = mix(col, lc * (0.4 + 0.6 * e) * light, tick);
                col += lc * smoothstep(0.02, 0.006, dn) * e * 0.5;
            }
        }
    }
    // Interchange rings pulse on the kick, only right at the interchange.
    col += vec3(0.95, 0.92, 0.85) * smoothstep(0.03, 0.014, interD) * audioKick * (0.3 + 0.7 * interE);
    // A fold crease and the printed border, so it reads as a paper map.
    col *= 1.0 - 0.08 * smoothstep(0.012, 0.0, abs(p.x - 0.02));
    float border = smoothstep(0.006, 0.0, abs(max(abs(p.x) - aspect * 0.47, abs(p.y) - 0.45)));
    col = mix(col, vec3(0.2, 0.2, 0.22) * light, border);
    col *= 0.9 + 0.2 * audioLevel;

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
