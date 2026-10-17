//@doc
 * @brief GIRIH STRAPWORK: Islamic strapwork by Hankin's polygons-in-contact method -- from the middle of every edge of
 * an underlying tiling two straps leave at an angle, meet the straps from the neighbouring edges and weave stars
 * and rosettes.  The contact angle turns continuously, so the pattern re-weaves itself: stars sharpen, open into
 * rosettes, close into lattices.  The fields between the straps hold the photo; the straps over-and-under in
 * alternate shades.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSectionId  -> each section switches the underlying tiling between squares and hexagons (crossfaded)
 *   audioPhase      -> the contact angle turns, the weave drifts and turns slowly (integrated)
 *   audioKick       -> the straps flash (light)
 *
 * Knobs: sizeP (cell size), strapP (strap width), photoP (photo share), hueP.
//@params sizeP strapP photoP
//@audio audioKick audioSectionId audioSectionAge
//@body
/**  The strapwork in one cell of a regular tiling: the distance to the nearest strap, where straps leave every edge
 * midpoint at the contact angle.
 *
 * @param l      The point relative to the cell's centre (cell circumradius 1). (in)
 * @param n      The polygon's sides (4 or 6). (in)
 * @param theta  The contact angle (from the edge). (in)
 *
 * @return
 *   The distance to the nearest strap, and which strap family (for the over-under shade).
 **/
vec2 straps(vec2 l, float n, float theta)
{
    float best = 1e9, fam = 0.0;
    float apo = cos(3.14159265 / n);                            // the inradius: edge midpoints lie on it
    for (int i = 0; i < 6; ++i) {
        if (float(i) >= n) break;
        float a = 6.2831853 * (float(i) + 0.5) / n;
        vec2 m = apo * vec2(cos(a), sin(a));                   // the edge's midpoint
        vec2 t = vec2(-sin(a), cos(a));                        // along the edge
        for (int s = 0; s < 2; ++s) {
            float sg = s == 0 ? 1.0 : -1.0;
            // the strap leaves the midpoint into the cell, at theta from the edge
            vec2 d = normalize(t * sg * cos(theta) - vec2(cos(a), sin(a)) * sin(theta));
            vec2 v = l - m;
            float along = clamp(dot(v, d), 0.0, 1.5);
            float dist = length(v - d * along);
            if (dist < best) { best = dist; fam = mod(float(i) + (s == 0 ? 0.0 : 0.5), 2.0); }
        }
    }
    return vec2(best, fam);
}

void main()
{
    vec2 p = screenP();
    float sz = 0.12 + 0.12 * clamp(sizeP, 0.0, 1.0);
    vec2 x = rot2(0.01 * audioPhase + 0.004 * sceneTime) * p / sz + vec2(0.05, 0.03) * sceneTime;   // the weave drifts and turns
    float theta = 0.35 + 0.35 * sin(0.03 * audioPhase + 0.02 * sceneTime) + 0.2;
    float w = 0.07 + 0.07 * clamp(strapP, 0.0, 1.0);
    float k = max(audioSectionId, 0.0);
    float now = mod(k, 2.0), before = mod(k + 1.0, 2.0);
    float m = audioSectionId < 0.5 ? 1.0 : smoothstep(0.0, 4.0, audioSectionAge);
    vec3 col = vec3(0.0);
    for (int j = 0; j < 2; ++j) {
        float hex = j == 0 ? now : before;
        float wt = j == 0 ? m : 1.0 - m;
        if (wt < 0.001) continue;
        vec2 l, id;
        float n;
        if (hex > 0.5) {
            vec2 a = vec2(1.0, 1.7320508);
            vec2 h1 = mod(x, a) - 0.5 * a, h2 = mod(x - 0.5 * a, a) - 0.5 * a;
            l = dot(h1, h1) < dot(h2, h2) ? h1 : h2;
            id = x - l;
            l = rot2(0.5235988) * l / 0.57735;                 // to circumradius 1, a vertex up
            n = 6.0;
        } else {
            id = floor(x + 0.5);
            l = (x - id) * 1.4142136;
            l = rot2(0.7853982) * l;
            n = 4.0;
        }
        vec2 s = straps(l, n, theta);
        float strap = 1.0 - smoothstep(w * 0.7, w, s.x);
        float hh = hash21(floor(id * 2.0 + 0.5));
        vec2 uv = p * 0.6 + 0.5 + vec2(hh, fract(hh * 3.1)) * 0.1;
        vec3 photo = imgLod(uv, 0.5);
        vec3 tone = imgPalette(0.1 + 0.4 * s.y + 0.03 * audioPhase);
        vec3 field = mix(photo, tone, 0.45 - 0.4 * clamp(photoP, 0.0, 1.0)) * (0.55 + 0.6 * hh);
        vec3 band = mix(tone, vec3(1.0, 0.95, 0.85), 0.55) * (s.y > 0.5 ? 1.25 : 0.85) * (0.8 + 0.5 * clamp(audioKick, 0.0, 1.0));
        float edge = smoothstep(w * 0.7, w * 0.55, s.x) * (1.0 - smoothstep(w * 0.4, w * 0.2, s.x));
        vec3 c = mix(field, band, strap) * (1.0 - 0.6 * edge);
        col += wt * c;
    }
    finish(col);
}
