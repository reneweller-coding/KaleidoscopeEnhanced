#version 330 core
out vec4 fragColor;
/**
 * @file MetronomeForest.frag
 * @brief METRONOME FOREST: rows of wind-up metronomes on a bench, each
 * set to its own tempo.  Every pendulum swings on the scene clock at its
 * own fixed rate -- deliberately NOT beat-synced, because a whole rank of
 * arms snapping to a kick is the jolt this catalogue does not do.  What
 * the music controls is light: a metronome brightens when its own swing
 * happens to line up with the beat phase, so the rank slowly finds and
 * loses agreement with the track.  Camera fixed on the bench.
 *
 * Audio Reactivity:
 *   sceneAdvance -> every pendulum swings at its own steady rate (continuous)
 *   audioBeatPhase-> which metronomes read as in agreement (light only)
 *   audioChroma[12] -> the case colours (light)
 *   audioSwell   -> the room light (slow)
 *   audioKick    -> the bell of the one nearest agreement (light)
 *
 * Per-activation variety: ranksP, spreadP, hueP.
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
uniform float audioBeatPhase;
uniform float audioSwell;
uniform float audioKick;
uniform float audioHigh;
uniform float audioLevel;
uniform float audioChromaHue;
uniform float audioValence;

uniform float ranksP;
uniform float spreadP;
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

float segD(vec2 p, vec2 a, vec2 b)
{
    vec2 d = b - a;
    float t = clamp(dot(p - a, d) / max(dot(d, d), 1e-6), 0.0, 1.0);
    return length(p - (a + d * t));
}

void main()
{
    float aspect = resolution.x / resolution.y;
    vec2 uv = gl_FragCoord.xy / resolution;
    vec2 p = (uv - 0.5) * vec2(aspect, 1.0);

    float hue = (hueP > 0.001) ? hueP : 0.0;
    float ranks = 2.0 + floor(clamp(ranksP, 0.0, 1.0) * 2.0);           // rows of metronomes
    float spread = 0.35 + 0.5 * clamp(spreadP, 0.0, 1.0);               // how far the tempi differ
    float lamp = 0.65 + 0.55 * clamp(audioSwell, 0.0, 1.0);
    float hi = clamp(audioHigh * 2.0, 0.0, 1.0);
    float clock = sceneAdvance * 1.0 + sceneTime * 0.2;

    // The room: a dark wall and a bench with the photo as its wood.
    vec3 wall = img(vec2(uv.x, 0.6 + uv.y * 0.4)) * mix(vec3(0.16, 0.15, 0.16), imgPalette(hue * 0.159 + 0.6) * 0.3, 0.5);
    vec3 col = wall * lamp * 0.7;

    // Ranks of metronomes, further rows higher and smaller.
    for (int rank = 0; rank < 3; ++rank)
    {
        float fr = float(rank);
        if (fr >= ranks) break;
        float depth = fr / max(ranks - 1.0, 1.0);
        float scale = mix(1.0, 0.62, depth);
        float baseY = -0.42 + depth * 0.3;
        // The bench this rank stands on.
        float bench = smoothstep(0.02, 0.0, abs(p.y - baseY + 0.02)) * step(abs(p.x), aspect * 0.5);
        vec3 wood = img(vec2(uv.x * 1.4, 0.2 + depth * 0.2)) * mix(vec3(0.4, 0.28, 0.18), imgPalette(hue * 0.159 + 0.1), 0.25);
        col = mix(col, wood * lamp * (1.0 - depth * 0.3), bench);
        float count = 5.0 + fr;
        for (int i = 0; i < 8; ++i)
        {
            float fi = float(i);
            if (fi >= count) break;
            float x = ((fi + 0.5) / count - 0.5) * aspect * 1.7 * (1.0 - depth * 0.12);
            vec2 base = vec2(x, baseY);
            // The case: a tapered pyramid with a rounded top.
            vec2 q = (p - base) / scale;
            float h = 0.3;
            float halfW = 0.075 * (1.0 - q.y / h * 0.55);
            float inCase = step(0.0, q.y) * step(q.y, h) * step(abs(q.x), max(halfW, 0.0));
            int cls = int(mod(fi * 2.0 + fr * 5.0, 12.0));
            float e = clamp(audioChroma[cls] * 1.6, 0.0, 1.0);
            // Its own tempo, fixed for the activation.
            float rate = 1.0 + spread * (hash11(fi * 3.7 + fr * 11.0) - 0.5) * 2.0;
            float phase = clock * rate * 0.55 + hash11(fi * 5.3 + fr) * 6.2831853;
            float swing = sin(phase);
            // Agreement: how close this metronome's own phase is to the
            // track's beat phase.  This only ever changes LIGHT.
            float own = fract(phase / 6.2831853);
            float diff = abs(own - fract(audioBeatPhase));
            diff = min(diff, 1.0 - diff);
            float agree = smoothstep(0.12, 0.0, diff);
            vec3 caseCol = mix(vec3(0.42, 0.28, 0.16), imgPalette(hue * 0.159 + float(cls) / 12.0), 0.35);
            caseCol *= 0.55 + 0.5 * e + 0.5 * agree;
            caseCol *= 0.6 + 0.55 * (1.0 - abs(q.x) / max(halfW, 1e-3));   // rounded front
            caseCol *= 0.85 + 0.25 * noise2(q * 30.0);                     // wood grain
            if (inCase > 0.5)
            {
                col = mix(col, caseCol * lamp * (1.0 - depth * 0.25), inCase);
                // The scale plate: a pale strip up the middle with marks.
                float plate = step(abs(q.x), 0.016) * step(0.05, q.y) * step(q.y, h - 0.03);
                col = mix(col, vec3(0.88, 0.85, 0.78) * lamp, plate);
                float marks = plate * smoothstep(0.004, 0.0, abs(fract(q.y * 40.0) - 0.5) - 0.45);
                col = mix(col, vec3(0.2), marks);
            }
            // The pendulum: a rod from the base pivot with a sliding weight.
            vec2 pivot = base + vec2(0.0, 0.05 * scale);
            float ang = swing * 0.42;
            vec2 dir = vec2(sin(ang), cos(ang));
            float rodLen = 0.34 * scale;
            float rodD = segD(p, pivot, pivot + dir * rodLen);
            float rod = smoothstep(0.006 * scale, 0.003 * scale, rodD);
            vec3 rodCol = vec3(0.75, 0.75, 0.78) * lamp;
            rodCol += vec3(1.0) * agree * (0.3 + 0.6 * hi);
            col = mix(col, rodCol, rod);
            // The weight on the rod: its height is the tempo, fixed.
            float wPos = 0.35 + 0.45 * hash11(fi * 7.7 + fr * 3.0);
            vec2 wc = pivot + dir * rodLen * wPos;
            float weight = smoothstep(0.022 * scale, 0.016 * scale, length((p - wc) * vec2(1.0, 1.5)));
            col = mix(col, mix(vec3(0.55, 0.4, 0.22), imgPalette(hue * 0.159 + float(cls) / 12.0), 0.3) * lamp, weight);
            // The bell on the one nearest agreement, on the kick: light only.
            col += imgPalette(hue * 0.159 + float(cls) / 12.0) * exp(-length(p - (pivot + dir * rodLen)) * 22.0)
                 * agree * audioKick * 1.4;
        }
    }
    col *= 0.9 + 0.2 * audioLevel;

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
