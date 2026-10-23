//@doc
 * @brief PETRIFIED RING SLICE: a slice through a petrified tree trunk: annual rings, each a little irregular, coloured by the photo -- the pale early wood and the dark late wood of every year -- with cracks running out from the
 * heart and minerals that have grown into the gaps as small bright crystals.  The density of the rings follows the spectral spread; the heart drifts slowly with the music, so that the rings are never quite the same.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSpread     -> the density of the rings
 *   audioAdvance    -> the heart drifts (integrated)
 *
 * Knobs: crackP (how many cracks), hueP.
//@params crackP
//@audio audioSpread
//@body
void main()
{
    vec2 p = screenP();
    vec2 c0 = vec2(0.15 * sin(0.02 * audioAdvance + 0.01 * sceneTime), 0.08 * cos(0.017 * audioAdvance));
    vec2 d = p - c0;
    float r = length(d), a = atan(d.y, d.x);
    float irr = 1.0 + 0.1 * fbm(vec2(cos(a), sin(a)) * 1.5 + 3.0) + 0.04 * sin(3.0 * a + r * 4.0);
    float N = (12.0 + 18.0 * clamp(audioSpread, 0.0, 1.0));
    float s = r * irr * N;
    float yr = floor(s), f = fract(s);
    float early = smoothstep(0.0, 0.6, f) * smoothstep(1.0, 0.7, f);
    vec3 base = imgLod(vec2(fract(yr * 0.137), 0.4 + 0.3 * sin(yr)) * 0.8 + 0.1, 2.5);
    vec3 pc = imgLod(p * 0.8 + 0.5, 1.5);
    vec3 col = mix(base, pc, 0.45) * mix(0.45, 1.15, early);
    float cr = smoothstep(0.02 + 0.03 * clamp(crackP, 0.0, 1.0), 0.0, abs(sin(a * 4.5 + 3.0 * fbm(vec2(r * 3.0, a))) * r) - 0.0 * r) * smoothstep(0.1, 0.4, r);
    vec2 gc = p * 90.0;
    vec2 ic = floor(gc);
    float hc = hash21(ic);
    float crystal = smoothstep(0.985, 0.992, hc) * smoothstep(0.22, 0.08, length(fract(gc) - 0.2 - 0.6 * hash22(ic + 3.0)));
    col *= 1.0 - 0.75 * cr * clamp(crackP * 2.0, 0.2, 1.0);
    col += crystal * vec3(1.0, 0.95, 0.85) * 0.8;
    finish(col * 1.1);
}
