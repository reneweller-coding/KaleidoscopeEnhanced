//@doc
 * @brief GREEK KEY MEANDER FLOW: the meander: a right-angled band that follows itself and never ends; the photo flows along the band, and the band runs through the picture with a changing winding.  Bands of meander lie one over another in alternating mirror images; inside the key the photo runs in the
 * band's direction, outside it is dimmed, and the cell size breathes slowly.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance     -> the flow along the band (integrated)
 *   audioHarmAdvance -> the winding (the cell size breathes with the harmony) (integrated)
 *
 * Knobs: sizeP (the size of the keys), hueP.
//@params sizeP
//@audio audioAdvance audioHarmAdvance
//@body
/**  The distance of a point in the unit cell to the line of the Greek key.
 *
 * @param f  The point in the unit cell. (in)
 *
 * @return
 *   The distance.
 **/
float keyd(vec2 f)
{
    vec2 P0 = vec2(0.0, 0.15);
    vec2 P1 = vec2(0.0, 0.92);
    vec2 P2 = vec2(0.82, 0.92);
    vec2 P3 = vec2(0.82, 0.32);
    vec2 P4 = vec2(0.3, 0.32);
    vec2 P5 = vec2(0.3, 0.7);
    vec2 P6 = vec2(0.56, 0.7);
    float d = sdSeg(f, P0, P1);
    d = min(d, sdSeg(f, P1, P2));
    d = min(d, sdSeg(f, P2, P3));
    d = min(d, sdSeg(f, P3, P4));
    d = min(d, sdSeg(f, P4, P5));
    d = min(d, sdSeg(f, P5, P6));
    d = min(d, sdSeg(f, vec2(0.0, 0.15), vec2(1.0, 0.15)));
    return d;
}
void main()
{
    vec2 p = screenP();
    float S = (0.2 + 0.15 * clamp(sizeP, 0.0, 1.0)) * (1.0 + 0.15 * sin(0.04 * audioHarmAdvance + 0.02 * sceneTime));
    vec2 q = p / S;
    float row = floor(q.y);
    vec2 f = vec2(fract(q.x), fract(q.y));
    float flip = mod(row, 2.0);
    if (flip > 0.5) f = vec2(1.0 - f.x, 1.0 - f.y);
    float d = keyd(f);
    float wd = 0.05;
    float line = 1.0 - smoothstep(wd * 0.7, wd, d);
    float glow = exp(-d * 12.0) * 0.4;
    float flow = 0.02 * audioAdvance + 0.03 * sceneTime;
    vec2 pf = p + vec2(flow * (flip > 0.5 ? -1.0 : 1.0), 0.0);
    vec3 c = imgLod(pf * 0.85 + 0.5, 0.5);
    vec3 bg = imgLod(p * 0.85 + 0.5, 2.5) * 0.2;
    vec3 col = bg + c * line * 1.3 + c * glow * 0.7;
    finish(col);
}
