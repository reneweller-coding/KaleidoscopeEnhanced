//@doc
 * @brief BYOBU SCREEN CORRIDOR: a corridor lined with painted folding screens, the photo painted across their panels,
 * that fold shut and open again with the bars -- light from behind the screens leaking through the gaps as they open --
 * over a dark polished floor.  The walls are the planes beside the eye; each screen is four panels whose shading
 * alternates with the fold's angle, so folding shows as light and shade, and between screens a gap opens with the fold;
 * the fold follows the bar's phase as a cosine, so it opens and closes smoothly once a bar.  The floor mirrors the
 * walls' light softly.  The paintings are the photo, calmed toward one colour family.
 *
 * Audio Reactivity (structure, not only light):
 *   audioBarPhase -> the screens fold shut and open once a bar, the gaps letting the light through
 *   audioAdvance  -> the walk down the corridor (integrated)
 *   audioSwell    -> the light behind the screens
 *
 * Knobs: panelP (the panels' width), foldP (how far they fold), hueP.
//@params panelP foldP
//@audio audioBarPhase audioSwell
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

/**  A wall of folding screens at a place.
 *
 * @param zw    The place along the corridor. (in)
 * @param y     The height on the wall (floor at 0). (in)
 * @param side  Which wall (-1 left, +1 right). (in)
 * @param P     A panel's width. (in)
 * @param open  How far the screens are folded open (0..1). (in)
 * @param px    A pixel's length along the wall here. (in)
 * @param fh    The family's hue. (in)
 *
 * @return
 *   The wall's light.
 **/
vec3 screens(float zw, float y, float side, float P, float open, float px, float fh)
{
    float S = 4.0 * P + 0.25;                                         // a screen and the gap after it
    float sid = floor(zw / S), x = zw - sid * S;
    float gap = 0.04 + 0.2 * open;                                    // the gap grows as the screens fold
    float panelW = (S - gap) / 4.0;
    float pi = floor(x / panelW), px0 = x - pi * panelW;
    vec3 behind = famLight(fh, 0.7, 0.4) * (0.5 + 0.5 * clamp(audioSwell, 0.0, 1.0));
    if (x > S - gap || y > 1.35 || y < 0.05) return behind * smoothstep(1.6, 0.9, y) * 0.8;
    // the painting: the photo across the screen's four panels
    vec2 puv = vec2((x / (S - gap)) * 0.8 + 0.1, 0.15 + 0.7 * y / 1.4);
    puv.x = side > 0.0 ? puv.x : 1.0 - puv.x;
    puv += vec2(0.31, 0.17) * mod(sid, 3.0);
    vec3 paint = tone(imgLod(fract(puv), 1.5), fh);
    float ang = 0.15 + 0.6 * open;                                    // the fold's angle
    float shade = 0.65 + 0.35 * sin(ang) * (mod(pi, 2.0) < 0.5 ? 1.0 : -1.0);
    float hinge = exp(-pow(min(px0, panelW - px0) / (1.5 * px + 0.002), 2.0));
    float frame = exp(-pow(min(abs(y - 0.05), abs(y - 1.35)) / (1.5 * px + 0.004), 2.0));
    return paint * shade * 0.8 - paint * hinge * 0.4 + famLight(fh, 0.6, 0.6) * frame * 0.3;
}

void main()
{
    vec2 p = screenP();
    float fh = famHue();
    const float W = 0.9, FLOOR = -0.55, F = 1.2;
    float walk = 0.25 * sceneTime + 0.9 * audioAdvance;
    float P = 0.35 + 0.2 * clamp(panelP, 0.0, 1.0);
    float bp = clamp(audioBarPhase, 0.0, 1.0);
    float open = (0.5 - 0.5 * cos(6.2831853 * bp)) * (0.5 + 0.5 * clamp(foldP, 0.0, 1.0));
    vec3 col = famCol(fh, 0.45) * 0.02;
    float zWall = W * F / max(abs(p.x), 1e-4);
    float zFloor = p.y < 0.0 ? -FLOOR * F / -p.y : 1e9;
    if (zWall < zFloor) {
        float y = p.y * zWall / F - FLOOR;
        float px = zWall * zWall / (W * F) / resolution.y;
        col = screens(zWall + walk, y, sign(p.x), P, open, px, fh) * exp(-0.07 * zWall);
    } else {
        // the floor: dark polished wood mirroring the screens' light
        float x = p.x * zFloor / F;
        float zM = W * F / max(abs(p.x), 1e-4);
        float yM = -(p.y * zM / F - FLOOR);
        vec3 mirror = yM > 0.0 && yM < 1.6 ? screens(zM + walk, yM, sign(p.x), P, open, 0.01, fh) : vec3(0.0);
        float grain = 0.8 + 0.2 * noise2(vec2(x * 20.0, (zFloor + walk) * 1.5));
        col = famCol(fh, 0.3) * 0.05 * grain + mirror * 0.25 * exp(-0.07 * zM) * exp(-1.5 * abs(yM) * 0.3);
        col *= exp(-0.05 * zFloor);
    }
    col += famLight(fh, 0.6, 0.6) * exp(-length(p - vec2(0.0, 0.05)) * 7.0) * 0.25;
    finish(max(col, vec3(0.0)));
}
