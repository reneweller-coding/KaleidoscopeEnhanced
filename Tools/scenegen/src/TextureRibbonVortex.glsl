//@doc
 * @brief TEXTURE RIBBON VORTEX: broad ribbons of the photograph spiral down
 * into a vortex -- two sets of curling bands, one winding clockwise, the
 * other counter-clockwise, weave over and under each other as they are
 * drawn toward the bright eye in the centre; each ribbon is curved like
 * silk, dark at its folded edges and catching a sheen along its crown,
 * the photo streaming along it.  Endless, mirrorable.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the ribbons stream inward (integrated, jump-free)
 *   audioPhase      -> the vortex turns (integrated)
 *   audioSpread     -> ribbon width
 *   audioKick       -> the crown sheen flares (light)
 *   audioMode       -> the eye's colour: cool in minor, warm in major
 *   audioSwell      -> the eye's glow (slow)
 *
 * Knobs: pitchP (spiral tightness), weaveP (how much the second set shows), zoomP (photo scale), hueP.
//@params pitchP weaveP zoomP
//@audio audioPhase audioSpread audioKick audioMode audioSwell
//@body
// One family of log-spiral ribbons: returns colour (rgb) and coverage (a).
vec4 ribbons(float lr, float a, float n, float k, float flow, float turn, float width, float seed, float fwA, out float bidOut)
{
    // Band coordinate across the ribbons, and the length coordinate along them.
    float b = (a + turn) * n / 6.2831853 + lr * k;
    float along = lr - flow;
    float fb = fract(b);
    float bid = floor(b);                                      // ribbon index (space)
    float c = abs(fb - 0.5) * 2.0;                             // 0 at the ribbon's crown
    float px = fwA * n / 6.2831853 + fwidth(lr) * abs(k) + 1e-4;   // no spike at the atan cut
    bidOut = bid;
    float cover = smoothstep(width + px, width - px, c);
    // Photo along the ribbon; n bands per turn -> bid wraps with period n.
    float bw = mod(bid, n);
    vec2 uv = vec2(along * 0.6, (fb - 0.5) * 0.5 + bw * 0.37 + seed);
    float fw = max(fwidth(lr) * 0.6, px * 0.5) * 1024.0;
    vec3 ph = imgLod(uv, clamp(log2(max(fw, 1.0)), 0.0, 9.0));
    // Silk shading: dark folded edges, sheen at the crown.
    float shade = 0.35 + 0.65 * sqrt(max(0.0, 1.0 - (c / max(width, 1e-3)) * (c / max(width, 1e-3))));
    return vec4(ph * shade, cover);
}

void main()
{
    vec2 p = screenP();
    float kick = clamp(audioKick, 0.0, 1.0);
    float swell = clamp(audioSwell, 0.0, 1.0);
    float r = max(length(p), 1e-4);
    float a = atan(p.y, p.x);
    float lr = log(r);
    float fwA = length(fwidth(vec2(cos(a), sin(a))));
    float k = 1.5 + 3.0 * clamp(pitchP, 0.0, 1.0);
    float flow = 0.12 * sceneTime + 0.8 * audioAdvance;
    float turn = 0.05 * sceneTime + 0.3 * audioPhase;
    float width = 0.5 + 0.35 * clamp(audioSpread, 0.0, 1.0);
    float z = 0.7 + 0.8 * clamp(zoomP, 0.0, 1.0);
    float idA, idB;
    vec4 A = ribbons(lr * z, a, 6.0, k, flow, turn, width, 0.0, fwA, idA);
    vec4 B = ribbons(lr * z, -a, 4.0, k * 0.8, flow * 0.8, turn * 0.7, width * 0.8, 0.5, fwA, idB);
    // Weave: which family is on top alternates along the crossings.
    float over = mod(idA + idB, 2.0);                          // true weave: alternates at every crossing
    float wv = clamp(weaveP, 0.0, 1.0);
    vec3 col = vec3(0.02);
    vec3 top = mix(A.rgb, B.rgb, over);
    float topA = mix(A.a, B.a * wv, over);
    vec3 bot = mix(B.rgb, A.rgb, over);
    float botA = mix(B.a * wv, A.a, over);
    col = mix(col, bot * 0.7, botA);
    col = mix(col, top, topA);
    // Shadow of the top ribbon's edge on the lower one.
    col *= 1.0 - 0.3 * botA * (1.0 - topA);
    vec3 gc = glowColour(imgLod(vec2(0.5 + 0.1 * sin(0.02 * sceneTime), 0.5), 6.0), vec2(flow * 0.05, 0.0), hueP * 0.159);
    float mode = clamp(audioMode, 0.0, 1.0);
    gc = mix(gc, gc * mix(vec3(0.8, 0.9, 1.2), vec3(1.2, 0.9, 0.7), mode), 0.5);
    col += gc * topA * pow(max(0.0, 1.0 - abs(fract((a + turn) * 6.0 / 6.2831853 + lr * z * k) - 0.5) * 4.0), 6.0) * (0.1 + 0.6 * kick);
    // The eye.
    col = mix(col, gc * (0.8 + 1.0 * swell), exp(-r * 9.0));
    finish(col);
}
