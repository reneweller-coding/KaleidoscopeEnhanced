//@doc
 * @brief ROTATING SNAKES PHOTO: Kitaoka's rotating snakes: rings of four tone steps -- dark, a dark middle tone, light, a light middle tone -- repeating round each ring, in a staggered lattice of rings that fills the whole picture;
 * out of the corner of the eye every ring seems to turn, though it is still.  The four tones are taken from the photo at each place (its own colour, darkened, lightened).  The order of the steps creeps round the rings with the
 * phase of the music, the contrast of the steps grows and fades with the swell.
 *
 * Audio Reactivity (structure, not only light):
 *   audioPhase      -> the steps creep round the rings (integrated, continuous)
 *   audioSwell      -> the contrast between the tone steps
 *
 * Knobs: sizeP (the size of the ring groups), hueP.
//@params sizeP
//@audio audioSwell
//@body
void main()
{
    vec2 p = screenP();
    float s = 0.4 - 0.16 * clamp(sizeP, 0.0, 1.0);
    vec2 g = p / s;
    float row = floor(g.y + 0.5);
    float xo = mod(row, 2.0) * 0.5;
    vec2 cell = vec2(floor(g.x + xo + 0.5) - xo, row);
    vec2 d = p - cell * s;
    float r = length(d), a = atan(d.y, d.x);
    float rw = s * 0.085;
    float j = floor(r / rw);
    float u = (a / 6.2831853 + 0.5) * 32.0 + 0.6 * audioPhase + 0.4 * j;
    float k = mod(floor(u), 4.0);
    vec3 c = imgLod(p * 0.8 + 0.5, 1.2);
    float sw = clamp(audioSwell, 0.0, 1.0);
    vec3 tone = k < 0.5 ? c * (0.22 - 0.1 * sw) : (k < 1.5 ? c * 0.62 : (k < 2.5 ? mix(c, vec3(1.0), 0.5 + 0.2 * sw) : c * 1.05));
    float inside = smoothstep(0.5 * s * 0.96, 0.5 * s * 0.96 - 0.012, r);
    vec3 bg = imgLod(p * 0.8 + 0.5, 4.0) * 0.8;
    finish(mix(bg, tone, inside));
}
