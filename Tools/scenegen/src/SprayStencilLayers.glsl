//@doc
 * @brief SPRAY STENCIL LAYERS: colour sprayed through wandering stencils builds up layers of soft clouds: dots, stripes,
 * stars and blobs of grainy paint with feathered overspray at their edges, laid over one another; over each phrase the
 * layers come and go in turn, so new layers keep forming over the old.  A layer is a stencil shape (a lattice of
 * holes, a set of bars, a star, a field of blobs) drifting slowly, its edge softened by noise as overspray, its paint
 * a fine speckle; its strength rises and falls once per phrase, each layer at its own offset.  The paint is shades of
 * one colour family from the photo.
 *
 * Audio Reactivity (structure, not only light):
 *   audioPhrasePos -> the layers come and go in turn over each phrase
 *   audioAdvance   -> the stencils drift (integrated)
 *   audioSwell     -> the paint's density
 *
 * Knobs: layerP (how many layers), grainP (how coarse the speckle is), hueP.
//@params layerP grainP
//@audio audioPhrasePos audioSwell
//@body
/**  A stencil's opening at a place.
 *
 * @param q     The place in the stencil's frame. (in)
 * @param kind  0 holes, 1 bars, 2 star, 3 blobs. (in)
 *
 * @return
 *   The signed distance into the opening (positive inside).
 **/
float stencil(vec2 q, float kind)
{
    if (kind < 0.5) { vec2 f = fract(q * 3.0) - 0.5; return (0.3 - length(f)) / 3.0; }
    if (kind < 1.5) return (0.22 - abs(fract(q.x * 2.5) - 0.5)) / 2.5;
    if (kind < 2.5) {
        float r = length(q), a = atan(q.y, q.x);
        return (0.35 + 0.18 * cos(5.0 * a)) - r;
    }
    return (fbm(q * 2.0) - 0.52) * 0.3;
}

void main()
{
    vec2 p = screenP();
    float fh = famHue();
    float N = floor(3.0 + 2.0 * clamp(layerP, 0.0, 1.0));
    float grain = 140.0 + 160.0 * clamp(grainP, 0.0, 1.0);
    float run = 0.02 * sceneTime + 0.08 * audioAdvance;
    float dens = 0.6 + 0.5 * clamp(audioSwell, 0.0, 1.0);
    vec3 col = famCol(fh, 0.45) * 0.03;
    for (int k = 0; k < 5; ++k) {
        float fk = float(k);
        if (fk >= N) break;
        vec2 q = rot2(0.6 * fk + 0.1 * sin(run + fk)) * (p - 0.3 * vec2(sin(run * (0.7 + 0.2 * fk) + fk), cos(run * 0.5 + 2.0 * fk)));
        float sd = stencil(q, mod(fk, 4.0));
        float over = 0.02 + 0.02 * fbm(9.0 * p + fk);                   // the feathered overspray
        float mask = smoothstep(-over, over, sd + 0.01 * (noise2(p * 40.0 + fk) - 0.5));
        float speck = smoothstep(0.35, 0.65, noise2(p * grain + 17.0 * fk));
        float v = 0.5 - 0.5 * cos(6.2831853 * (audioPhrasePos + fk / N));
        vec3 paint = famCol(fh, 0.2 + 0.6 * fk / max(N - 1.0, 1.0)) * (0.55 + 0.45 * speck);
        col = mix(col, paint, mask * v * 0.75 * dens * (0.7 + 0.3 * speck));
    }
    finish(col);
}
