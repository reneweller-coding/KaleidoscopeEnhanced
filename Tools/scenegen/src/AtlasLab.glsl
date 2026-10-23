//@doc
 * @brief ATLAS LAB: the photo laid on a globe and spread across the screen by eighteen map projections -- plate carree,
 * Mercator, Mollweide, sinusoidal, orthographic, stereographic, azimuthal equidistant, Lambert's equal-area azimuthal,
 * gnomonic, Hammer, Eckert IV, Craster's parabolic, Lambert's cylinder, Miller, Gall's stereographic, Bonne, Werner's
 * heart, the equidistant cone.  The globe turns about changing axes (spinning, tumbling, precessing, nodding, seen from
 * the pole, tilted, two axes at once, drifting); a third stage lights it (flat, a turning sun with a soft terminator, a
 * dimmed rim, the world doubled and mirrored); a fourth chooses the view (the whole map, tiled copies, a zoom,
 * a deeper zoom).  Beyond the outline the photo itself continues, dimmed.  The walk changes one stage at a time and
 * cross-fades the maps, so the continents of one projection slide into another's; a new section changes all four.
 *
 * Audio Reactivity (structure, not only light):
 *   audioPhase      -> the globe's spin (integrated)
 *   audioHarmAdvance -> the tilt of the axis steps on with each harmonic change (integrated)
 *   audioSwell      -> the light's reach: how deep the night side falls
 *   audioSectionId/Age -> a new section re-rolls every stage
 *
 * Knobs: seedP (the walk's seed), spinP (the globe's speed), zoomP (the view's size), hueP.
//@params seedP spinP zoomP
//@audio audioSwell audioHarmAdvance
//@body
/**  The inverse of a map projection: the place on the globe at a point of the map.
 *
 * @param kind  The projection, 0..17. (in)
 * @param u     The map's coordinates, fitted to the outline's size. (in)
 * @param ok    Whether the point lies inside the map's outline. (out)
 * @param ext   The outline's half extents (its natural scale). (out)
 *
 * @return
 *   Longitude and latitude in radians.
 **/
vec2 atlasInv(int kind, vec2 u, out float ok, out vec2 ext)
{
    ok = 1.0;
    ext = vec2(3.14159265, 1.5707963);
    float rho = length(u);
    float c = 0.0;
    if (kind == 0) return u;
    if (kind == 1) { ext = vec2(3.14159265, 3.0); return vec2(u.x, 2.0 * atan(exp(clamp(u.y, -6.0, 6.0))) - 1.5707963); }
    if (kind == 2) {
        ext = vec2(2.828427, 1.414214);
        float th = asin(clamp(u.y / 1.414214, -1.0, 1.0));
        float ph = asin(clamp((2.0 * th + sin(2.0 * th)) / 3.14159265, -1.0, 1.0));
        ok = abs(u.x) <= 2.828427 * cos(th) && abs(u.y) <= 1.414214 ? 1.0 : 0.0;
        return vec2(3.14159265 * u.x / (2.828427 * max(cos(th), 1e-3)), ph);
    }
    if (kind == 3) {
        float ph = clamp(u.y, -1.5707963, 1.5707963);
        float lam = u.x / max(cos(ph), 1e-3);
        ok = abs(lam) <= 3.14159265 ? 1.0 : 0.0;
        return vec2(lam, ph);
    }
    if (kind >= 4 && kind <= 8) {
        if (kind == 4) { ext = vec2(1.0); c = asin(clamp(rho, 0.0, 1.0)); ok = rho <= 1.0 ? 1.0 : 0.0; }
        else if (kind == 5) { ext = vec2(2.0); c = 2.0 * atan(rho * 0.5); }
        else if (kind == 6) { ext = vec2(3.14159265); c = rho; ok = rho <= 3.14159265 ? 1.0 : 0.0; }
        else if (kind == 7) { ext = vec2(2.0); c = 2.0 * asin(clamp(rho * 0.5, 0.0, 1.0)); ok = rho <= 2.0 ? 1.0 : 0.0; }
        else { ext = vec2(2.0); c = atan(rho); ok = c < 1.45 ? 1.0 : 0.0; }
        float ph = asin(clamp(u.y * sin(c) / max(rho, 1e-4), -1.0, 1.0));
        float lam = atan(u.x * sin(c), rho * cos(c));
        return vec2(lam, ph);
    }
    if (kind == 9) {
        ext = vec2(2.828427, 1.414214);
        float z2 = 1.0 - (u.x / 4.0) * (u.x / 4.0) - (u.y / 2.0) * (u.y / 2.0);
        ok = z2 > 0.0 ? 1.0 : 0.0;
        float z = sqrt(max(z2, 0.0));
        return vec2(2.0 * atan(z * u.x, 2.0 * (2.0 * z * z - 1.0)), asin(clamp(z * u.y, -1.0, 1.0)));
    }
    if (kind == 10) {
        ext = vec2(2.6527, 1.3265);
        float sn = u.y / 1.3265;
        ok = abs(sn) <= 1.0 ? 1.0 : 0.0;
        float th = asin(clamp(sn, -1.0, 1.0));
        float ph = asin(clamp((th + sin(th) * cos(th) + 2.0 * sin(th)) / (2.0 + 1.5707963), -1.0, 1.0));
        return vec2(u.x / (0.42223 * (1.0 + cos(th))), ph);
    }
    if (kind == 11) {
        ext = vec2(3.07, 1.535);
        float ph = 3.0 * asin(clamp(u.y / 3.07, -1.0, 1.0));
        ok = abs(u.y) <= 1.535 ? 1.0 : 0.0;
        float lam = u.x / (0.9772 * max(2.0 * cos(2.0 * ph / 3.0) - 1.0, 1e-3));
        ok *= abs(lam) <= 3.14159265 ? 1.0 : 0.0;
        return vec2(lam, ph);
    }
    if (kind == 12) { ext = vec2(3.14159265, 1.0); ok = abs(u.y) <= 1.0 ? 1.0 : 0.0; return vec2(u.x, asin(clamp(u.y, -1.0, 1.0))); }
    if (kind == 13) { ext = vec2(3.14159265, 2.3); return vec2(u.x, 2.5 * atan(exp(clamp(0.8 * u.y, -6.0, 6.0))) - 0.625 * 3.14159265); }
    if (kind == 14) { ext = vec2(2.22, 1.71); return vec2(1.41421 * u.x, 2.0 * atan(u.y / 1.7071)); }
    if (kind == 15 || kind == 16) {
        float p1 = kind == 15 ? 0.7853982 : 1.5707963;
        float cot = kind == 15 ? 1.0 : 0.0;
        ext = vec2(2.6, 1.6);
        u.y -= kind == 15 ? 0.8 : 1.5708;
        float r = sqrt(u.x * u.x + (cot - u.y) * (cot - u.y));
        float ph = cot + p1 - r;
        ok = abs(ph) <= 1.5707963 ? 1.0 : 0.0;
        float lam = r * atan(u.x, cot - u.y) / max(cos(ph), 1e-2);
        ok *= abs(lam) <= 3.14159265 ? 1.0 : 0.0;
        return vec2(lam, ph);
    }
    float n = (cos(0.5236) - cos(1.0472)) / (1.0472 - 0.5236);
    float G = cos(0.5236) / n + 0.5236;
    ext = vec2(3.3, 2.65);
    u.y += 1.1;
    float r = sqrt(u.x * u.x + (G - u.y) * (G - u.y));
    float ph = G - r;
    ok = abs(ph) <= 1.5707963 ? 1.0 : 0.0;
    float lam = atan(u.x, G - u.y) / n;
    ok *= abs(lam) <= 3.14159265 ? 1.0 : 0.0;
    return vec2(lam, ph);
}

/**  The globe's rotation for a motion law.
 *
 * @param law  The law, 0..7: spin, tumble, precession, nodding, polar view, tilted, two axes, drift. (in)
 * @param t    The clock. (in)
 * @param hd   The harmonic advance. (in)
 *
 * @return
 *   The rotation matrix.
 **/
mat3 atlasRot(int law, float t, float hd)
{
    float a = 0.0, b = 0.0, g = 0.0;
    if (law == 0) a = 0.35 * t;
    else if (law == 1) b = 0.3 * t;
    else if (law == 2) { a = 0.3 * t; b = 0.5 * sin(0.1 * t); g = 0.5 * cos(0.1 * t); }
    else if (law == 3) { a = 0.25 * t; b = 0.4 * sin(0.35 * t); }
    else if (law == 4) { a = 0.3 * t; b = 1.5708; }
    else if (law == 5) { a = 0.3 * t; b = 0.7854 + 0.2 * sin(0.7 * hd); }
    else if (law == 6) { a = 0.22 * t; b = 0.17 * t; g = 0.11 * t; }
    else { a = 0.1 * t; b = 0.3 * sin(0.05 * t); }
    float ca = cos(a), sa = sin(a), cb = cos(b), sb = sin(b), cg = cos(g), sg = sin(g);
    mat3 Rz = mat3(ca, sa, 0.0, -sa, ca, 0.0, 0.0, 0.0, 1.0);
    mat3 Ry = mat3(cb, 0.0, -sb, 0.0, 1.0, 0.0, sb, 0.0, cb);
    mat3 Rx = mat3(1.0, 0.0, 0.0, 0.0, cg, sg, 0.0, -sg, cg);
    return Rz * Ry * Rx;
}

/**  One look of the lab: the photo on the rotating globe, in a projection.
 *
 * @param k    The classes: x the projection, y the globe's motion, z the light, w the view. (in)
 * @param p    The place on screen. (in)
 * @param t    The clock. (in)
 * @param hd   The harmonic advance. (in)
 * @param zm   The view's zoom (1: the whole map). (in)
 * @param sw   The swell. (in)
 *
 * @return
 *   The colour.
 **/
vec3 atlasLook(ivec4 k, vec2 p, float t, float hd, float zm, float sw)
{
    float ok;
    vec2 ext;
    atlasInv(k.x, vec2(0.0), ok, ext);
    float fit = max(ext.x / 0.89, ext.y / 0.5) * 0.98;
    vec2 q = p;
    float z = k.w == 2 ? 1.8 * zm : (k.w == 3 ? 3.5 * zm : 1.0);
    q /= z;
    if (k.w == 1) {
        vec2 cell = 2.0 * ext / fit * 1.0;
        q = (fract((q + 0.5 * cell) / cell) - 0.5) * cell;
    }
    float oky;
    vec2 ll = atlasInv(k.x, q * fit, oky, ext);
    vec3 bg = imgLod(p * 0.8 + 0.5, 4.5) * 0.4;
    if (oky < 0.5) return bg;
    vec3 s = vec3(cos(ll.y) * cos(ll.x), cos(ll.y) * sin(ll.x), sin(ll.y));
    vec3 s2 = atlasRot(k.y, t, hd) * s;
    float lon = atan(s2.y, s2.x);
    float lat = asin(clamp(s2.z, -1.0, 1.0));
    vec2 uv = vec2(abs(lon) / 3.14159265 * (k.z == 3 ? 2.0 : 1.0), lat / 3.14159265 + 0.5);
    vec3 col = imgLod(uv, 0.6);
    if (k.z == 1) {
        float a = 0.2 * t;
        vec3 L = normalize(vec3(0.7, 0.8 * cos(a), 0.8 * sin(a)));
        col *= 0.3 + 0.8 * smoothstep(-0.25 - 0.3 * (1.0 - sw), 0.45, dot(s, L));
    } else if (k.z == 2) {
        float e = length(q * fit / ext);
        col *= 1.0 - 0.6 * smoothstep(0.6, 1.1, e);
    }
    return col;
}

void main()
{
    vec2 p = screenP();
    labWalk(seedP * 83.0, ivec4(18, 8, 4, 4), 1.0);
    float sw = clamp(audioSwell, 0.0, 1.0);
    float t = (0.6 + 0.9 * clamp(spinP, 0.0, 1.0)) * (sceneTime * 0.5 + 4.0 * audioPhase);
    float zm = 0.8 + 0.7 * clamp(zoomP, 0.0, 1.0);
    vec3 col = vec3(0.0);
    float ws = 0.0;
    for (int i = 0; i < 4; ++i) {
        if (gLabW[i] > 0.002) {
            col += gLabW[i] * atlasLook(gLabK[i], p, t, audioHarmAdvance, zm, sw);
            ws += gLabW[i];
        }
    }
    finish(max(col / max(ws, 1e-3), 0.0));
}
