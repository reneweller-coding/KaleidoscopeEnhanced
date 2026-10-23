//@doc
 * @brief KIKKO SHELL HEX: kikko, the tortoise-shell honeycomb: hexagons in which smaller patterns stand, and the photo lies on every comb at another scale; the combs arch slightly like plates of armour and slide slowly against one another.  Each plate is a dome lit from one side with a small hexagon
 * engraved in it, and the photo is zoomed differently in every plate.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell   -> the curvature of the plates
 *   audioAdvance -> the rows slide against one another (integrated)
 *
 * Knobs: sizeP (the size of the plates), hueP.
//@params sizeP
//@audio audioSwell audioAdvance
//@body
void main()
{
    vec2 p = screenP();
    float S = 0.1 + 0.08 * clamp(sizeP, 0.0, 1.0);
    vec2 q = p / S;
    float row = floor(q.y / 1.7320508);
    q.x += 0.6 * sin(0.7 * row + 0.03 * audioAdvance + 0.04 * sceneTime) * 0.5 + 0.02 * audioAdvance * (mod(row, 2.0) < 0.5 ? 1.0 : -1.0);
    vec2 r = vec2(1.0, 1.7320508);
    vec2 h = r * 0.5;
    vec2 a = mod(q, r) - h;
    vec2 b = mod(q - h, r) - h;
    vec2 gv = dot(a, a) < dot(b, b) ? a : b;
    vec2 id = q - gv;
    float hh = hash21(id);
    float sc = 0.6 + 1.6 * hh;
    vec3 c = imgLod(((gv * 1.6) / sc) * S * 0.9 + 0.5 + 0.05 * (hash22(id) - 0.5) + (id * S) * 0.15, 0.6);
    float hd = max(abs(gv.x) * 0.8660254 + abs(gv.y) * 0.5, abs(gv.y)) * 2.0;
    float cur = 0.4 + 0.8 * clamp(audioSwell, 0.0, 1.0);
    vec3 n = normalize(vec3(gv * 1.6 * cur, 0.9));
    float dif = 0.5 + 0.7 * max(dot(n, normalize(vec3(-0.5, 0.6, 0.7))), 0.0);
    float inner = 1.0 - smoothstep(0.0, 0.05, abs(hd - 0.55));
    float edge = smoothstep(0.98, 0.86, hd);
    vec3 col = c * dif * (0.85 + 0.35 * inner) * edge + (1.0 - edge) * vec3(0.04, 0.03, 0.02);
    finish(col * 1.15);
}
