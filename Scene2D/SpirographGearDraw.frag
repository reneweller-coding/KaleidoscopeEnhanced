#version 330 core
out vec4 fragColor;
/**
 * @file SpirographGearDraw.frag
 * @brief SPIROGRAPH GEAR DRAW: the toy -- a small gear rolling inside a
 * ring, the pen in one of its holes drawing a hypotrochoid.  The gear
 * rolls on the scene clock, the pen leaves a trace that persists for the
 * last turns (fading), the radii come from the chroma classes once per
 * activation (the ratio picks the number of lobes), the trace colour from
 * the class that sounds; the kick lights the pen, the treble the gear
 * teeth glint; the photo is the paper.  Camera fixed over the desk.
 *
 * Audio Reactivity:
 *   sceneAdvance    -> the rolling gear and the pen (continuous)
 *   audioChroma[12] -> trace colour brightness (light)
 *   audioKick       -> pen light (light)
 *   audioHigh       -> teeth glint (light)
 *   audioLevel      -> brightness
 *
 * Per-activation variety: ratioP (gear ratio), holeP (pen offset), hueP.
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
uniform float audioHigh;
uniform float audioLevel;
uniform float audioChromaHue;
uniform float audioValence;

uniform float ratioP;
uniform float holeP;
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

float hash21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

// Hypotrochoid: R = ring radius, r = gear radius, d = pen offset, t = angle.
vec2 hypo(float t, float R, float r, float d)
{
    float k = (R - r) / r;
    return vec2((R - r) * cos(t) + d * cos(k * t), (R - r) * sin(t) - d * sin(k * t));
}

float segDist(vec2 p, vec2 a, vec2 b)
{
    vec2 dd = b - a; float u = clamp(dot(p - a, dd) / max(dot(dd, dd), 1e-6), 0.0, 1.0);
    return length(p - (a + dd * u));
}

void main()
{
    float aspect = resolution.x / resolution.y;
    vec2 p = (gl_FragCoord.xy / resolution - 0.5) * vec2(aspect, 1.0);

    float hue = (hueP > 0.001) ? hueP : 0.0;
    float R = 0.42;
    // The gear: its radius from the ratio parameter, quantised to a
    // rational ratio so the curve closes (5..9 lobes), once per activation.
    float lobes = floor(5.0 + 4.0 * clamp(ratioP, 0.0, 1.0));
    float r = R * (lobes - 1.0) / lobes * 0.5;                        // gear radius (so k = lobes - ... a closed curve)
    r = R / lobes * 2.0;
    float d = r * (0.35 + 0.6 * clamp(holeP, 0.0, 1.0));
    float t = sceneAdvance * 1.2 + sceneTime * 0.25;
    float hi = clamp(audioHigh * 2.0, 0.0, 1.0);

    // Paper: the photo very light, with a faint grid.
    vec3 paper = mix(vec3(0.95, 0.93, 0.88), img(gl_FragCoord.xy / resolution), 0.15);
    paper *= 0.97 + 0.03 * hash21(floor(p * 200.0));
    vec3 col = paper;
    // The trace: the hypotrochoid over the last few turns, faded by age;
    // colour from the class of the current lobe (the loudest classes brighter).
    float traceLen = 6.2831853 * 3.0;
    float best = 1e9; float bestAge = 1.0; float bestSeg = 0.0;
    vec2 prev = hypo(t - traceLen, R, r, d);
    for (int s = 1; s <= 220; ++s)
    {
        float ts = t - traceLen + traceLen * float(s) / 220.0;
        vec2 q = hypo(ts, R, r, d);
        float dist = segDist(p, prev, q);
        if (dist < best) { best = dist; bestAge = 1.0 - float(s) / 220.0; bestSeg = ts; }
        prev = q;
    }
    int cls = int(mod(floor(bestSeg / 6.2831853 * lobes), 12.0));
    float e = clamp(audioChroma[cls] * 1.5, 0.0, 1.0);
    vec3 penCol = imgPalette(hue * 0.159 + float(cls) / 12.0) * 1.3 + 0.1;
    penCol = mix(penCol, vec3(0.1, 0.1, 0.3), 0.15);
    float line = smoothstep(0.009, 0.004, best);
    col = mix(col, penCol * (0.85 + 0.2 * e), line * (1.0 - bestAge * 0.6));
    // The ring: an outer toothed wheel, fixed.
    float ringD = abs(length(p) - R - r * 0.0 - 0.02);
    float ringTeeth = 0.5 + 0.5 * sin(atan(p.y, p.x) * 60.0);
    float ring = smoothstep(0.02 + 0.006 * ringTeeth, 0.0, ringD - 0.02);
    col = mix(col, vec3(0.75, 0.75, 0.78), ring * 0.9);
    // The gear: rolls inside the ring; its centre on the circle of radius R - r.
    vec2 gc = vec2((R - r) * cos(t), (R - r) * sin(t));
    float gearRot = -t * (R - r) / r;
    vec2 gq = p - gc;
    float ga = atan(gq.y, gq.x) - gearRot;
    float gearTeeth = 0.5 + 0.5 * sin(ga * (lobes * 2.0 + 6.0));
    float gear = smoothstep(r + 0.006 * gearTeeth + 0.004, r + 0.006 * gearTeeth - 0.004, length(gq));
    vec3 gearCol = mix(vec3(0.85, 0.82, 0.7), imgPalette(hue * 0.159 + 0.1), 0.2);
    gearCol *= 0.85 + 0.15 * gearTeeth;
    gearCol += vec3(1.0) * gearTeeth * hi * 0.25;
    col = mix(col, gearCol, gear * 0.9);
    // Holes in the gear, and the pen in one of them at offset d.
    for (int h = 0; h < 5; ++h)
    {
        float hr = r * (0.25 + 0.15 * float(h));
        vec2 hp = gc + vec2(cos(gearRot + float(h) * 1.2), sin(gearRot + float(h) * 1.2)) * hr;
        col = mix(col, paper * 0.9, smoothstep(0.012, 0.009, length(p - hp)) * gear);
    }
    vec2 pen = hypo(t, R, r, d);
    float penDot = smoothstep(0.016, 0.01, length(p - pen));
    col = mix(col, penCol * 0.5, penDot);
    col += penCol * exp(-length(p - pen) * 40.0) * (0.3 + 0.9 * audioKick);
    col *= 0.9 + 0.2 * audioLevel;                                     // white paper: a level swing of 50 percent strobes

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
