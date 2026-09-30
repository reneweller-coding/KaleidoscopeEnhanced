//@doc
 * @brief TEXTURE GLOW VINES: luminous vines creeping over the dark
 * photograph -- slender stems wind along the picture's contours, curl
 * into spiral tendrils and sprout glowing leaves in pairs, and pulses of
 * light travel along them like sap; where the vines cross the photo's
 * bright parts they glow brighter.  The vines sway slowly.  Endless,
 * mirrorable.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the sap pulses travel (integrated, jump-free)
 *   audioSpread     -> how many vines grow
 *   audioKick       -> the pulses flare (light)
 *   audioHigh       -> the leaf tips sparkle (light)
 *   audioMode       -> colour: cyan-violet in minor, green-gold in major
 *   audioSwell      -> the vines sway (slow)
 *
 * Knobs: vineP (vine density), leafP (leaves), photoP (photo visibility), hueP.
//@params vineP leafP photoP
//@audio audioSpread audioKick audioHigh audioMode audioSwell
//@body
void main()
{
    vec2 p = screenP();
    float kick = clamp(audioKick, 0.0, 1.0);
    float hi = clamp(audioHigh * 1.5, 0.0, 1.0);
    float swell = clamp(audioSwell, 0.0, 1.0);
    float mode = clamp(audioMode, 0.0, 1.0);
    vec2 uv = p * 0.7 + 0.5 + vec2(0.003, 0.002) * sceneTime;
    vec3 col = imgLod(uv, 1.0) * (0.04 + 0.12 * clamp(photoP, 0.0, 1.0));
    vec3 vc = mix(vec3(0.3, 0.8, 1.0), vec3(0.6, 1.0, 0.3), mode);
    vec3 vc2 = mix(vec3(0.8, 0.4, 1.0), vec3(1.0, 0.8, 0.3), mode);
    float T = 0.3 * sceneTime + 2.0 * audioAdvance;
    float nV = 2.0 + 2.0 * clamp(audioSpread, 0.0, 1.0) + 2.0 * clamp(vineP, 0.0, 1.0);
    for (int k = 0; k < 6; ++k) {
        float fk = float(k);
        float on = smoothstep(fk - 0.5, fk + 0.5, nV - 0.5);
        if (on <= 0.0) break;
        // A vine: an isoline of a field shaped by the photo and noise; sway with time.
        vec2 q = p * (1.2 + 0.3 * fk) + fk * 3.3;
        q += (0.05 + 0.1 * swell) * vec2(sin(0.2 * sceneTime + q.y * 2.0), cos(0.17 * sceneTime + q.x * 2.0));
        float fld = fbm3(q) + 0.35 * (luma(imgLod(uv + fk * 0.13, 4.5)) - 0.5);
        float e = 0.003;
        vec2 gq = vec2(fbm3(q + vec2(e, 0.0)) - fbm3(q), fbm3(q + vec2(0.0, e)) - fbm3(q)) / e * (1.2 + 0.3 * fk);
        float gl = length(gq) + 1e-3;
        float dpx = abs(fld - 0.5) / gl;                        // distance to the stem (screen units)
        float stem = smoothstep(0.004, 0.0012, dpx);
        // Arc-length-ish coordinate along the stem: the tangent integrated by
        // a potential orthogonal to the field.
        vec2 tang = vec2(-gq.y, gq.x) / gl;
        float along = dot(p, tang) * 12.0 + fbm3(q * 0.5) * 8.0;
        float pulse = pow(0.5 + 0.5 * sin(along * 0.8 - T + fk), 8.0);
        float bright = 0.6 + 0.8 * luma(imgLod(uv, 3.0));
        vec3 c = mix(vc, vc2, 0.5 + 0.5 * sin(fk * 1.7));
        c = mix(c, glowColour(imgLod(uv, 5.0), q, hueP * 0.159 + fk * 0.1), 0.2);
        col += c * on * (stem * (0.35 + (1.0 + 1.5 * kick) * pulse) * bright + exp(-dpx / 0.02) * 0.06 * (0.5 + pulse));
        // Leaves: paired ellipses off the stem at intervals.
        float lp = 0.2 + 0.5 * clamp(leafP, 0.0, 1.0);
        float seg = along * 0.5;
        float si = floor(seg);
        float sf = fract(seg) - 0.5;
        float side = sign(fld - 0.5);
        float has = step(hash11(si + fk * 13.0), lp);
        // Local leaf coords: along the stem (sf) and away from it (dpx).
        vec2 ll = vec2(sf * 2.0 / 0.5 * 0.05, dpx - 0.018);
        ll = rot2(0.6 * side) * ll;
        float leaf = smoothstep(1.0, 0.7, length(ll / vec2(0.035, 0.012))) * has * smoothstep(0.03, 0.0, abs(sf) * 0.1);
        float tip = pow(max(0.0, sin(sceneTime * 2.0 + si * 3.0 + fk)), 12.0);
        col += c * on * leaf * (0.35 + 0.5 * pulse + 0.8 * hi * tip);
    }
    finish(col);
}
