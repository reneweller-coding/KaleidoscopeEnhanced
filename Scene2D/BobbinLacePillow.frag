#version 330 core
out vec4 fragColor;
/**
 * @file BobbinLacePillow.frag
 * @brief BOBBIN LACE PILLOW: the lace maker's pillow under a warm lamp.
 * On a dome of blue-green cotton lies the buff pricking card; above the
 * working line the finished lace -- a torchon ground of twisted pairs with
 * round spiders and scalloped fans down both edges -- and below it the
 * pricking holes still waiting, brass pins in the last worked rows.  From
 * the line the threads run down to a fan of turned wooden bobbins, each
 * with its ring of coloured spangle beads, swaying gently.  The lace grows
 * down the card over the scene arc.  Camera fixed over the pillow.
 *
 * Audio Reactivity:
 *   sceneProgress -> the lace grows (the arc)
 *   sceneAdvance  -> threads cross and twist, bobbins sway (continuous)
 *   audioChroma[12] -> the coloured threads (light)
 *   audioSwell    -> the lamp (slow)
 *   audioHigh     -> the linen sheen (light)
 *
 * Per-activation variety: pairsP, pinsP, hueP.
 */
uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float sceneAdvance;
uniform float sceneTime;
uniform float sceneProgress;
uniform float audioAdvance;
uniform float audioChroma[12];
uniform float audioSwell;
uniform float audioHigh;
uniform float audioKick;
uniform float audioLevel;
uniform float audioChromaHue;
uniform float audioValence;

