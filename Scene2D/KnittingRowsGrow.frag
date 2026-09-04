#version 330 core
out vec4 fragColor;
/**
 * @file KnittingRowsGrow.frag
 * @brief KNITTING ROWS GROW: stocking stitch growing row by row over the
 * scene arc.  Each stitch is a V of yarn sitting in the row below, and
 * the fabric is built as a lattice of those Vs; colourwork bands take
 * their yarn from the chroma classes, the photo is the yarn's own dyed
 * shade.  The live row sits on the needle at the top of the growing
 * fabric and is a little looser than the rest.  Camera fixed on the work.
 *
 * Audio Reactivity:
 *   sceneProgress   -> the fabric grows row by row (the arc)
 *   audioChroma[12] -> the colourwork bands (light)
 *   audioSwell      -> lamp light on the wool (slow)
 *   audioKick       -> the needles click: a glint on the live row (light)
 *   audioHigh       -> the fibre halo (light)
 *
 * Per-activation variety: gaugeP, bandP, hueP.
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
uniform float audioKick;
uniform float audioHigh;
uniform float audioLevel;
uniform float audioChromaHue;
uniform float audioValence;

uniform float gaugeP;
uniform float bandP;
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

// One arm of a stitch V: distance to a leg running from the bottom centre
// out and up to the shoulder.
float legD(vec2 q, float side, float w)
{
    vec2 a = vec2(0.0, -0.42);
    vec2 b = vec2(side * 0.5, 0.42);
    vec2 d = b - a;
    float t = clamp(dot(q - a, d) / dot(d, d), 0.0, 1.0);
    // The leg bows outward, which is what makes a knit stitch read as a V
    // and not as a chevron.
    vec2 on = a + d * t + vec2(side * 0.14 * sin(t * 3.14159), 0.0);
    return length(q - on) - w;
}

void main()
{
    float aspect = resolution.x / resolution.y;
    vec2 uv = gl_FragCoord.xy / resolution;
    vec2 p = (uv - 0.5) * vec2(aspect, 1.0);

    float hue = (hueP > 0.001) ? hueP : 0.0;
    float gauge = 13.0 + 11.0 * clamp(gaugeP, 0.0, 1.0);                // stitches across
    float bandW = 2.0 + floor(clamp(bandP, 0.0, 1.0) * 5.0);            // rows per colour band
    float lamp = 0.65 + 0.55 * clamp(audioSwell, 0.0, 1.0);
    float hi = clamp(audioHigh * 2.0, 0.0, 1.0);
    float prog = clamp(sceneProgress, 0.0, 1.0);
    float clock = sceneAdvance * 0.4 + sceneTime * 0.08;

    // The lap under the work: dark, the photo very faint.
    vec3 col = img(uv * 0.7 + 0.15) * mix(vec3(0.14, 0.13, 0.14), imgPalette(hue * 0.159 + 0.6) * 0.2, 0.5) * lamp;

    // The fabric grid.  Rows are laid from the bottom; the growing edge
    // moves up over the arc.
    float rows = gauge * 0.72;
    vec2 g = vec2((p.x + aspect * 0.5) * gauge / aspect, (p.y + 0.5) * rows);
    // Stocking stitch offsets every other row by half a stitch.
    float rowI = floor(g.y);
    float half_ = mod(rowI, 2.0) * 0.5;
    vec2 cellF = vec2(fract(g.x + half_) - 0.5, fract(g.y) - 0.5);
    // The growing edge: how many rows exist so far.
    float edge = prog * (rows + 2.0) - 1.0;
    float exists = smoothstep(edge + 0.7, edge - 0.7, rowI);
    if (exists > 0.002 && abs(p.x) < aspect * 0.44)
    {
        // Yarn colour: a colourwork band per group of rows, its class
        // deciding the shade; the photo carries the dye variation.
        float bandI = floor(rowI / bandW);
        int cls = int(mod(bandI * 3.0 + 1.0, 12.0));
        float e = clamp(audioChroma[cls] * 1.6, 0.0, 1.0);
        vec3 yarn = mix(imgPalette(hue * 0.159 + float(cls) / 12.0) * 1.25 + 0.12, vec3(0.8, 0.75, 0.68), 0.3);
        yarn *= 0.75 + 0.5 * e;
        yarn *= 0.85 + 0.3 * img(clamp(vec2(fract(g.x * 0.11), fract(g.y * 0.08)), 0.0, 1.0)).r;
        // The stitch: two bowed legs meeting at the bottom.
        float w = 0.13;
        // The live row is looser: a slightly fatter stitch.
        float live = smoothstep(edge - 1.2, edge, rowI);
        w *= 1.0 + 0.35 * live;
        float d = min(legD(cellF, -1.0, w), legD(cellF, 1.0, w));
        float stitch = smoothstep(0.02, -0.01, d);
        // Rounded shading across the yarn: bright along the top of the loop.
        float round_ = smoothstep(0.0, -w, d);
        vec3 loop = yarn * (0.5 + 0.75 * round_);
        loop += vec3(1.0, 0.97, 0.9) * smoothstep(-w * 0.7, -w, d) * 0.35 * lamp;
        // The shadow the stitch casts into the row below.
        float shade = smoothstep(0.06, 0.0, d + 0.05) * (1.0 - stitch);
        // The fibre halo: fine fuzz on the treble.
        float fuzz = smoothstep(0.09, 0.0, d) * (0.25 + 0.5 * hi) * 0.25;
        col = mix(col, col * 0.55, shade * exists);
        col = mix(col, loop * lamp, stitch * exists);
        col += yarn * fuzz * exists * (0.5 + 0.5 * noise2(p * 220.0));
        // The needle glint on the live row, on the kick.
        col += vec3(1.0, 0.98, 0.92) * stitch * live * exists * audioKick * 0.5;
    }
    // The needles: two steel rods lying across the live row.
    float needleY = -0.5 + (edge + 0.9) / rows;
    for (int k = 0; k < 2; ++k)
    {
        float ny = needleY + float(k) * 0.022;
        float nd = abs(p.y - ny);
        float on = smoothstep(0.009, 0.005, nd) * step(abs(p.x), aspect * 0.47);
        vec3 steel = vec3(0.72, 0.74, 0.78) * (0.6 + 0.5 * lamp);
        steel += vec3(1.0) * smoothstep(0.004, 0.0, abs(p.y - ny + 0.002)) * (0.3 + 0.6 * hi);
        col = mix(col, steel, on * smoothstep(1.0, 0.85, prog));
        // The point at each end.
        col = mix(col, steel * 1.1, smoothstep(0.02, 0.0, length(p - vec2(aspect * 0.47, ny))) * smoothstep(1.0, 0.85, prog));
    }
    // The ball of yarn at the bottom corner, with the working strand.
    vec2 ballC = vec2(aspect * 0.36, -0.4);
    float br = length(p - ballC);
    float ball = smoothstep(0.1, 0.095, br);
    int cls2 = int(mod(floor(edge / bandW) * 3.0 + 1.0, 12.0));
    vec3 ballCol = mix(imgPalette(hue * 0.159 + float(cls2) / 12.0) * 1.25 + 0.12, vec3(0.8, 0.75, 0.68), 0.3);
    ballCol *= 0.55 + 0.6 * sqrt(max(1.0 - br / 0.1, 0.0));
    // Wound strands across the ball.
    ballCol *= 0.85 + 0.3 * sin((p.x - ballC.x) * 90.0 + (p.y - ballC.y) * 40.0);
    col = mix(col, ballCol * lamp, ball);
    // The working strand from the ball up to the needle.
    vec2 a = ballC + vec2(-0.05, 0.08), b = vec2(aspect * 0.2, needleY);
    vec2 dd = b - a;
    float t = clamp(dot(p - a, dd) / dot(dd, dd), 0.0, 1.0);
    vec2 on2 = a + dd * t + vec2(0.0, -0.06 * sin(t * 3.14159));
    col = mix(col, ballCol * 1.1 * lamp, smoothstep(0.006, 0.003, length(p - on2)));
    col *= 0.9 + 0.2 * audioLevel;

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
