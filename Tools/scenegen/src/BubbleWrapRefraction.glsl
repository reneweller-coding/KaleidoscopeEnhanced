//@doc
 * @brief BUBBLE WRAP REFRACTION: bubble wrap over the photo: every bubble a lens that bends the picture in a dome; some bubbles go flat and swell up again, softly, as a skin
 * collapsing and refilling; a small gloss sits on each dome.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell      -> the bubbles' size and how many are full
 *   audioAdvance    -> the bubbles swell and collapse in turn (integrated, soft)
 *
 * Knobs: cellsP (how many bubbles), hueP.
//@params cellsP
//@audio audioSwell
//@body
void main()
{
    vec2 p = screenP();
    vec2 uv = p * 0.8 + 0.5;
    float t = sceneTime * 0.1 + 0.8 * audioAdvance;
    float N = 7.0 + 9.0 * clamp(cellsP, 0.0, 1.0);
    vec2 q = p * N;
    vec2 r = vec2(1.0, 1.7320508);
    vec2 h = r * 0.5;
    vec2 a = mod(q, r) - h;
    vec2 b = mod(q - h, r) - h;
    vec2 gv = dot(a, a) < dot(b, b) ? a : b;
    vec2 cid = floor((q - gv) * 2.0 + 0.5);
    float full = smoothstep(0.1, 0.9, 0.5 + 0.5 * sin(0.4 * t + 6.0 * hash21(cid)) + 0.5 * (clamp(audioSwell, 0.0, 1.0) - 0.5));
    float R = 0.46;
    float rr = length(gv) / R;
    vec2 disp = -gv * (1.0 - rr * rr) * 0.5 * full * smoothstep(1.0, 0.9, rr);
    vec3 col = imgLod(uv + disp / N * 3.0, 0.5);
    float gloss = full * smoothstep(0.35, 0.0, length(gv - vec2(-0.12, 0.14))) * 0.35;
    float rim = smoothstep(0.82, 1.0, rr) * smoothstep(1.05, 0.95, rr) * 0.25;
    col = col * (1.0 - rim * (0.5 + 0.5 * full)) + gloss;
    finish(col * 1.05);
}
