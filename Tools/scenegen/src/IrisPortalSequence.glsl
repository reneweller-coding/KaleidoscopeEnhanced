//@doc
 * @brief IRIS PORTAL SEQUENCE: a flight through a row of iris diaphragms, gate after gate: each iris stands closed in
 * the distance and opens as the view comes near -- its blades turning back as the aperture widens -- breathing a little
 * wider on every beat.  Each gate is a plane across the flight; its aperture is a polygon of as many sides as it has
 * blades, turned by how far it is closed, and a blade fills the sector behind each side with the photo, shaded across
 * its width, its edge glowing.  The gates are drawn from the nearest on: a place inside every aperture so far looks on
 * to the next gate.  The blades are the photo, calmed toward one colour family.  Distinct from TextureIrisShutter,
 * which is one diaphragm.
 *
 * Audio Reactivity (structure, not only light):
 *   audioBeatPhase -> every beat the irises breathe a little wider (a smooth cosine over the beat)
 *   audioAdvance   -> the flight through the gates (integrated)
 *   audioSwell     -> the blades' edges glow
 *
 * Knobs: bladeP (how many blades), gapP (the gates' spacing), hueP.
//@params bladeP gapP
//@audio audioBeatPhase audioSwell
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
    const float F = 1.1;
    float D = 1.6 + 1.0 * clamp(gapP, 0.0, 1.0);
    float fly = 0.3 * sceneTime + 1.1 * audioAdvance;
    float NB = floor(6.0 + 4.0 * clamp(bladeP, 0.0, 1.0));
    float breath = 0.08 * (0.5 - 0.5 * cos(6.2831853 * clamp(audioBeatPhase, 0.0, 1.0)));
    float glow = 0.6 + 0.6 * clamp(audioSwell, 0.0, 1.0);
    vec3 col = vec3(0.0);
    bool blocked = false;
    float k0 = floor(fly / D) + 1.0;
    float sec = 6.2831853 / NB;
    for (int i = 0; i < 8; ++i) {
        float k = k0 + float(i);
        float dz = k * D - fly;
        if (dz < 0.05) continue;
        vec2 w = p * dz / F;                                          // the place on the gate's plane
        float open = clamp(smoothstep(4.0 * D, 0.6 * D, dz) + breath, 0.0, 1.0);
        float Ra = 0.06 + 0.6 * open;                                 // the aperture's inradius
        float turn = (1.0 - open) * 0.9 + 0.7 * k;
        float aw = atan(w.y, w.x) - turn;
        float sk = floor(aw / sec + 0.5);
        float ac = aw - sk * sec;                                     // the angle to the side's middle
        float dist = length(w) * cos(ac) - Ra;                        // beyond the aperture's side
        float px = dz / F / resolution.y;
        if (dist > 0.0 && length(w) < 1.8) {
            // the blade behind this side: the photo, shaded across its width, its edge glowing
            float acr = fract((aw + 0.5 * sec) / sec);
            vec2 puv = vec2(fract(mod(sk, NB) / NB + 0.37 * k), 0.2 + 0.5 * min(dist, 1.0));
            vec3 blade = tone(imgLod(fract(puv), 2.0), fh) * (0.35 + 0.5 * acr);
            float edge = exp(-pow(dist / (2.0 * px + 0.004), 2.0)) + 0.5 * exp(-pow((1.0 - acr) * sec * length(w) / (2.0 * px + 0.003), 2.0));
            col = blade * exp(-0.08 * dz) + famLight(fh, 0.65, 0.6) * edge * 0.6 * glow * exp(-0.06 * dz);
            blocked = true;
            break;
        }
        col += famLight(fh, 0.6, 0.5) * exp(-pow(dist / (2.0 * px + 0.004), 2.0)) * 0.5 * glow * exp(-0.06 * dz);
    }
    if (!blocked) col += famCol(fh, 0.5) * 0.25 + famLight(fh, 0.6, 0.7) * exp(-length(p) * 5.0) * 0.4;
    finish(col);
}