uniform float pairsP;
uniform float pinsP;
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
float hash21(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
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
    vec2 p = (gl_FragCoord.xy / resolution - 0.5) * vec2(aspect, 1.0);
    float hue = (hueP > 0.001) ? hueP : 0.0;
    float prog = clamp(sceneProgress, 0.0, 1.0);
    float T = sceneTime + sceneAdvance * 0.5;
    float lampS = 0.8 + 0.4 * clamp(audioSwell, 0.0, 1.0);
    float hi = clamp(audioHigh * 2.0, 0.0, 1.0);
    int nB = 10 + int(clamp(pairsP, 0.0, 1.0) * 8.0);        // bobbins
    float mesh = 16.0 + 8.0 * clamp(pinsP, 0.0, 1.0);         // ground cells per unit

    // The pillow: a dome of deep blue-green cotton with a fine weave.
    float r = length(p * vec2(0.8, 1.0));
    vec3 cloth = vec3(0.07, 0.2, 0.22) * (1.15 - 0.6 * r * r);
    cloth *= 0.9 + 0.1 * sin(p.x * 900.0) * sin(p.y * 900.0);
    vec3 col = cloth;

    // The pricking card down the middle: buff parchment.
    float cardW = 0.36;
    float onCard = step(abs(p.x), cardW);
    vec3 card = vec3(0.86, 0.76, 0.58) * (0.9 + 0.1 * noise2(p * 40.0));
    col = mix(col, card * (1.1 - 0.4 * r), onCard);

    // The working line moves down the card over the arc; above it the lace.
    float lineY = 0.46 - prog * 0.72;
    vec2 m = vec2(p.x + p.y, p.x - p.y) * mesh * 0.7071;       // diagonal lattice
    vec2 mf = fract(m) - 0.5;
    float lace = 0.0;
    if (p.y > lineY && onCard > 0.0) {
        // Torchon ground: threads along both diagonals, twisted pairs.
        float d1 = abs(mf.x), d2 = abs(mf.y);
        float thr = smoothstep(0.09, 0.04, min(d1, d2)) * step(0.12, length(mf));
        // Spiders every few cells: round with radiating legs.
        vec2 sc = floor(m / 4.0);
        vec2 sq = (m - sc * 4.0 - 2.0);
        float sr = length(sq);
        float spider = smoothstep(0.75, 0.6, sr) * (0.6 + 0.4 * step(0.5, fract(atan(sq.y, sq.x) * 1.27)))
                     + smoothstep(0.12, 0.0, abs(sr - 1.1)) * 0.8;
        float isSpider = step(0.5, hash21(sc));
        lace = clamp(mix(thr, max(thr * step(1.4, sr), spider), isSpider), 0.0, 1.0);
        // Scalloped fan edges down both sides.
        float ex = cardW - abs(p.x);
        float fan = smoothstep(0.015, 0.0, abs(ex - 0.05 - 0.03 * abs(sin(p.y * mesh * 0.6)))) ;
        lace = max(lace, fan);
        vec3 thread = vec3(0.98, 0.97, 0.93) * (0.9 + 0.2 * hi * noise2(p * 300.0));
        col = mix(col, thread, lace);
        col *= 1.0 - 0.25 * smoothstep(0.3, 0.0, lace) * 0.5;        // tiny shadow of the thread
    }
    // Pricking holes waiting below the line, pins in the last worked rows.
    {
        vec2 node = m - floor(m + 0.5);
        float hole = smoothstep(0.08, 0.04, length(node));
        float below = step(p.y, lineY) * onCard;
        col = mix(col, vec3(0.3, 0.24, 0.18), hole * below * 0.8);
        float pinZone = smoothstep(lineY + 0.12, lineY + 0.01, p.y) * step(lineY, p.y) * onCard;
        float head = smoothstep(0.3, 0.18, length(node));
        vec3 brass = vec3(0.95, 0.75, 0.35) * (0.7 + 0.5 * smoothstep(0.1, -0.1, node.x + node.y));
        col = mix(col, brass, head * pinZone * step(0.35, hash21(floor(m + 0.5))));
    }

    // Threads from the working line down to the bobbins, and the bobbins.
    float fanY = -0.3;
    for (int i = 0; i < 18; ++i) {
        if (i >= nB) break;
        float fi = float(i);
        float u = (fi + 0.5) / float(nB) - 0.5;
        vec2 a = vec2(u * cardW * 1.6, lineY);
        vec2 b = vec2(u * aspect * 0.85 + 0.012 * sin(T * 0.6 + fi * 1.3), fanY);
        // Thread.
        vec2 pa = p - a, ba = b - a;
        float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
        float td = length(pa - ba * h);
        float e = clamp(audioChroma[int(mod(fi * 5.0, 12.0))] * 1.5, 0.0, 1.0);
        vec3 tc = mix(vec3(0.95, 0.94, 0.9), imgPalette(fi / 18.0 + hue * 0.159) * 1.3, 0.25 + 0.4 * e);
        col = mix(col, tc, smoothstep(0.0025, 0.0008, td));
        // Bobbin: a turned wooden spindle hanging from the thread.
        vec2 bq = p - b;
        vec2 bd = normalize(b - a);
        vec2 bs = vec2(-bd.y, bd.x);
        float along = dot(bq, bd), across = abs(dot(bq, bs));
        float prof = 0.009 + 0.006 * sin(clamp(along / 0.13, 0.0, 1.0) * 3.14159) - 0.004 * smoothstep(0.02, 0.0, abs(along - 0.02));
        float bob = step(0.0, along) * step(along, 0.13) * smoothstep(prof, prof - 0.002, across);
        vec3 wood = mix(vec3(0.45, 0.25, 0.12), vec3(0.75, 0.5, 0.28), smoothstep(prof, 0.0, across)) * (0.8 + 0.3 * hash11(fi));
        col = mix(col, wood, bob);
        // The spangle: a ring of round beads at the tail.
        vec2 tail = b + bd * 0.14;
        for (int k = 0; k < 5; ++k) {
            float ang = float(k) / 5.0 * 6.2831853;
            vec2 bc = tail + bd * 0.012 + (bd * sin(ang) * 0.6 + bs * cos(ang)) * 0.012;
            float bead = smoothstep(0.0055, 0.004, length(p - bc));
            vec3 beadC = 0.5 + 0.5 * cos(6.2831853 * (hash11(fi * 3.0 + float(k)) + vec3(0.0, 0.33, 0.67)));
            col = mix(col, beadC * (0.8 + 0.4 * e), bead);
        }
    }

    // Lamp light: warm, from above.
    col *= lampS * (1.1 - 0.35 * length(p - vec2(0.0, 0.2)));
    col *= mix(vec3(1.0), vec3(1.05, 0.98, 0.9), 0.6);
    col *= 0.85 + 0.3 * audioLevel;

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
