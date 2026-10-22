//@doc
 * @brief CRYSTALLOGRAPHIC KALEIDO 3D: the photo mirrored through a three-dimensional lattice -- a space group instead
 * of a plane group: panes of glass on the lattice' planes, each pane showing the photo turned and mirrored as the
 * group dictates -- and the eye flies through wall after wall of mirrored images, each half seen through the ones
 * before it.  Three groups take turns: all mirrors (the cell's images mirrored across every face), a four-fold screw
 * (each layer along the flight turned a quarter further) and a body-centred lattice (every other layer shifted by
 * half a cell).  The photo's own colours, calmed toward one colour family.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSectionId/Age -> every new section turns to the next group, over six seconds (the light cross-faded)
 *   audioAdvance       -> the flight (integrated)
 *   audioSwell         -> the panes' reflections strengthen
 *
 * Knobs: cellP (the lattice' cell size), paneP (how much each pane shows), hueP.
//@params cellP paneP
//@audio audioSectionId audioSectionPrev audioSectionAge audioSwell
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

/**  The picture on a pane: its in-plane coordinates in the pane's cell, transformed by the group.
 *
 * @param w      The point's coordinates in the pane (cell units). (in)
 * @param layer  The pane's layer index along the flight. (in)
 * @param kind   0 mirrors, 1 four-fold screw, 2 body-centred. (in)
 *
 * @return
 *   The photo coordinate.
 **/
vec2 paneUV(vec2 w, float layer, float kind)
{
    if (kind > 1.5) w += 0.5 * mod(layer, 2.0);                 // body-centred: every other layer shifted by half
    vec2 c = floor(w);
    vec2 f = fract(w);
    if (kind < 0.5 || kind > 1.5) f = mix(f, 1.0 - f, mod(c, 2.0));   // mirrors across every face
    if (kind > 0.5 && kind < 1.5) {                              // the screw: a quarter turn per layer
        float q = mod(layer, 4.0);
        f -= 0.5;
        f = q < 0.5 ? f : q < 1.5 ? vec2(-f.y, f.x) : q < 2.5 ? -f : vec2(f.y, -f.x);
        f += 0.5;
        f = mix(f, 1.0 - f, mod(c, 2.0));
    }
    return f * 0.8 + 0.1;
}

void main()
{
    vec2 p = screenP();
    float fh = famHue();
    float S = 1.2 + 0.8 * clamp(cellP, 0.0, 1.0);
    float pane = 0.4 + 0.5 * clamp(paneP, 0.0, 1.0);
    float refl = 0.45 + 0.35 * clamp(audioSwell, 0.0, 1.0);
    float kA = mod(max(audioSectionPrev, 0.0), 3.0), kB = mod(max(audioSectionId, 0.0), 3.0);
    float m = smoothstep(0.0, 6.0, audioSectionAge);
    float fly = 0.25 * sceneTime + 1.0 * audioAdvance;
    vec3 ro = vec3(0.37 * S, 0.29 * S, fly);
    vec3 rd = normalize(vec3(p, 1.2));
    rd.xz = rot2(0.3 * sin(0.021 * sceneTime)) * rd.xz;
    rd.yz = rot2(0.22 * sin(0.017 * sceneTime + 1.0)) * rd.yz;
    // the panes perpendicular to the flight (z = k S), met one after another; side panes (x, y) fainter
    vec3 col = famCol(fh, 0.45) * 0.04;
    float trans = 1.0;
    float z0 = ceil(ro.z / S) * S;
    for (int i = 0; i < 5; ++i) {
        float zp = z0 + float(i) * S;
        float t = (zp - ro.z) / max(rd.z, 0.05);
        vec3 x = ro + rd * t;
        vec2 w = x.xy / S;
        float layer = zp / S;
        vec3 cA = tone(imgLod(paneUV(w, layer, kA), 0.3 + 0.15 * float(i)), fh);
        vec3 cB = tone(imgLod(paneUV(w, layer, kB), 0.3 + 0.15 * float(i)), fh);
        vec3 c = mix(cA, cB, m);
        // a pane reflects some of the image toward the eye, lets the rest through; the frame of each cell glows
        vec2 f = fract(w);
        float frame = exp(-min(min(f.x, 1.0 - f.x), min(f.y, 1.0 - f.y)) / 0.012);
        float a = pane * refl * (0.5 + 0.8 * luma(c)) * exp(-0.04 * t) * smoothstep(0.0, 0.35 * S, t);   // a pane passed fades
        col += trans * a * (c * 1.5 + famLight(fh, 0.6, 0.5) * frame * 0.8);
        trans *= 1.0 - a;
    }
    finish(col);
}
