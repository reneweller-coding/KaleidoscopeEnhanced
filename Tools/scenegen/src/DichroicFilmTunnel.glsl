//@doc
 * @brief DICHROIC FILM TUNNEL: the tunnel's wall is clad in strips of dichroic film whose colour swings between two
 * complementary tones with the angle it is seen at: strips nearer the eye, seen steeply, show one tone, those far
 * down, seen at a grazing angle, the other, and the strips twist slowly so the colours run along them; with every chord
 * change the two tones trade places.  A strip's tone is a cosine of its viewing angle plus its own twist; the twist
 * runs with the integrated phase, and the harmony's advance turns the tones' order smoothly by half a cycle a chord.  A
 * sheen of reflected light runs over the film.  The two tones are the photo's colour family and its complement.
 *
 * Audio Reactivity (structure, not only light):
 *   audioPhase       -> the strips twist: the colours run along them (integrated)
 *   audioHarmAdvance -> every chord change turns the two tones' order (smoothly)
 *   audioAdvance     -> the flight (integrated)
 *   audioSwell       -> the sheen's strength
 *
 * Knobs: stripP (strips around), shiftP (how fast the colour swings with the angle), hueP.
//@params stripP shiftP
//@audio audioPhase audioHarmAdvance audioSwell
//@body
void main()
{
    vec2 p = screenP();
    float fh = famHue();
    const float R0 = 0.4;
    float r = max(length(p), 1e-3), a = atan(p.y, p.x);
    float z = R0 / r;
    float fly = 0.25 * sceneTime + 0.9 * audioAdvance;
    float Y = z + fly;
    float M = floor(10.0 + 14.0 * clamp(stripP, 0.0, 1.0));
    float s = a / 6.2831853 * M;
    float k = floor(s);
    float twist = 0.6 * sin(0.7 * Y + 0.9 * mod(k, M) + 0.05 * sceneTime + 0.6 * audioPhase);
    float view = atan(r);                                             // the angle between the ray and the wall
    float swing = 2.0 + 3.0 * clamp(shiftP, 0.0, 1.0);
    float c = 0.5 + 0.5 * cos(swing * (view + 0.4 * twist) * 3.14159265);
    float flip = 0.5 - 0.5 * cos(3.14159265 * max(audioHarmAdvance, 0.0));
    c = mix(c, 1.0 - c, flip);
    vec3 tA = famLight(fh, 0.4, 0.5), tB = famLight(fh + 3.14159265, 0.4, 0.5);
    vec3 film = mix(tA, tB, smoothstep(0.15, 0.85, c));
    float px = M / (6.2831853 * r * resolution.y);
    float seam = exp(-pow((0.5 - abs(fract(s) - 0.5)) / (1.2 * px + 0.02), 2.0));
    float sheen = pow(0.5 + 0.5 * sin(1.3 * Y - 0.6 * sceneTime + 2.0 * twist), 12.0) * (0.4 + 0.8 * clamp(audioSwell, 0.0, 1.0));
    float detail = 1.0 - smoothstep(0.1, 0.3, px);
    vec3 col = film * (0.45 + 0.35 * cos(twist)) + vec3(luma(film)) * sheen * 0.8;
    col *= 1.0 - 0.6 * seam * detail;
    col = mix(col, mix(tA, tB, 0.5) * 0.3, smoothstep(6.0, 18.0, z));
    col *= 0.9;
    col += famLight(fh, 0.5, 0.7) * exp(-r * 9.0) * 0.3;
    finish(col);
}
