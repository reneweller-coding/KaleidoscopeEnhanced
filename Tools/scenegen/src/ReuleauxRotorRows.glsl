//@doc
 * @brief REULEAUX ROTOR ROWS: Reuleaux triangles (curves of constant width) turning in rows of square chambers as in the Wankel engine, brushing almost every corner of the chamber as they go; each rotor carries a piece of the photo that
 * turns with it, its centre wandering a little as it rolls.  The rotors turn with the drive of the music, each row's phase a little behind the one above.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the rotation of the rotors (integrated), each row a little later
 *   audioSwell      -> the light on the rotors
 *
 * Knobs: sizeP (the size of the chambers), hueP.
//@params sizeP
//@audio audioSwell
//@body
void main()
{
    vec2 p = screenP();
    float w = 0.42 - 0.16 * clamp(sizeP, 0.0, 1.0);
    vec2 cell = floor(p / w + 0.5);
    vec2 d = p - cell * w;
    float th = 0.35 * audioAdvance + 0.12 * sceneTime + 0.8 * cell.y + 0.3 * cell.x;
    vec2 cen = 0.07 * w * vec2(cos(3.0 * th + 1.0), sin(3.0 * th + 1.0)) * 0.0 + 0.045 * w * vec2(cos(3.0 * th), sin(3.0 * th));
    float R = w / sqrt(3.0);
    float ok = 1.0;
    float mind = 0.0;
    for (int k = 0; k < 3; ++k) {
        float a = th + 2.0943951 * float(k);
        vec2 V = cen + R * vec2(cos(a), sin(a));
        float dk = length(d - V) - w * 0.98;
        mind = max(mind, dk);
    }
    float rotor = smoothstep(0.012, -0.012, mind);
    float chamber = smoothstep(0.012, 0.0, max(abs(d.x), abs(d.y)) - 0.5 * w);
    vec2 uv = rot2(-th) * (d - cen) / w * 0.8 + 0.5 + 0.1 * vec2(sin(cell.x), cos(cell.y));
    vec3 c = imgLod(uv, 0.8);
    vec3 bg = vec3(0.05) + 0.1 * imgLod(p * 0.8 + 0.5, 4.0);
    vec3 col = mix(bg, c * (0.85 + 0.3 * clamp(audioSwell, 0.0, 1.0)), rotor * chamber);
    float frame = smoothstep(0.012, 0.0, abs(max(abs(d.x), abs(d.y)) - 0.5 * w));
    finish((col + 0.35 * frame) * 1.1);
}
