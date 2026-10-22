//@doc
 * @brief DICHROIC OIL WHEEL: a projector's oil wheel thrown on the wall: blobs of two oils drifting in a turning glass
 * wheel, the light through them coloured by dichroic plates -- each plate tips its colour between a tone and its
 * complement with its angle -- softly out of focus at the edges; the wheel turns with the music's drive and every
 * section tips the plates to new angles.  The oils are a metaball field turned with the wheel and drifting inside it;
 * the wheel is cut into six plates, and a plate's tone is the cosine of its tilt (cross-faded over six seconds to the
 * new section's tilts).  A sister of OilProjector.  The two tones are the photo's colour family and its complement.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance       -> the wheel turns (integrated)
 *   audioSectionId/Age -> every section tips the plates (cross-faded over six seconds)
 *   audioSwell         -> the lamp's brightness
 *
 * Knobs: blobP (how many blobs), focusP (how sharp the projection is), hueP.
//@params blobP focusP
//@audio audioSectionId audioSectionPrev audioSectionAge audioSwell
//@body
/**  A plate's tilt for a section.
 *
 * @param plate  The plate. (in)
 * @param sec    The section. (in)
 *
 * @return
 *   The tilt.
 **/
float tiltOf(float plate, float sec)
{
    return 6.2831853 * hash21(vec2(plate, sec + 3.0));
}

void main()
{
    vec2 p = screenP();
    float fh = famHue();
    float turn = 0.04 * sceneTime + 0.3 * audioAdvance;
    float r = length(p);
    vec2 q = rot2(turn) * p;
    float n = 6.0 + 6.0 * clamp(blobP, 0.0, 1.0);
    float soft = 0.004 + 0.03 * (1.0 - clamp(focusP, 0.0, 1.0));
    // the oils: blobs drifting inside the wheel
    float f = 0.0;
    for (int k = 0; k < 12; ++k) {
        float i = float(k);
        float w = clamp(n - i, 0.0, 1.0);
        vec2 c = 0.42 * vec2(sin(0.13 * sceneTime * (0.5 + 0.1 * i) + 2.1 * i), cos(0.11 * sceneTime * (0.6 + 0.07 * i) + 1.3 * i));
        float s = 0.07 + 0.05 * hash11(i * 3.3);
        f += w * s * s / max(dot(q - c, q - c), 1e-4);
    }
    float oil = smoothstep(1.0 - soft * 20.0, 1.0 + soft * 20.0, f);
    float oil2 = smoothstep(2.4 - soft * 30.0, 2.4 + soft * 30.0, f);
    // the plates: six sectors of the wheel, each tipping its tone
    float a = atan(q.y, q.x);
    float plate = mod(floor(a / 1.0471976), 6.0);
    float m = smoothstep(0.0, 6.0, audioSectionAge);
    float tilt = mix(tiltOf(plate, max(audioSectionPrev, 0.0)), tiltOf(plate, max(audioSectionId, 0.0)), m);
    float c = 0.5 + 0.5 * cos(tilt + 2.0 * r);
    vec3 tA = famLight(fh, 0.4, 0.3), tB = famLight(fract(fh + 0.5), 0.4, 0.3);
    vec3 glass = mix(tA, tB, c);
    vec3 col = glass * (0.25 + 0.75 * oil) * (1.0 - 0.5 * oil2) + mix(tB, tA, c) * oil2 * 0.6;
    float lamp = (0.6 + 0.6 * clamp(audioSwell, 0.0, 1.0)) * (1.0 - smoothstep(0.75, 0.95, r)) * (0.75 + 0.35 * exp(-r * 2.0));
    float seam = exp(-pow(abs(mod(a + 0.5236, 1.0471976) - 0.5236) * r / (soft + 0.003), 2.0)) * 0.3;
    col = col * lamp * (1.0 - seam);
    finish(col);
}
