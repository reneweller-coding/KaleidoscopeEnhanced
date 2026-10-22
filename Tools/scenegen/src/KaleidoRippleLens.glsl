//@doc
 * @brief KALEIDO RIPPLE LENS: a photo kaleidoscope lying under a sheet of water: rings of waves run over the water and
 * bend the rosette beneath -- every crest a little lens that pulls the pattern, every trough one that pushes it --
 * while a broad swell rocks the whole picture.  Optics: refraction at a surface of slope g shifts what is seen below
 * by about (1 - 1/n) depth g; the slope of the rings and the swell is computed exactly from their sines.  The
 * photo's own colours, calmed toward one colour family; the crests catch a glint of light.
 *
 * Audio Reactivity (structure, not only light):
 *   audioOnset   -> the rings' height (small: the water trembles)
 *   audioBass    -> the broad swell
 *   audioAdvance -> the waves run and the rosette turns (integrated)
 *
 * Knobs: sidesP (the rosette's symmetry), depthP (the water's depth: how strongly it bends), hueP.
//@params sidesP depthP
//@audio audioOnset audioBass
//@body
/**  The dihedral fold: a direction folded into one mirror sector of the given count.
 *
 * @param d      The point (centre at 0). (in)
 * @param sides  The number of mirrors. (in)
 *
 * @return
 *   The folded point.
 **/
vec2 kfold(vec2 d, float sides)
{
    float sec = 6.2831853 / sides;
    float a = abs(mod(atan(d.y, d.x), sec) - 0.5 * sec);
    return length(d) * vec2(cos(a), sin(a));
}

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
    float sides = floor(6.0 + 4.0 * clamp(sidesP, 0.0, 1.0));
    float depth = 0.05 + 0.1 * clamp(depthP, 0.0, 1.0);
    float run = 0.6 * sceneTime + 2.5 * audioAdvance;
    float ring = 0.015 + 0.05 * clamp(audioOnset, 0.0, 1.0);
    float swell = 0.02 + 0.05 * clamp(audioBass, 0.0, 1.0);
    // the water's slope: rings from three points and a broad swell
    vec2 g = swell * vec2(cos(2.1 * p.x + 0.4 * run), 0.7 * cos(1.7 * p.y - 0.3 * run + 1.0)) * 2.0;
    vec3 glint = vec3(0.0);
    for (int i = 0; i < 3; ++i) {
        float fi = float(i);
        vec2 c = 0.45 * vec2(sin(2.3 * fi + 0.05 * sceneTime), cos(1.7 * fi + 0.04 * sceneTime));
        vec2 d = p - c;
        float r = length(d) + 1e-4;
        float ph = 24.0 * r - 2.0 * run - 1.7 * fi;
        float env = exp(-1.8 * r);
        g += ring * env * 24.0 * cos(ph) * d / r * 0.12;
        glint += vec3(pow(max(sin(ph), 0.0), 12.0) * env * ring * 6.0);
    }
    vec2 seen = p + 3.0 * depth * g;                             // refraction: what is seen below is shifted
    vec2 k = kfold(rot2(0.03 * sceneTime + 0.12 * audioAdvance) * seen, sides);
    vec3 col = tone(imgLod(k * 0.42 + vec2(0.5, 0.45), 0.6), fh);
    col += famLight(fh, 0.6, 0.8) * glint.x * 0.5;
    finish(col);
}
