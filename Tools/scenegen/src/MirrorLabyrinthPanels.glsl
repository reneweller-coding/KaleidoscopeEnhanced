//@doc
 * @brief MIRROR LABYRINTH PANELS: a grid of square mirror panels, each turning about its vertical axis at its own
 * moment -- a wave of turning runs through the grid in time with the bar -- so the photo appears in strips and
 * flip images: a panel seen at an angle shows the reflected picture squeezed and shifted, and when it turns past
 * edge-on it shows its other side, which reflects the photo shown before.  Optics: a panel at the angle a appears
 * cos(a) wide; its reflection is the picture seen from 2a further round.  One colour family from the photo.
 *
 * Audio Reactivity (structure, not only light):
 *   audioBarPhase -> the wave of turning runs through the grid, one sweep per bar (continuous)
 *   audioSwell    -> how far each panel turns
 *   audioAdvance  -> the pictures drift (integrated)
 *
 * Knobs: panelP (the panels' size), waveP (the wave's direction), hueP.  Distinct from KineticMirrorHexagonArray,
 * which has hexagonal mirrors.
//@params panelP waveP
//@audio audioBarPhase audioSwell
//@body
void main()
{
    vec2 p = screenP();
    float fh = famHue();
    float S = 0.12 + 0.1 * clamp(panelP, 0.0, 1.0);
    float reach = 0.6 + 1.4 * clamp(audioSwell, 0.0, 1.0);
    float drift = 0.02 * sceneTime + 0.08 * audioAdvance;
    vec2 dir = normalize(vec2(cos(3.0 * clamp(waveP, 0.0, 1.0)), sin(3.0 * clamp(waveP, 0.0, 1.0))));
    vec2 cid = floor(p / S);
    vec2 f = fract(p / S) - 0.5;
    vec2 centre = (cid + 0.5) * S;
    // the panel's angle: a wave running through the grid once per bar (smooth, it wraps with the bar)
    float wave = sin(6.2831853 * (audioBarPhase - dot(centre, dir) * 0.8));
    float a = reach * 1.2 * wave;                                // -reach .. reach (radians, up to past edge-on)
    float w = cos(a);
    // the panel seen at an angle: cos(a) wide; outside that the dark gap behind it
    float inside = step(abs(f.x), 0.5 * abs(w) * 0.94) * step(abs(f.y), 0.47);
    float u = f.x / max(abs(w), 0.05);
    // the reflection: the picture seen 2a further round, squeezed; the back side shows the photo before
    vec2 uv = vec2(centre.x * 0.8 + u * S * 0.8 + 0.6 * sin(2.0 * a) + drift, centre.y * 0.8 + f.y * S * 0.8) + 0.5;
    vec3 pic = w > 0.0 ? imgLod(uv, 0.8) : imgB(uv, 0.8);
    vec3 col = famCol(fh, 0.15 + 0.7 * luma(pic)) * (0.25 + 1.2 * luma(pic)) * (0.35 + 0.65 * abs(w));
    // the panel's edge catches the light as it passes edge-on
    col += famLight(fh, 0.6, 0.6) * exp(-pow(abs(w) / 0.08, 2.0)) * 0.6;
    col *= inside;
    col += famCol(fh, 0.4) * 0.025;
    finish(col);
}
