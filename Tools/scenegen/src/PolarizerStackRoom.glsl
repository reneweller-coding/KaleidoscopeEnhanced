//@doc
 * @brief POLARIZER STACK ROOM: two crossed polarising filters and between them a turning sheet of birefringent foil,
 * crumpled and layered, whose thickness comes from the photo: light gets through only where the foil turns its
 * polarisation, and then in interference tints that rise and die away in waves as the foil turns.  Optics: between
 * crossed polarisers the transmitted share is sin^2(2 phi) sin^2(pi Gamma / lambda), phi the angle of the foil's
 * axis, Gamma its retardation; computed for three wavelengths it gives the familiar first-order tints.  Here the
 * tints are kept to their brightness and a slight shift of shade, in one colour family from the photo, so the
 * picture does not turn to rainbow.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance     -> the foil turns between the filters (integrated): brightness runs in waves
 *   audioHarmAdvance -> the foil's thickness glides with the chord changes: the tints climb or sink an order
 *   audioSwell       -> the foil's crumple deepens
 *
 * Knobs: orderP (the retardation's base, how many orders), crumpleP (how crumpled the foil is), hueP.  Distinct from
 * CellophanePolarized, which is a still collage.
//@params orderP crumpleP
//@audio audioHarmAdvance audioSwell
//@body
void main()
{
    vec2 p = screenP();
    float fh = famHue();
    float h = max(audioHarmAdvance, 0.0);
    float turn = 0.04 * sceneTime + 0.2 * audioAdvance;
    float thick = (0.6 + 1.4 * clamp(orderP, 0.0, 1.0)) * (1.0 + 0.25 * sin(0.7 * h) + 0.1 * sin(0.29 * h + 1.0));
    float crumple = 0.3 + 0.7 * clamp(crumpleP, 0.0, 1.0) * (0.6 + 0.6 * clamp(audioSwell, 0.0, 1.0));
    // the foil: layers whose count and axis come from the photo and a slow crumple field
    vec2 uv = p * 0.8 + 0.5;
    float photoL = luma(imgLod(uv, 2.5));
    float field = fbm(p * 2.2 + vec2(0.05 * sceneTime, 0.0)) * crumple;
    float layers = floor(1.0 + 3.0 * smoothstep(0.15, 0.85, photoL + 0.4 * field));
    float gamma = thick * (layers + 0.8 * field) * 550.0;        // retardation in nm
    float axis = turn + 1.5 * field + 0.3 * layers;
    float s2 = pow(sin(2.0 * axis), 2.0);
    vec3 lam = vec3(620.0, 540.0, 460.0);
    vec3 trans = s2 * pow(sin(3.14159265 * gamma / lam), vec3(2.0));
    // keep the tint's brightness and a small shift of shade, not its rainbow
    float bright = dot(trans, vec3(0.299, 0.587, 0.114));
    float shift = (trans.r - trans.b) * 0.5;
    vec3 col = famLight(fh, 0.5 + 0.35 * shift, 0.25 * bright) * bright * 1.5;
    // the foil's creases catch a little light even where it is dark
    col += famCol(fh, 0.4) * 0.05 * smoothstep(0.02, 0.0, abs(fract(field * 4.0) - 0.5) - 0.48);
    finish(col);
}
