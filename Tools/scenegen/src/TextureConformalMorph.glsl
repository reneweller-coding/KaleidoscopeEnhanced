//@doc
 * @brief TEXTURE CONFORMAL MORPH: the photograph streams in a double spiral
 * between two wandering poles -- out of one point it unrolls, spirals
 * around, and winds down into the other, endlessly repeated and ever
 * smaller toward both poles, like an Escher double spiral; the map is
 * conformal (every tiny piece of the photo keeps its true shape), the
 * poles drift across the screen and the spiral's pitch slowly changes.
 * Continues beyond the frame; mirrorable.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the stream from pole to pole (integrated, jump-free)
 *   audioPhase      -> the stream turns around the poles (integrated)
 *   audioSpread     -> the poles move apart
 *   audioKick       -> the pole glow flares (light)
 *   audioMode       -> colour temperature: cool in minor, warm in major
 *   audioHigh       -> the seams between repeats glint (light)
 *
 * Knobs: twistP (spiral pitch: 1 or 2 turns per repeat, blended), repeatP (photo size), glowP (pole glow), hueP.
//@params twistP repeatP glowP
//@audio audioPhase audioSpread audioKick audioMode audioHigh
//@body
vec2 cdiv(vec2 a, vec2 b) { return vec2(a.x * b.x + a.y * b.y, a.y * b.x - a.x * b.y) / dot(b, b); }

// The photo along the spiral lattice for integer winding (A, B); returns colour.
vec3 spiralSample(vec2 L, vec2 dL, float A, float B, float zoom, float flow, float turn, float px, out float seam)
{
    // Similarity M maps the log's 2*pi jump (0, 2pi) onto (2A, 2B) -> seamless.
    float k = length(vec2(A, B)) / 3.14159265;
    float th = atan(-A, B);
    mat2 M = k * mat2(cos(th), sin(th), -sin(th), cos(th));
    vec2 uv = M * L;
    uv = uv * zoom + vec2(flow, turn);
    float s = k * zoom * length(dL);                            // photo units per pixel
    float lod = clamp(log2(max(s * px * 1024.0, 1.0)), 0.0, 9.0);
    vec2 fr = abs(fract(uv * 0.5 + 0.5) - 0.5) * 2.0;           // 1 at mirror folds
    seam = exp(-(1.0 - max(fr.x, fr.y)) / max(s * px * 2.0, 1e-4));
    return imgLod(uv, lod);
}

void main()
{
    vec2 p = screenP();
    float kick = clamp(audioKick, 0.0, 1.0);
    float hi = clamp(audioHigh * 1.5, 0.0, 1.0);
    float sep = 0.22 + 0.18 * clamp(audioSpread, 0.0, 1.0);
    vec2 mid = 0.15 * vec2(sin(0.011 * sceneTime), cos(0.009 * sceneTime));
    float ang = 0.02 * sceneTime + 0.1 * audioPhase;
    vec2 a = mid + sep * vec2(cos(ang), sin(ang));
    vec2 b = mid - sep * vec2(cos(ang), sin(ang));
    // w = log((z - a) / (z - b)) : the two poles.
    vec2 q = cdiv(p - a, p - b);
    vec2 L = vec2(0.5 * log(max(dot(q, q), 1e-12)), atan(q.y, q.x));
    // |dw/dz| = |1/(z-a) - 1/(z-b)| = |a-b| / (|z-a||z-b|)
    float dmag = length(a - b) / max(length(p - a) * length(p - b), 1e-5);
    vec2 dL = vec2(dmag, 0.0);
    float zoom = 1.0 + 1.5 * clamp(repeatP, 0.0, 1.0);
    float flow = 0.08 * sceneTime + 0.6 * audioAdvance;
    float turn = 0.02 * sceneTime + 0.2 * audioPhase;
    float px = 1.0 / resolution.y;
    float sA, sB;
    vec3 c1 = spiralSample(L, dL, 1.0, 1.0, zoom, flow, turn, px, sA);
    vec3 c2 = spiralSample(L, dL, 1.0, 2.0, zoom, flow, turn, px, sB);
    float tw = clamp(twistP, 0.0, 1.0);
    float wmix = smoothstep(0.2, 0.8, tw + 0.25 * sin(0.013 * sceneTime));
    vec3 col = mix(c1, c2, wmix);
    float seam = mix(sA, sB, wmix);
    float mode = clamp(audioMode, 0.0, 1.0);
    float lc = luma(col);
    col = max(mix(vec3(lc), col, 1.35), 0.0) * mix(vec3(0.9, 0.97, 1.1), vec3(1.1, 0.97, 0.85), mode);
    vec3 gc = glowColour(imgLod(vec2(0.5), 6.0), p, hueP * 0.159);
    col += gc * seam * (0.04 + 0.25 * hi);
    // Glow at the poles hides the infinitely small repeats.
    float g = clamp(glowP, 0.0, 1.0);
    float pa = exp(-length(p - a) * (14.0 - 6.0 * g)), pb = exp(-length(p - b) * (14.0 - 6.0 * g));
    col = mix(col, gc * (0.7 + 1.2 * kick), clamp((pa + pb) * (0.7 + 0.5 * g), 0.0, 1.0));
    finish(col);
}
