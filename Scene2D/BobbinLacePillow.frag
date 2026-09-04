#version 330 core
out vec4 fragColor;
/**
 * @file BobbinLacePillow.frag
 * @brief BOBBIN LACE PILLOW: the lace maker's pillow seen from above.
 * Pins with round heads hold the pattern, and pairs of threads cross and
 * twist between them on the scene clock -- the two moves that make all
 * bobbin lace.  The finished lace grows down the pillow over the scene
 * arc; below the working line the bobbins hang in a fan, each a small
 * turned shape on its own thread.  The photo is the pricking card under
 * the work.  Camera fixed over the pillow.
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
    float pairs = 5.0 + floor(clamp(pairsP, 0.0, 1.0) * 5.0);           // once per activation
    float pinRows = 5.0 + floor(clamp(pinsP, 0.0, 1.0) * 4.0);
    float lamp = 0.7 + 0.5 * clamp(audioSwell, 0.0, 1.0);
    float hi = clamp(audioHigh * 2.0, 0.0, 1.0);
    float prog = clamp(sceneProgress, 0.0, 1.0);
    float clock = sceneAdvance * 0.5 + sceneTime * 0.1;

    // The pillow: dark blue linen, and the pricking card with the photo on it.
    vec3 pillow = mix(vec3(0.1, 0.12, 0.2), imgPalette(hue * 0.159 + 0.6) * 0.2, 0.4);
    pillow *= 0.8 + 0.3 * noise2(p * 90.0);
    vec3 card = img(clamp(p * 0.9 + 0.5, 0.0, 1.0)) * vec3(0.75, 0.7, 0.6);
    card *= 0.7 + 0.4 * noise2(p * 40.0);
    float onCard = smoothstep(0.44, 0.42, max(abs(p.x) / aspect * 2.0, abs(p.y) * 2.2));
    vec3 col = mix(pillow, card * 0.55, onCard * 0.7) * lamp;

    // The working line: the lace is finished above it and grows downward.
    float workY = 0.42 - prog * 0.8;
    // Pins: a lattice of round-headed pins holding the pattern.
    float pitchX = aspect * 0.7 / pairs;
    float pitchY = 0.75 / pinRows;
    vec2 pg = vec2((p.x + aspect * 0.35) / pitchX, (0.42 - p.y) / pitchY);
    vec2 pi = floor(pg);
    vec2 pf = fract(pg) - 0.5;
    // Half-drop rows, which is how a lace pricking is set out.
    float drop = mod(pi.y, 2.0) * 0.5;
    pf.x = fract(pg.x + drop) - 0.5;
    float pinD = length(pf * vec2(pitchX, pitchY));
    float pinSet = smoothstep(workY - 0.02, workY + 0.06, p.y);          // pins exist above the line

    // The threads.  Every pair crosses and twists between pins; the whole
    // net is drawn as segments between neighbouring pin positions.
    float lace = 0.0;
    float laceCol = 0.0;
    for (int i = 0; i < 10; ++i)
    {
        float fi = float(i);
        if (fi >= pairs) break;
        // The pair's own zig-zag down the pillow.
        float phase = fi * 1.7;
        float x0 = (fi + 0.5) * pitchX - aspect * 0.35;
        for (int k = 0; k < 8; ++k)
        {
            float fk = float(k);
            if (fk >= pinRows) break;
            float y0 = 0.42 - fk * pitchY;
            float y1 = y0 - pitchY;
            if (y1 < workY - 0.02) break;
            // A cross: the two threads of the pair swap sides.
            float swing = 0.5 * pitchX * sin(clock * 0.8 + phase + fk);
            vec2 a = vec2(x0 - swing, y0);
            vec2 b = vec2(x0 + swing, y1);
            vec2 c = vec2(x0 + swing, y0);
            vec2 d2 = vec2(x0 - swing, y1);
            float w = 0.0035;
            lace = max(lace, smoothstep(w * 1.8, w * 0.6, segD(p, a, b)));
            lace = max(lace, smoothstep(w * 1.8, w * 0.6, segD(p, c, d2)));
            // A twist: the pair runs straight down, wound around itself.
            float twist = smoothstep(w * 1.6, w * 0.5,
                abs(p.x - x0 - 0.35 * pitchX * sin((0.42 - p.y) * 90.0 + phase)))
                * step(y1, p.y) * step(p.y, y0);
            lace = max(lace, twist);
            if (lace > 0.5) laceCol = fi;
        }
    }
    // Only the part above the working line is finished lace.
    float finished = smoothstep(workY - 0.01, workY + 0.03, p.y);
    int cls = int(mod(laceCol * 3.0 + 1.0, 12.0));
    float e = clamp(audioChroma[cls] * 1.6, 0.0, 1.0);
    vec3 thread = mix(vec3(0.95, 0.93, 0.86), imgPalette(hue * 0.159 + float(cls) / 12.0) * 1.3, 0.3 + 0.35 * e);
    col = mix(col, thread * lamp * (0.8 + 0.4 * e), lace * finished * 0.95);
    col += thread * lace * finished * hi * 0.25;
    // The pins: round heads with a bright highlight, and their shadows.
    float pinHead = smoothstep(0.011, 0.006, pinD) * pinSet;
    float pinShadow = smoothstep(0.02, 0.008, length((pf * vec2(pitchX, pitchY)) - vec2(0.006, -0.006))) * pinSet;
    col *= 1.0 - 0.35 * pinShadow * (1.0 - pinHead);
    vec3 brass = mix(vec3(0.85, 0.78, 0.5), imgPalette(hue * 0.159 + 0.12), 0.25);
    col = mix(col, brass * lamp, pinHead);
    col += vec3(1.0) * smoothstep(0.005, 0.001, length(pf * vec2(pitchX, pitchY) - vec2(-0.003, 0.003))) * pinSet * (0.3 + 0.7 * hi);

    // Below the working line: the bobbins hang in a fan on their threads.
    if (p.y < workY)
    {
        for (int i = 0; i < 10; ++i)
        {
            float fi = float(i);
            if (fi >= pairs * 2.0) break;
            float x0 = (floor(fi * 0.5) + 0.5) * pitchX - aspect * 0.35 + (mod(fi, 2.0) - 0.5) * pitchX * 0.35;
            // The bobbin hangs and sways gently on the clock.
            float sway = 0.02 * sin(clock * 0.7 + fi * 1.3);
            float len = 0.16 + 0.06 * hash11(fi * 3.3);
            vec2 top = vec2(x0, workY);
            vec2 bot = vec2(x0 + sway * 2.0, workY - len);
            // The thread.
            col = mix(col, vec3(0.9, 0.88, 0.82) * lamp, smoothstep(0.003, 0.001, segD(p, top, bot)) * 0.9);
            // The bobbin: a turned shank with a bulb and a bead ring.
            vec2 bq = p - bot;
            float shank = smoothstep(0.012, 0.008, abs(bq.x)) * step(-0.075, bq.y) * step(bq.y, 0.0);
            float bulb = smoothstep(0.019, 0.015, length((bq - vec2(0.0, -0.055)) * vec2(1.0, 0.75)));
            vec3 wood = mix(vec3(0.55, 0.38, 0.22), imgPalette(hue * 0.159 + 0.1), 0.25);
            wood *= 0.6 + 0.5 * smoothstep(-0.012, 0.012, bq.x);
            col = mix(col, wood * lamp, max(shank, bulb));
            // The spangle: a ring of small round beads at the bottom.
            for (int k = 0; k < 6; ++k)
            {
                float a2 = float(k) * 1.0472 + fi;
                vec2 bead = bot + vec2(0.0, -0.085) + vec2(cos(a2), sin(a2) * 0.6) * 0.016;
                float bd = length(p - bead);
                vec3 bc = imgPalette(hue * 0.159 + float(k) / 6.0) * 1.4 + 0.2;
                col = mix(col, bc * lamp, smoothstep(0.005, 0.003, bd));
                col += bc * smoothstep(0.003, 0.0, bd) * hi * 0.4;
            }
        }
    }
    col *= 0.9 + 0.2 * audioLevel;

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
