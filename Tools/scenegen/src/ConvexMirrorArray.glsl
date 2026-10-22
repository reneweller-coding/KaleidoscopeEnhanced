//@doc
 * @brief CONVEX MIRROR ARRAY: a field of small convex mirrors, like glass baubles in rows, each showing the room
 * round it squeezed into a disc -- and in each disc, near its rim, the neighbouring baubles again: reflections in
 * reflections.  Optics: a sphere's normal at the point seen gives the reflected ray; where that ray runs along the
 * field it meets the neighbours, which show as smaller, darker discs with the room in them once more; elsewhere it
 * sees the room (the photo as a panorama).  The baubles swing on their threads.  One colour family from the photo.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance -> the baubles swing on their threads (integrated)
 *   audioOnset   -> a row gets a push and swings a little further
 *   audioSwell   -> the room's light in the baubles grows
 *
 * Knobs: sizeP (the baubles' size), gapP (the gap between them), hueP.
//@params sizeP gapP
//@audio audioOnset audioSwell
//@body
/**  The room seen in a direction: the photo as a panorama, mirrored round so it has no seam.
 *
 * @param d   The direction. (in)
 * @param fh  The colour family. (in)
 *
 * @return
 *   The light.
 **/
vec3 roomLight(vec3 d, float fh)
{
    vec2 pan = vec2(abs(atan(d.x, -d.z)) / 3.14159265, d.y * 0.5 + 0.5);
    vec3 photo = imgLod(pan, 1.5);
    return famCol(fh, 0.15 + 0.7 * luma(photo)) * (0.2 + 1.1 * luma(photo));
}

void main()
{
    vec2 p = screenP();
    float fh = famHue();
    float S = 0.14 + 0.1 * clamp(sizeP, 0.0, 1.0);             // the cell's size
    float R = S * (0.42 - 0.12 * clamp(gapP, 0.0, 1.0));        // the bauble's radius
    float bright = 0.8 + 0.5 * clamp(audioSwell, 0.0, 1.0);
    float ph = 0.08 * sceneTime + 0.35 * audioAdvance;
    vec2 cid = floor(p / S + 0.5);
    float hc = fract(sin(dot(cid, vec2(12.9898, 78.233))) * 43758.5453);
    // the swing: each bauble on its thread, a row pushed further by onsets
    float push = 1.0 + 1.5 * clamp(audioOnset, 0.0, 1.0) * step(0.5, fract(cid.y * 0.5));
    vec2 swing = S * 0.12 * push * vec2(sin(ph + 6.2831853 * hc), 0.3 * sin(2.0 * ph + 6.2831853 * hc));
    vec2 q = p - cid * S - swing;
    float r = length(q) / R;
    vec3 col = famCol(fh, 0.5) * 0.02;                           // the dark wall behind the baubles
    if (r < 1.0) {
        vec3 n = vec3(q / R, sqrt(1.0 - r * r));
        vec3 refl = reflect(vec3(0.0, 0.0, -1.0), n);
        vec3 c = roomLight(refl, fh) * bright;
        // near the rim the reflected ray runs along the field and meets the neighbours: small dark discs
        float graze = 1.0 - refl.z;
        vec2 dir = normalize(refl.xy + 1e-5);
        float nb = abs(fract(atan(dir.y, dir.x) / 1.5707963 + 0.5) - 0.5);   // toward the four neighbours
        float disc = smoothstep(0.32, 0.22, nb) * smoothstep(0.75, 0.95, r);
        vec3 inner = roomLight(vec3(refl.xy, -refl.z), fh) * 0.45;
        c = mix(c, inner, disc * 0.8);
        // a highlight from the light above, the Fresnel brightening at the rim
        c += famLight(fh, 0.6, 0.8) * exp(-pow(length(q / R - vec2(-0.3, 0.35)) / 0.12, 2.0)) * 0.6;
        c *= 0.7 + 0.5 * pow(r, 4.0);
        col = mix(col, c, smoothstep(1.0, 0.97, r));
    }
    // the thread from above
    col += famCol(fh, 0.6) * 0.06 * exp(-pow((p.x - cid.x * S - swing.x) / 0.002, 2.0)) * step(R, q.y);
    finish(col);
}
