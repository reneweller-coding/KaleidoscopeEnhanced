//@doc
 * @brief LOBSTER EYE REFLECTOR: the mirror optics of a lobster's eye: a field of square tubes with mirror walls, and
 * the light of a few wandering sources gathered by it into the lobster eye's typical figure -- a bright focus with a
 * cross of light reaching out along the tubes' rows and columns -- the crosses sliding over the field and through one
 * another as the sources move.  Each tube is a small square with dark walls; it lights when it sends a source's light
 * to the eye: strongly at the focus, more faintly along the focus' row and column (one reflection instead of two).
 * The light's colour comes from the photo, calmed into one colour family.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance -> the light sources wander (integrated)
 *   audioSwell   -> how far the crosses' arms reach
 *
 * Knobs: poreP (the tubes' size), sourceP (how many sources), hueP.
//@params poreP sourceP
//@audio audioSwell
//@body
/**  The photo's colour calmed toward the colour family.
 *
 * @param photo  The photo's colour. (in)
 * @param fh     The family's hue. (in)
 *
 * @return
 *   The colour.
 **/
vec3 tone(vec3 photo, float fh)
{
    float l = luma(photo);
    return mix(photo * 1.1, famCol(fh, 0.15 + 0.7 * l) * (0.25 + 1.2 * l), 0.45);
}

void main()
{
    vec2 p = screenP();
    float fh = famHue();
    float S = 0.028 + 0.02 * clamp(poreP, 0.0, 1.0);
    float ns = floor(2.0 + 2.0 * clamp(sourceP, 0.0, 1.0));
    float run = 0.03 * sceneTime + 0.12 * audioAdvance;
    float reach = 0.25 + 0.6 * clamp(audioSwell, 0.0, 1.0);
    mat2 tilt = rot2(0.12 + 0.05 * sin(0.02 * sceneTime));
    vec2 g = tilt * p / S;
    vec2 cid = floor(g);
    vec2 f = g - cid - 0.5;
    vec2 cc = cid + 0.5;                                              // the tube's centre (in tubes)
    vec3 light = vec3(0.0);
    for (int i = 0; i < 4; ++i) {
        float fi = float(i);
        if (fi >= ns) break;
        vec2 src = vec2(0.7 * sin(run * (0.9 + 0.2 * fi) + 2.1 * fi), 0.35 * cos(run * (0.7 + 0.15 * fi) + 1.3 * fi));
        vec2 fs = tilt * src / S;                                    // the focus (in tubes)
        vec2 d = cc - fs;
        float core = exp(-dot(d, d) / 6.0);
        float armX = exp(-pow(d.y / 0.7, 2.0)) * exp(-abs(d.x) * S / reach);
        float armY = exp(-pow(d.x / 0.7, 2.0)) * exp(-abs(d.y) * S / reach);
        vec3 lc = tone(imgLod(src * 0.5 + 0.5, 3.0), fh) * 0.6 + famLight(fh, 0.5 + 0.15 * fi, 0.7) * 0.6;
        light += lc * (core * 2.0 + (armX + armY) * 0.5);
    }
    // the tube: a square opening with dark mirror walls and a brighter inner bevel
    float m = max(abs(f.x), abs(f.y));
    float open = smoothstep(0.44, 0.38, m);
    float bevel = exp(-pow((m - 0.36) / 0.04, 2.0));
    vec3 col = famCol(fh, 0.45) * 0.02 + famCol(fh, 0.5) * 0.04 * open;
    col += light * (open * (0.7 + 0.3 * (1.0 - m)) + bevel * 0.4);
    finish(famExpose(col, 4.04, 1.00, 0.03, fh));
}
