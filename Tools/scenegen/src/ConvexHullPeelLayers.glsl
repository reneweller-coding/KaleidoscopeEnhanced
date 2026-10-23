//@doc
 * @brief CONVEX HULL PEEL LAYERS: convex hulls, layer by layer: from a cloud of points (drawn from the photo) the outermost points are drawn as a polygon, then the next ones, like the skins of an onion; the picture shows concentric polygons in the photo's colours.  Ten layers, each a polygon with nine corners whose
 * radii come from the photo's brightness at that place, so that the polygons are irregular and nested.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSpread  -> the number of layers (smoothed)
 *   audioAdvance -> the polygons turn against each other (integrated)
 *
 * Knobs: sizeP (the size of the outer polygon), hueP.
//@params sizeP
//@audio audioSpread audioAdvance
//@body
/**  The radius of a nine-cornered irregular polygon in a direction (the chord between two corners).
 *
 * @param th  The direction. (in)
 * @param R  The mean radius. (in)
 * @param rot  The turn of the corners. (in)
 * @param k  The layer number (seeds the corner radii). (in)
 *
 * @return
 *   The radius.
 **/
float polyR(float th, float R, float rot, float k)
{
    float M = 9.0;
    float a = (th - rot) / 6.2831853 * M;
    float j = floor(a);
    float f = fract(a);
    float a0 = j / M * 6.2831853 + rot;
    float a1 = (j + 1.0) / M * 6.2831853 + rot;
    vec2 A0 = vec2(cos(a0), sin(a0)) * (R * (0.75 + 0.5 * hash21(vec2(mod(j, M), k))));
    vec2 A1 = vec2(cos(a1), sin(a1)) * (R * (0.75 + 0.5 * hash21(vec2(mod(j + 1.0, M), k))));
    vec2 dir = vec2(cos(th), sin(th));
    vec2 e = A1 - A0;
    float denom = dir.x * e.y - dir.y * e.x;
    float tt = (A0.x * e.y - A0.y * e.x) / (denom + 1e-6);
    return abs(tt);
}
void main()
{
    vec2 p = screenP();
    float r = length(p) + 1e-4;
    float th = atan(p.y, p.x);
    float Rout = 0.55 + 0.25 * clamp(sizeP, 0.0, 1.0);
    float nl = 5.0 + 5.0 * clamp(audioSpread, 0.0, 1.0);
    vec3 col = imgLod(p * 0.85 + 0.5, 2.0) * 0.12;
    for (int k = 0; k < 10; ++k) {
        float fk = float(k);
        float on = clamp(nl - fk, 0.0, 1.0);
        float R = Rout * (1.0 - fk / 11.0);
        float rot = (0.03 * audioAdvance + 0.04 * sceneTime) * (mod(fk, 2.0) < 0.5 ? 1.0 : -1.0) * (0.5 + 0.1 * fk) + 0.3 * fk;
        float rp = polyR(th, R, rot, fk);
        float d = abs(r - rp);
        float line = 1.0 - smoothstep(0.0025, 0.007, d);
        vec3 c = imgLod(vec2(cos(th), sin(th)) * rp * 0.85 + 0.5, 1.0);
        c = mix(vec3(luma(c)), c, 1.5);
        col = mix(col, c * 1.5 + 0.1, line * on);
        float fill = smoothstep(0.0, 0.01, rp - r);
        col = mix(col, col + c * 0.06, fill * on);
    }
    finish(col);
}
