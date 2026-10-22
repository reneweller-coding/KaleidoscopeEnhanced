//@doc
 * @brief KALEIDO CYLINDER BRASS: a teleidoscope with a glass-ball lens: in front of the three mirrors sits a ball of
 * glass, and behind the ball a wheel of colours turns -- pieces of the photo set as sectors -- so the image is a
 * ring of facets that rolls without rest.  Optics: the ball lens shows the wheel upside down and magnified, more so
 * toward its rim (a ray at height h through a ball of radius 1 lands at about -h / (1 - 0.6 h^2)); the three mirrors
 * fold that lens image into the triangle and repeat it; the tube's brass rim frames the view.  One colour family
 * from the photo; every bounce costs a tenth of the light.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance -> the colour wheel turns (integrated)
 *   audioSwell   -> the lens wanders over the wheel
 *   audioKick    -> the wheel's sector edges flash (light)
 *
 * Knobs: sectorP (the wheel's sector count), lensP (the lens' strength), hueP.  Distinct from Teleidoscope, which
 * folds without a wheel.
//@params sectorP lensP
//@audio audioSwell audioKick
//@body
/**  Fold a point into the equilateral triangle (side 1, centre at 0) by reflecting it across the side it lies
 * beyond, again and again.
 *
 * @param p  The point. (in)
 * @param n  Returns how many reflections it took. (out)
 * @param e  Returns the distance to the nearest side. (out)
 *
 * @return
 *   The point inside the triangle.
 **/
vec2 triFold(vec2 p, out float n, out float e)
{
    const vec2 N0 = vec2(0.0, -1.0), N1 = vec2(0.8660254, 0.5), N2 = vec2(-0.8660254, 0.5);
    const float H = 0.2886751;
    n = 0.0;
    for (int i = 0; i < 48; ++i) {
        float d0 = dot(p, N0) - H, d1 = dot(p, N1) - H, d2 = dot(p, N2) - H;
        float dm = max(d0, max(d1, d2));
        if (dm <= 0.0) break;
        p -= 2.0 * dm * (dm == d0 ? N0 : dm == d1 ? N1 : N2);
        n += 1.0;
    }
    e = -max(dot(p, N0) - H, max(dot(p, N1) - H, dot(p, N2) - H));
    return p;
}

void main()
{
    vec2 p = screenP();
    float fh = famHue();
    float sectors = floor(5.0 + 7.0 * clamp(sectorP, 0.0, 1.0));
    float lensK = 0.4 + 0.5 * clamp(lensP, 0.0, 1.0);
    float wheelTurn = 0.05 * sceneTime + 0.3 * audioAdvance;
    vec2 lensAt = 0.25 * vec2(sin(0.05 * sceneTime + 1.5 * clamp(audioSwell, 0.0, 1.0)), cos(0.04 * sceneTime));
    float n, e;
    vec2 q = triFold(p / 0.55, n, e);
    // the ball lens: inverted, magnified toward its rim
    vec2 h = q * 1.7;
    vec2 w = -h / max(1.0 - lensK * dot(h, h), 0.25) * 0.6 + lensAt;
    // the colour wheel behind the lens: sectors, each a piece of the photo, turning
    float ang = atan(w.y, w.x) + wheelTurn;
    float sec = floor(ang / 6.2831853 * sectors);
    float inSec = fract(ang / 6.2831853 * sectors);
    float hs = fract(sin(mod(sec, sectors) * 12.9898) * 43758.5453);
    vec2 uv = vec2(0.2 + 0.6 * hs, 0.2 + 0.6 * fract(hs * 3.7)) + 0.25 * vec2(inSec - 0.5, length(w) - 0.5);
    vec3 photo = imgLod(uv, 1.2);
    vec3 col = famCol(fh, 0.1 + 0.8 * hs) * (0.35 + 1.1 * luma(photo));
    float edge = min(inSec, 1.0 - inSec) * length(w) * 6.2831853 / sectors;
    col *= smoothstep(0.0, 0.01, edge);
    col += famLight(fh, 0.6, 0.7) * exp(-edge / 0.006) * clamp(audioKick, 0.0, 1.0) * 0.5;
    // the mirrors: every bounce costs a tenth of the light, fine seams; the brass rim frames the view
    col *= pow(0.9, n) * smoothstep(0.0, 0.006, e);
    float rim = length(p) / 0.78;                               // the tube's rim, wider than the frame is high
    col *= smoothstep(1.0, 0.94, rim);
    col += famLight(fh, 0.55, 0.3) * 0.25 * exp(-pow((rim - 1.03) / 0.04, 2.0));
    finish(col);
}
