#version 330 core
out vec4 fragColor;
/**
 * @file EmbroideryHoopStitches.frag
 * @brief EMBROIDERY HOOP STITCHES: a hoop of linen with a design worked
 * in it.  Satin stitch fills the petals in bands of parallel floss, stem
 * stitch draws the lines, and French knots sit as round beads in the
 * centres.  The design is worked over the scene arc, stitch after stitch,
 * and the needle with its trailing thread sits at the working point.  The
 * chroma classes pick the flosses; the treble is the silk sheen, which is
 * what makes satin stitch read as satin.  Camera fixed on the hoop.
 *
 * Audio Reactivity:
 *   sceneProgress   -> the design is worked (the arc)
 *   audioChroma[12] -> the floss colours (light)
 *   audioHigh       -> the silk sheen across the satin bands (light)
 *   audioSwell      -> the lamp (slow)
 *   audioKick       -> the needle glints (light)
 *
 * Per-activation variety: petalsP, knotsP, hueP.
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

uniform float petalsP;
uniform float knotsP;
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

void main()
{
    float aspect = resolution.x / resolution.y;
    vec2 uv = gl_FragCoord.xy / resolution;
    vec2 p = (uv - 0.5) * vec2(aspect, 1.0);

    float hue = (hueP > 0.001) ? hueP : 0.0;
    float petals = 5.0 + floor(clamp(petalsP, 0.0, 1.0) * 4.0);         // once per activation
    float knots = 5.0 + floor(clamp(knotsP, 0.0, 1.0) * 7.0);
    float lamp = 0.7 + 0.5 * clamp(audioSwell, 0.0, 1.0);
    float hi = clamp(audioHigh * 2.0, 0.0, 1.0);
    float prog = clamp(sceneProgress, 0.0, 1.0);
    float clock = sceneAdvance * 0.45 + sceneTime * 0.09;

    // Outside the hoop.
    vec3 col = img(uv * 0.7 + 0.15) * mix(vec3(0.14, 0.13, 0.13), imgPalette(hue * 0.159 + 0.6) * 0.2, 0.5) * lamp;

    float hoopR = 0.4;
    float rr = length(p * vec2(1.0, 1.02));
    float inHoop = smoothstep(hoopR, hoopR - 0.004, rr);
    if (inHoop > 0.002)
    {
        // The linen: even weave, the photo as its natural slub.
        vec3 linen = mix(vec3(0.92, 0.88, 0.79), img(uv) * 1.2, 0.28);
        float warp = 0.5 + 0.5 * sin(uv.x * resolution.x * 0.9);
        float weft = 0.5 + 0.5 * sin(uv.y * resolution.y * 0.9);
        linen *= 0.82 + 0.22 * (warp * weft + (1.0 - warp) * (1.0 - weft));
        linen *= 0.93 + 0.12 * noise2(p * 130.0);
        vec3 cloth = linen * lamp;

        // How far the work has got: the design is stitched petal by petal,
        // then the stem line, then the knots.
        float petalPhase = clamp(prog / 0.55, 0.0, 1.0);
        float stemPhase = clamp((prog - 0.5) / 0.25, 0.0, 1.0);
        float knotPhase = clamp((prog - 0.7) / 0.3, 0.0, 1.0);

        // The petals: satin stitch, each a lens shape filled with parallel
        // floss laid across its short axis.
        float bestFill = 0.0; vec3 bestCol = vec3(0.0); float bestSheen = 0.0;
        vec2 flowerC = vec2(-0.03, 0.06);
        for (int i = 0; i < 9; ++i)
        {
            float fi = float(i);
            if (fi >= petals) break;
            float a = fi / petals * 6.2831853;
            vec2 dir = vec2(cos(a), sin(a));
            vec2 side = vec2(-dir.y, dir.x);
            vec2 q = p - flowerC;
            float along = dot(q, dir), across = dot(q, side);
            // A petal: long along dir, tapering at both ends.
            float len = 0.2, wid = 0.062;
            float t = clamp(along / len, 0.0, 1.0);
            float half_ = wid * sin(t * 3.14159);
            float inPetal = step(0.0, along) * step(along, len) * step(abs(across), half_);
            if (inPetal < 0.5) continue;
            // Worked in order: this petal starts when the arc reaches it.
            float slice = 1.0 / petals;
            float worked = smoothstep(fi * slice, (fi + 0.85) * slice, petalPhase);
            // Satin stitch: bands across the petal, laid from the base up.
            float band = 0.5 + 0.5 * cos(along * 210.0);
            float laid = smoothstep(worked * len + 0.01, worked * len - 0.01, along);
            int cls = int(mod(fi * 2.0 + 1.0, 12.0));
            float e = clamp(audioChroma[cls] * 1.6, 0.0, 1.0);
            vec3 floss = imgPalette(hue * 0.159 + float(cls) / 12.0) * 1.3 + 0.15;
            floss *= 0.75 + 0.5 * e;
            // The silk sheen: brightest where the floss lies across the light.
            float sheen = pow(max(0.0, 1.0 - abs(across / max(half_, 1e-3))), 1.5);
            vec3 satin = floss * (0.55 + 0.5 * band) * (0.6 + 0.7 * sheen);
            satin += vec3(1.0, 0.98, 0.94) * sheen * band * (0.15 + 0.6 * hi) * 0.7;
            // The stitches stand proud: a shadow at the petal's edge.
            satin *= 0.75 + 0.35 * smoothstep(half_, half_ * 0.4, abs(across));
            if (laid > bestFill) { bestFill = laid; bestCol = satin; bestSheen = sheen; }
        }
        cloth = mix(cloth, bestCol * lamp, bestFill * 0.97);

        // The stem: a curved line in stem stitch, drawn over its own phase.
        float stem = 0.0;
        vec2 prev = flowerC + vec2(0.0, -0.06);
        for (int k = 1; k <= 14; ++k)
        {
            float t0 = float(k - 1) / 14.0, t1 = float(k) / 14.0;
            if (t0 > stemPhase) break;
            vec2 a = flowerC + vec2(0.06 * sin(t0 * 3.0), -0.06 - t0 * 0.3);
            vec2 b = flowerC + vec2(0.06 * sin(t1 * 3.0), -0.06 - t1 * 0.3);
            vec2 d = b - a;
            float t = clamp(dot(p - a, d) / max(dot(d, d), 1e-6), 0.0, 1.0);
            float dist = length(p - (a + d * t));
            // Stem stitch is a rope of slanted stitches, so the line is
            // beaded rather than smooth.
            float rope = 0.5 + 0.5 * cos((t0 + t * (t1 - t0)) * 180.0);
            stem = max(stem, smoothstep(0.009, 0.004, dist) * (0.7 + 0.4 * rope));
        }
        vec3 green = mix(vec3(0.28, 0.45, 0.2), imgPalette(hue * 0.159 + 0.33), 0.3);
        cloth = mix(cloth, green * lamp * 1.1, stem * 0.95);
        cloth += green * stem * hi * 0.2;

        // French knots: round beads scattered in the flower's centre.
        for (int i = 0; i < 12; ++i)
        {
            float fi = float(i);
            if (fi >= knots) break;
            float slice = 1.0 / knots;
            float tied = smoothstep(fi * slice, (fi + 0.8) * slice, knotPhase);
            if (tied < 0.01) continue;
            float a = fi * 2.399963 + 1.0;
            vec2 c = flowerC + vec2(cos(a), sin(a)) * (0.012 + 0.03 * sqrt(fi));
            float d = length(p - c);
            int cls = int(mod(fi * 5.0 + 3.0, 12.0));
            float e = clamp(audioChroma[cls] * 1.6, 0.0, 1.0);
            vec3 kc = imgPalette(hue * 0.159 + float(cls) / 12.0) * 1.35 + 0.2;
            float bead = smoothstep(0.016, 0.011, d) * tied;
            // A knot is a wound bead: a spiral highlight on it.
            float spiral = 0.5 + 0.5 * cos(atan(p.y - c.y, p.x - c.x) * 3.0 + d * 260.0);
            cloth = mix(cloth, kc * (0.6 + 0.5 * spiral) * (0.7 + 0.5 * e) * lamp, bead);
            cloth += vec3(1.0) * smoothstep(0.007, 0.002, length(p - c - vec2(-0.004, 0.004))) * tied * (0.2 + 0.6 * hi);
        }
        col = mix(col, cloth, inHoop);

        // The needle at the working point, with its thread.
        vec2 work = flowerC + vec2(0.18 * cos(prog * 6.0), -0.06 - prog * 0.22);
        vec2 nd = normalize(vec2(0.6, 1.0));
        float alongN = clamp(dot(p - work, nd), 0.0, 0.16);
        float acrossN = length(p - work - nd * alongN);
        float needle = smoothstep(0.0035, 0.0015, acrossN) * step(0.004, alongN) * smoothstep(1.0, 0.9, prog);
        col = mix(col, vec3(0.8, 0.82, 0.86) * lamp, needle);
        col += vec3(1.0) * needle * smoothstep(0.1, 0.16, alongN) * (0.3 + 1.2 * audioKick);
        // The trailing thread.
        vec2 tail = work + nd * 0.16 + vec2(0.06, 0.05);
        vec2 dt = tail - (work + nd * 0.16);
        float tt = clamp(dot(p - (work + nd * 0.16), dt) / max(dot(dt, dt), 1e-6), 0.0, 1.0);
        float threadD = length(p - (work + nd * 0.16 + dt * tt) - vec2(0.0, 0.01 * sin(tt * 6.0 + clock)));
        col = mix(col, vec3(0.9, 0.5, 0.55) * lamp, smoothstep(0.0028, 0.001, threadD) * smoothstep(1.0, 0.9, prog));
    }
    // The hoop: two rings of pale wood with the tension screw at the top.
    float ring = smoothstep(0.03, 0.012, abs(rr - hoopR - 0.012));
    vec3 wood = mix(vec3(0.78, 0.64, 0.42), imgPalette(hue * 0.159 + 0.1), 0.2);
    wood *= 0.7 + 0.45 * noise2(p * 60.0);
    wood *= 0.6 + 0.6 * smoothstep(-0.2, 0.4, p.y);
    col = mix(col, wood * lamp, ring);
    col += vec3(1.0, 0.97, 0.9) * smoothstep(0.006, 0.0, abs(rr - hoopR - 0.002)) * 0.35 * lamp;
    // The screw bracket.
    vec2 sq = p - vec2(0.0, hoopR + 0.05);
    float screw = smoothstep(0.03, 0.024, max(abs(sq.x) * 1.6, abs(sq.y)));
    col = mix(col, vec3(0.6, 0.6, 0.63) * lamp, screw);
    col *= 0.9 + 0.2 * audioLevel;

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
