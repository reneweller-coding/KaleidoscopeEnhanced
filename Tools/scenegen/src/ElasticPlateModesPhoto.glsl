//@doc
 * @brief ELASTIC PLATE MODES PHOTO: the vibration modes of a plate (a Chladni figure): nodal lines on which the photo rests and antinodes where it swings; sand-bright lines mark the nodes as in Chladni's sand figures.  The mode glides
 * from one to the next with the key (the two modes crossing over, never a jump), the plate vibrates at the frequency of its mode, and the swing follows the swell of the music.
 *
 * Audio Reactivity (structure, not only light):
 *   audioHarmAdvance -> the mode glides from one to the next with the chords
 *   audioSwell      -> the swing of the plate
 *
 * Knobs: lineP (how bright the sand lines are), hueP.
//@params lineP
//@audio audioHarmAdvance audioSwell
//@body
/**  A plate mode: the product of two standing waves, with the frequency of the mode.
 *
 * @param q   The place on the plate, 0..1 each way. (in)
 * @param m   The first mode number. (in)
 * @param n   The second mode number. (in)
 * @param tt  The time. (in)
 *
 * @return
 *   The deflection.
 **/
float plateMode(vec2 q, float m, float n, float tt)
{
    float w = 0.12 * (m * m + n * n);
    return sin(3.1415927 * m * q.x) * sin(3.1415927 * n * q.y) * cos(w * tt) + sin(3.1415927 * n * q.x) * sin(3.1415927 * m * q.y) * cos(w * tt + 1.0) * 0.6;
}
void main()
{
    vec2 p = screenP();
    float asp = resolution.x / resolution.y;
    vec2 q = vec2(p.x / asp * 0.9 + 0.5, p.y * 0.9 + 0.5);
    float tt = 1.0 * sceneTime;
    float md = 0.5 + 2.5 * (0.5 + 0.5 * sin(0.45 * audioHarmAdvance));
    float mc = floor(md);
    float fr = smoothstep(0.0, 1.0, fract(md));
    float w = 0.0;
    float e = 0.01;
    float ma = 2.0 + mc, na = 3.0 + mc * 0.0 + (mod(mc, 2.0));
    float mb = 2.0 + mc + 1.0, nb = 3.0 + (mod(mc + 1.0, 2.0));
    float wa = plateMode(q, ma, na, tt), wb = plateMode(q, mb, nb, tt);
    w = mix(wa, wb, fr);
    vec2 g = vec2(mix(plateMode(q + vec2(e, 0.0), ma, na, tt), plateMode(q + vec2(e, 0.0), mb, nb, tt), fr) - w,
                  mix(plateMode(q + vec2(0.0, e), ma, na, tt), plateMode(q + vec2(0.0, e), mb, nb, tt), fr) - w) / e;
    float A = 0.08 + 0.12 * clamp(audioSwell, 0.0, 1.0);
    vec3 c = imgLod((p + A * vec2(w, w * 0.7)) * 0.8 + 0.5, 0.7);
    float lam = clamp(0.8 + 0.12 * dot(normalize(vec3(-g * 0.05, 1.0)), vec3(-0.4, 0.5, 0.8)), 0.5, 1.2);
    float node = smoothstep(0.22, 0.0, abs(w));
    finish(c * lam + node * (0.2 + 0.5 * clamp(lineP, 0.0, 1.0)) * vec3(1.0, 0.95, 0.85));
}
