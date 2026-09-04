#version 330 core
out vec4 fragColor;
/**
 * @file QuiltBlockPatchwork.frag
 * @brief QUILT BLOCK PATCHWORK: a quilt assembling itself block by block
 * over the scene arc.  Each block is a traditional pieced pattern -- half
 * square triangles, a nine patch, a flying goose -- cut from the photo,
 * and the blocks arrive in row-major order, each fading in over its own
 * slice of the arc.  Running stitch lines cross every seam, the chroma
 * classes pick the fabrics, and the kick lights the block that has just
 * been set.  Camera fixed above the quilt.
 *
 * Audio Reactivity:
 *   sceneProgress   -> blocks arrive one after another (the arc)
 *   audioChroma[12] -> the fabric colours (light)
 *   audioKick       -> the newest block lights (light)
 *   audioSwell      -> the lamp over the frame (slow)
 *   audioHigh       -> the thread sheen (light)
 *
 * Per-activation variety: blocksP, sashP, hueP.
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
uniform float audioKick;
uniform float audioSwell;
uniform float audioHigh;
uniform float audioLevel;
uniform float audioChromaHue;
uniform float audioValence;

uniform float blocksP;
uniform float sashP;
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

// Which piece of the block pattern is this point in?  Returns a piece
// index; the fabric is chosen from it.
float piece(vec2 q, float kind)
{
    if (kind < 1.0)
    {
        // Half square triangles, four to a block.
        vec2 h = fract(q * 2.0);
        float quad = floor(q.x * 2.0) + 2.0 * floor(q.y * 2.0);
        return quad * 2.0 + step(h.y, h.x);
    }
    if (kind < 2.0)
    {
        // Nine patch.
        return floor(q.x * 3.0) + 3.0 * floor(q.y * 3.0);
    }
    if (kind < 3.0)
    {
        // Flying geese: a big triangle with two corners.
        vec2 c = q - 0.5;
        float goose = step(abs(c.x) * 2.0, 0.5 + c.y);
        return goose * 3.0 + step(0.0, c.x);
    }
    // Log cabin: rings around a centre.
    vec2 c = abs(q - 0.5);
    return floor(max(c.x, c.y) * 8.0);
}

void main()
{
    float aspect = resolution.x / resolution.y;
    vec2 uv = gl_FragCoord.xy / resolution;
    vec2 p = (uv - 0.5) * vec2(aspect, 1.0);

    float hue = (hueP > 0.001) ? hueP : 0.0;
    float cols = 4.0 + floor(clamp(blocksP, 0.0, 1.0) * 3.0);
    float sash = 0.02 + 0.03 * clamp(sashP, 0.0, 1.0);                  // sashing width
    float lamp = 0.7 + 0.5 * clamp(audioSwell, 0.0, 1.0);
    float hi = clamp(audioHigh * 2.0, 0.0, 1.0);
    float prog = clamp(sceneProgress, 0.0, 1.0);
    float clock = sceneAdvance * 0.4 + sceneTime * 0.08;

    // The table under the quilt.
    vec3 col = img(uv * 0.6 + 0.2) * mix(vec3(0.16, 0.14, 0.12), imgPalette(hue * 0.159 + 0.6) * 0.2, 0.5) * lamp;

    // The quilt grid.
    float pitch = aspect * 0.9 / cols;
    float rowsN = floor(0.9 / pitch);
    vec2 g = (p + vec2(aspect * 0.45, 0.45)) / pitch;
    vec2 bi = floor(g);
    vec2 bf = fract(g);
    if (bi.x >= 0.0 && bi.x < cols && bi.y >= 0.0 && bi.y < rowsN)
    {
        // Arrival order: row-major, each block over its own slice.
        float order = (bi.y * cols + bi.x) / (cols * rowsN);
        float slice = 1.0 / (cols * rowsN);
        float set = smoothstep(order, order + slice * 1.6, prog);
        float justSet = smoothstep(order + slice * 1.6, order + slice * 0.6, prog)
                      * smoothstep(order, order + slice * 0.4, prog);
        if (set > 0.002)
        {
            // The block: one of four traditional patterns.
            float kind = mod(floor(hash21(bi + 3.7) * 4.0), 4.0);
            float pc = piece(bf, kind);
            // The fabric: a chroma class per piece, with the photo as its print.
            int cls = int(mod(pc * 2.0 + bi.x + bi.y * 3.0, 12.0));
            float e = clamp(audioChroma[cls] * 1.6, 0.0, 1.0);
            vec3 fabric = imgPalette(hue * 0.159 + float(cls) / 12.0) * 1.2 + 0.15;
            vec3 print = img(clamp(bf * 0.4 + fract(vec2(pc * 0.13, pc * 0.29)), 0.0, 1.0));
            fabric = mix(fabric, fabric * print * 1.8, 0.45);
            fabric *= 0.7 + 0.55 * e;
            // Weave texture and the slight sheen of cotton.
            fabric *= 0.85 + 0.25 * noise2(p * 260.0);
            // Sashing between the blocks.
            float inSash = 1.0 - smoothstep(sash / pitch, sash / pitch + 0.02, min(min(bf.x, 1.0 - bf.x), min(bf.y, 1.0 - bf.y)));
            vec3 sashCol = mix(vec3(0.85, 0.83, 0.78), imgPalette(hue * 0.159 + 0.1), 0.2);
            vec3 block = mix(fabric, sashCol * (0.8 + 0.3 * lamp), inSash);
            // The quilting: a running stitch along every seam and a
            // diagonal grid over the whole block.
            float seam = smoothstep(0.012, 0.0, abs(fract(pc) - 0.0));   // piece boundaries show as tone changes
            float grid = smoothstep(0.03, 0.0, abs(fract((bf.x + bf.y) * 6.0) - 0.5) - 0.46)
                       + smoothstep(0.03, 0.0, abs(fract((bf.x - bf.y) * 6.0) - 0.5) - 0.46);
            float dash = step(0.35, fract((bf.x + bf.y) * 36.0));
            block = mix(block, block * 0.7, clamp(grid, 0.0, 1.0) * dash * 0.8);
            block += vec3(1.0, 0.98, 0.92) * clamp(grid, 0.0, 1.0) * dash * hi * 0.3;
            // The batting puffs a little between the quilting lines.
            block *= 0.92 + 0.16 * smoothstep(0.2, 0.6, abs(fract((bf.x + bf.y) * 6.0) - 0.5));
            // The newest block lights on the kick.
            block += imgPalette(hue * 0.159 + float(cls) / 12.0) * justSet * audioKick * 0.5;
            col = mix(col, block * lamp, set);
            // A soft shadow under the block edge, so it sits on the quilt.
            col *= 1.0 - 0.25 * inSash * set * 0.5;
        }
    }
    // The binding around the finished quilt.
    float edge = smoothstep(0.012, 0.0, abs(max(abs(p.x) - aspect * 0.45, abs(p.y) - 0.45)));
    col = mix(col, mix(vec3(0.45, 0.2, 0.18), imgPalette(hue * 0.159 + 0.05), 0.3) * lamp, edge * smoothstep(0.85, 1.0, prog));
    col *= 0.9 + 0.2 * audioLevel;

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
