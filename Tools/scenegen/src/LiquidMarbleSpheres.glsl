//@doc
 * @brief LIQUID MARBLE SPHERES: glass marbles rolling slowly across a mirror
 * table -- each marble holds a twisted ribbon of colour inside (from the
 * photograph) that turns as the marble rolls, the glass bending and
 * flipping the view of the table and the other marbles behind it, a crisp
 * highlight and a soft reflection beneath each one.  Endless, mirrorable.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the marbles roll (integrated, jump-free)
 *   audioSpread     -> marble size
 *   audioKick       -> the highlights flash (light)
 *   audioMode       -> the table: cool steel in minor, warm brass in major
 *   audioRoughness  -> the ribbon twist
 *   audioSwell      -> the table's reflection (slow)
 *
 * Knobs: marbleP (marble density), ribbonP (ribbon width), photoP (photo colours), hueP.
//@params marbleP ribbonP photoP
//@audio audioSpread audioKick audioMode audioRoughness audioSwell
//@body
void main()
{
    vec2 p = screenP();
    float kick = clamp(audioKick, 0.0, 1.0);
    float swell = clamp(audioSwell, 0.0, 1.0);
    float mode = clamp(audioMode, 0.0, 1.0);
    float rough = clamp(audioRoughness, 0.0, 1.0);
    vec2 uv = p * 0.5 + 0.5;
    vec3 table = mix(vec3(0.25, 0.28, 0.32), vec3(0.45, 0.33, 0.18), mode);
    table = mix(table, table * (0.6 + 0.6 * imgLod(uv, 4.0)), 0.3 + 0.3 * swell);
    vec3 col = table;
    float S = 2.2 + 2.0 * clamp(marbleP, 0.0, 1.0);
    float T = 0.1 * sceneTime + 0.7 * audioAdvance;
    vec2 g = p * S;
    vec2 gi = floor(g);
    for (int j = -1; j <= 1; ++j) for (int i = -1; i <= 1; ++i) {
        vec2 id = gi + vec2(i, j);
        float h = hash21(id);
        if (h > 0.6) continue;
        vec2 dir = normalize(hash22(id + 3.0) - 0.5 + 1e-3);
        float roll = T * (0.5 + 0.5 * h);
        vec2 c = id + 0.5 + 0.3 * dir * sin(roll);             // rolls back and forth within its cell
        float R = (0.26 + 0.1 * clamp(audioSpread, 0.0, 1.0)) * (0.7 + 0.4 * hash21(id + 5.0));
        vec2 d = (g - c) / R;
        float r = length(d);
        // Soft contact shadow / reflection beneath.
        col *= 1.0 - 0.35 * smoothstep(1.4, 0.9, length(d - vec2(0.15, -0.25)));
        if (r > 1.0) continue;
        vec3 n = vec3(d, sqrt(max(0.0, 1.0 - r * r)));
        // Inside: refraction flips and magnifies the table behind.
        vec2 refr = uv - d * R / S * 0.8;
        vec3 behind = mix(table, table * (0.6 + 0.6 * imgLod(refr, 3.0)), 0.5) * 1.2;
        // The coloured ribbon: a twisted band in the marble's rotating frame.
        vec3 v = n;
        float ang = roll * 3.0 * (0.5 + h);
        v.xz = rot2(ang * dir.x) * v.xz;
        v.yz = rot2(ang * dir.y) * v.yz;
        float twist = (1.0 + 2.0 * rough) * v.y;
        float band = abs(sin(atan(v.z, v.x) * 2.0 + twist * 3.0)) ;
        float rw = 0.15 + 0.3 * clamp(ribbonP, 0.0, 1.0);
        float ribbon = smoothstep(rw, rw * 0.6, band) * smoothstep(0.0, 0.4, 1.0 - abs(v.y));
        vec3 rc = mix(hsv2rgb(vec3(fract(h * 3.0 + hueP * 0.159), 0.8, 0.95)), glowColour(imgLod(hash22(id), 3.0), id, hueP * 0.159), clamp(photoP, 0.0, 1.0) * 0.7);
        vec3 m = mix(behind, rc, ribbon * 0.85);
        // Glass: fresnel edge, highlight.
        float fres = pow(1.0 - n.z, 3.0);
        m = mix(m, table * 1.5 + 0.1, fres * 0.6);
        m += vec3(1.0) * pow(max(dot(n, normalize(vec3(-0.4, 0.5, 0.8))), 0.0), 60.0) * (0.8 + 1.5 * kick);
        float edge = smoothstep(1.0, 0.95, r);
        col = mix(col, m, edge);
    }
    finish(col);
}
