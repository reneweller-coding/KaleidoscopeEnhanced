//@doc
 * @brief ROTATING SHADOW LAMP: three perforated cylinders turn round a lamp, nested inside each other and turning
 * against each other; the light that gets through all three falls as spots and shapes on the dark walls round
 * the room, layer over layer, beating into moire patterns as the cylinders turn.  Seen from the lamp, a hole at
 * angle a and height h on a cylinder of radius r lands on the wall (radius R) at the same angle and at height
 * h R / r, so each cylinder's pattern is a grid in (angle, height r / R) that turns with its cylinder; the light is
 * the product of the three soft hole masks.  The windows take tones from the photo, calmed toward one colour family.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance       -> the cylinders turn (integrated), each at its own rate and direction
 *   audioBass/Mid/High -> the inner, middle and outer cylinder's windows brighten with their band
 *
 * Knobs: holeP (how large the holes are), countP (how many holes round each cylinder), hueP.
//@params holeP countP
//@audio audioBass audioMid audioHigh
//@body
/**  A cylinder's hole mask on the wall: soft round holes on a grid in (angle, height).
 *
 * @param a     The wall angle. (in)
 * @param y     The wall height. (in)
 * @param n     The holes round the cylinder. (in)
 * @param rr    The cylinder's radius over the wall's. (in)
 * @param turn  The cylinder's turn. (in)
 * @param hole  The holes' size (0..0.5). (in)
 * @param cid   Returns the hole's cell (for its colour). (out)
 *
 * @return
 *   How much light passes, 0..1.
 **/
float cylMask(float a, float y, float n, float rr, float turn, float hole, out vec2 cid)
{
    vec2 g = vec2((a - turn) / 6.2831853 * n, y * rr * n / 6.2831853 * 4.0);
    g.x += 0.5 * mod(floor(g.y), 2.0);
    cid = floor(g);
    vec2 f = fract(g) - 0.5;
    return smoothstep(hole, hole - 0.08, length(f));
}

void main()
{
    vec2 p = screenP();
    float fh = famHue();
    float hole = 0.3 + 0.15 * clamp(holeP, 0.0, 1.0);
    float n = floor(14.0 + 14.0 * clamp(countP, 0.0, 1.0));
    float drive = 0.04 * sceneTime + 0.2 * audioAdvance;
    // the wall seen round the lamp: angle across the screen, height up the screen (a wide panorama)
    float a = p.x * 2.6;
    float y = p.y * 2.6;
    vec2 c1, c2, c3;
    float m1 = cylMask(a, y, n, 0.35, drive, hole, c1);
    float m2 = cylMask(a, y, n + 3.0, 0.55, -0.7 * drive, hole + 0.05, c2);
    float m3 = cylMask(a, y, n + 7.0, 0.8, 0.45 * drive, hole + 0.1, c3);
    float h1 = fract(sin(dot(c1, vec2(12.9898, 78.233))) * 43758.5453);
    float h3 = fract(sin(dot(c3, vec2(12.9898, 78.233))) * 43758.5453);
    vec3 photo = imgLod(vec2(0.2 + 0.6 * h1, 0.2 + 0.6 * h3), 4.0);
    float l = luma(photo);
    vec3 tint = mix(photo * 1.3, famCol(fh, 0.15 + 0.7 * h1) * (0.5 + 0.9 * l), 0.5);
    float bands = (0.5 + 0.6 * clamp(audioBass, 0.0, 1.0)) * (0.6 + 0.5 * clamp(audioMid, 0.0, 1.0))
                  * (0.6 + 0.5 * clamp(audioHigh, 0.0, 1.0));
    // the inner cylinder makes the spots, the outer two shade them: the moire of their beats
    vec3 col = tint * m1 * (0.25 + 0.75 * m2) * (0.3 + 0.7 * m3) * bands * 2.2;
    // where only two of the three let light through, a faint halo; the lamp's falloff toward the floor and ceiling
    col += famCol(fh, 0.4) * (m1 * m2 + m2 * m3) * 0.06;
    col *= smoothstep(1.9, 0.6, abs(y));
    finish(col);
}
