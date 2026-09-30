//@doc
 * @brief CELLOPHANE POLARIZED: crumpled cellophane between crossed polarising
 * filters -- the layers of stretched film light up in vivid interference
 * colours that depend on how many layers overlap and how they were
 * stretched: overlapping angular shards of colour (magenta, yellow, cyan,
 * green) with sharp creases, over a black background where no film is;
 * as the filter slowly turns, every colour shifts to its complement and
 * back.  The shards' shapes are cut from the photograph.  Endless, mirrorable.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the analyser turns (integrated, jump-free)
 *   audioSpread     -> the number of layers
 *   audioKick       -> the colours flash brighter (light)
 *   audioMode       -> crossed polars (dark ground); parallel polars (light ground) only at very major moments
 *   audioRoughness  -> the crumpling
 *   audioSwell      -> the stretch (retardation) (slow)
 *
 * Knobs: shardP (shard size), layerP (layers), photoP (photo shapes the shards), hueP.
//@params shardP layerP photoP
//@audio audioSpread audioKick audioMode audioRoughness audioSwell
//@body
void main()
{
    vec2 p = screenP();
    float kick = clamp(audioKick, 0.0, 1.0);
    float swell = clamp(audioSwell, 0.0, 1.0);
    float mode = smoothstep(0.8, 0.98, clamp(audioMode, 0.0, 1.0));   // parallel polars only at very major moments
    float rough = clamp(audioRoughness, 0.0, 1.0);
    vec2 uv = p * 0.5 + 0.5;
    float T = 0.05 * sceneTime + 0.35 * audioAdvance;
    float nL = 2.0 + 3.0 * clamp(layerP, 0.0, 1.0) + 2.0 * clamp(audioSpread, 0.0, 1.0);
    float S = 2.0 + 3.0 * (1.0 - clamp(shardP, 0.0, 1.0));
    // Retardation: sum over layers; each layer a Voronoi of flat shards with
    // its own thickness and fast axis.
    float ret = 0.0;
    float axisC = 0.0, axisS = 0.0;
    float creases = 0.0;
    for (int k = 0; k < 7; ++k) {
        float fk = float(k);
        float on = smoothstep(fk - 0.5, fk + 0.5, nL - 0.5);
        if (on <= 0.0) break;
        vec2 q = rot2(fk * 1.3) * p * S + fk * 5.1 + 0.3 * rough * vec2(fbm3(p * 4.0 + fk), fbm3(p * 4.0 - fk));
        vec2 qi = floor(q), qf = fract(q);
        float f1 = 9.0, f2 = 9.0; vec2 id = qi;
        for (int y = -1; y <= 1; ++y) for (int x = -1; x <= 1; ++x) {
            vec2 o = vec2(x, y);
            vec2 c = o + 0.1 + 0.8 * hash22(qi + o + fk * 7.0);
            float d = length(qf - c);
            if (d < f1) { f2 = f1; f1 = d; id = qi + o; } else if (d < f2) f2 = d;
        }
        // Film present where the photo is bright enough (its shapes cut the shards).
        float cover = step(hash21(id + fk * 3.0), mix(0.6, 0.3 + luma(imgLod((id + 0.5 - fk * 5.1) / S * 0.5 + 0.5, 4.0)), clamp(photoP, 0.0, 1.0)));   // per shard, no blotches
        float th = (0.4 + 0.6 * hash21(id + fk)) * (0.8 + 0.5 * swell) * cover * on;
        float ax = hash21(id + fk * 11.0) * 3.14159;
        ret += th;
        axisC += cos(2.0 * ax) * th; axisS += sin(2.0 * ax) * th;
        creases = max(creases, exp(-(f2 - f1) / 0.01) * cover * on);
    }
    // Interference colour for crossed polars: I = sin^2(2 theta) * sin^2(pi * ret / lambda).
    float theta = atan(axisS, axisC) * 0.5 - T;
    float s2 = pow(sin(2.0 * theta), 2.0);
    vec3 lam = vec3(0.65, 0.53, 0.45);
    vec3 crossed = s2 * pow(sin(3.14159 * ret * 1.2 / lam + hueP * 0.159 * 3.0), vec3(2.0));
    vec3 parallel = 1.0 - crossed;
    vec3 col = mix(crossed, parallel * 0.9, mode) * (1.0 + 0.5 * kick);
    col *= 1.0 - 0.4 * creases;
    finish(col);
}
