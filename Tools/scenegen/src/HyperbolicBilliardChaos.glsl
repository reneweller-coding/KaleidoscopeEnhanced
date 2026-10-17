//@doc
 * @brief HYPERBOLIC BILLIARD CHAOS: Bunimovich's stadium and Sinai's billiard as a picture of chaos -- from every
 * point of the table a ray leaves in the same direction and bounces off the walls; the pixel shows the photo where
 * its ray has arrived.  For the first bounces the picture is merely folded; then neighbouring rays part ways
 * exponentially and the image dissolves into a fine chaotic weave -- over a phrase the bounces mount up, then fall
 * back and the picture gathers itself again.  The table is mirrored across the frame.
 *
 * Audio Reactivity (structure, not only light):
 *   audioPhrasePos  -> the number of bounces: rising through the phrase, falling back at its end (continuous)
 *   audioSectionId  -> each section changes the table between stadium and Sinai (crossfaded)
 *   audioPhase      -> the launch direction turns (integrated)
 *   audioKick       -> the walls flash (light)
 *
 * Knobs: bouncesP (the most bounces), tableP (the first table), photoP (photo share), hueP.
//@params bouncesP tableP photoP
//@audio audioKick audioPhrasePos audioSectionId audioSectionAge
//@body
/**  Where a ray from a point in a direction lands after a number of bounces, in a stadium (straight sides of
 * length 2, round ends of radius 1) or a Sinai table (a 2 x 2 square with a round obstacle of radius 0.55).
 *
 * @param x      The start. (in)
 * @param d      The direction (unit). (in)
 * @param sinai  True for the Sinai table. (in)
 * @param nb     The number of bounces (fractional: the last leg partly travelled). (in)
 *
 * @return
 *   The point reached (xy) and the direction's angle (z).
 **/
vec3 bounce(vec2 x, vec2 d, bool sinai, float nb)
{
    for (int i = 0; i < 14; ++i) {
        float left = nb - float(i);
        if (left <= 0.0) break;
        // the distance to the next wall and its normal
        float tw = 1e9;
        vec2 nw = vec2(0.0);
        if (sinai) {
            if (d.x > 1e-6) { float t = (1.0 - x.x) / d.x; if (t < tw) { tw = t; nw = vec2(-1.0, 0.0); } }
            if (d.x < -1e-6) { float t = (-1.0 - x.x) / d.x; if (t < tw) { tw = t; nw = vec2(1.0, 0.0); } }
            if (d.y > 1e-6) { float t = (1.0 - x.y) / d.y; if (t < tw) { tw = t; nw = vec2(0.0, -1.0); } }
            if (d.y < -1e-6) { float t = (-1.0 - x.y) / d.y; if (t < tw) { tw = t; nw = vec2(0.0, 1.0); } }
            float bq = dot(x, d), cq = dot(x, x) - 0.3025, disc = bq * bq - cq;
            if (disc > 0.0) {
                float t = -bq - sqrt(disc);
                if (t > 1e-4 && t < tw) { tw = t; nw = normalize(x + d * t); }
            }
        } else {
            if (d.y > 1e-6) { float t = (1.0 - x.y) / d.y; vec2 h = x + d * t; if (abs(h.x) <= 1.0 && t < tw) { tw = t; nw = vec2(0.0, -1.0); } }
            if (d.y < -1e-6) { float t = (-1.0 - x.y) / d.y; vec2 h = x + d * t; if (abs(h.x) <= 1.0 && t < tw) { tw = t; nw = vec2(0.0, 1.0); } }
            for (int s = 0; s < 2; ++s) {
                vec2 cen = vec2(s == 0 ? 1.0 : -1.0, 0.0);
                vec2 o = x - cen;
                float bq = dot(o, d), cq = dot(o, o) - 1.0, disc = bq * bq - cq;
                if (disc > 0.0) {
                    float t = -bq + sqrt(disc);                 // from inside: the far intersection
                    vec2 h = x + d * t;
                    if (t > 1e-4 && t < tw && (s == 0 ? h.x >= 1.0 : h.x <= -1.0)) { tw = t; nw = -normalize(h - cen); }
                }
            }
        }
        if (tw > 1e8) break;
        if (left < 1.0) { x += d * tw * left; break; }
        x += d * tw;
        d = reflect(d, nw);
        x += d * 1e-4;
    }
    return vec3(x, atan(d.y, d.x));
}

void main()
{
    vec2 p = screenP();
    // the table mirrored across the frame: the stadium's box is 4 x 2, the Sinai square 2 x 2
    float prog = audioPhrasePos > 0.001 ? audioPhrasePos : fract(sceneTime / 16.0);
    float nb = (2.0 + 10.0 * clamp(bouncesP, 0.0, 1.0)) * sin(3.14159265 * prog);
    float ang = 0.15 * audioPhase + 0.05 * sceneTime;
    vec2 d = vec2(cos(ang), sin(ang));
    float k = floor(clamp(tableP, 0.0, 0.999) * 2.0) + max(audioSectionId, 0.0);
    bool now = mod(k, 2.0) > 0.5, before = !now;
    float m = audioSectionId < 0.5 ? 1.0 : smoothstep(0.0, 4.0, audioSectionAge);
    vec3 col = vec3(0.0);
    for (int pass = 0; pass < 2; ++pass) {
        bool sinai = pass == 0 ? now : before;
        float w = pass == 0 ? m : 1.0 - m;
        if (w < 0.001) continue;
        vec2 box = sinai ? vec2(1.0, 1.0) : vec2(2.0, 1.0);
        vec2 q = p * 2.2;
        vec2 x = box - abs(mod(q + box, 4.0 * box) - 2.0 * box);  // mirror-tiled table coordinates
        x = clamp(x, -box * 0.999, box * 0.999);
        bool inside = sinai ? dot(x, x) > 0.3025 : (abs(x.x) <= 1.0 || length(vec2(abs(x.x) - 1.0, x.y)) < 1.0);
        vec3 c;
        if (!inside) {
            c = imgLod(p * 0.7 + 0.5, 1.5) * 0.3;                  // the obstacle and the corners: the photo, dimmed
        } else {
            vec3 r = bounce(x, d, sinai, nb);
            vec2 uv = r.xy / box * 0.45 + 0.5;
            vec3 photo = imgLod(uv, 0.4);
            vec3 tone = imgPalette(r.z / 6.2831853 + 0.03 * audioPhase);
            c = mix(tone * 1.1, photo, 0.45 + 0.5 * clamp(photoP, 0.0, 1.0));
            // the walls
            float wall = sinai ? min(min(1.0 - abs(x.x), 1.0 - abs(x.y)), length(x) - 0.55)
                               : (abs(x.x) <= 1.0 ? 1.0 - abs(x.y) : 1.0 - length(vec2(abs(x.x) - 1.0, x.y)));
            c += mix(tone, vec3(1.0), 0.5) * exp(-wall * wall * 6000.0) * (0.3 + 0.6 * clamp(audioKick, 0.0, 1.0));
        }
        col += w * c;
    }
    finish(col);
}
