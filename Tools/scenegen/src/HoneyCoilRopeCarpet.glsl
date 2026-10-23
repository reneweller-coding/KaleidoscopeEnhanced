//@doc
 * @brief HONEY COIL ROPE CARPET: the honey rope: a thread that falls on a surface coils up into spirals; the picture is a carpet of spirals whose turns change with the height of fall, and the photo sets colour and gloss.  Every cell holds a coil of thick rope (shaded like a cylinder and glossy), the number of
 * turns and the radius follow the fall height, and the coils turn slowly.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell   -> the height of the fall (more turns, wider coils)
 *   audioAdvance -> the coils turn (integrated)
 *
 * Knobs: sizeP (the size of the cells), hueP.
//@params sizeP
//@audio audioSwell audioAdvance
//@body
void main()
{
    vec2 p = screenP();
    float S = 0.2 + 0.14 * clamp(sizeP, 0.0, 1.0);
    vec2 q = p / S;
    vec2 ci = floor(q + 0.5);
    vec2 gv = q - ci;
    float r = length(gv);
    float th = atan(gv.y, gv.x);
    float hnd = mod(ci.x + ci.y, 2.0) < 0.5 ? 1.0 : -1.0;
    float turns = 2.0 + 3.0 * (0.4 + 0.6 * clamp(audioSwell, 0.0, 1.0));
    float s = r * turns * 1.2 - hnd * th / 6.2831853 - hnd * (0.015 * audioAdvance + 0.03 * sceneTime);
    float v = abs(fract(s) - 0.5) * 2.0;
    float rope = 1.0 - smoothstep(0.7, 0.92, v);
    float cyl = sqrt(max(1.0 - v * v / 0.55, 0.0));
    vec3 c = imgLod((ci * S + gv * S) * 0.85 + 0.5, 1.0);
    c = mix(vec3(luma(c)), c, 1.3);
    vec3 honey = mix(vec3(0.95, 0.65, 0.15), c * 1.3, 0.45);
    float spec = pow(max(0.0, 1.0 - abs(v - 0.0) * 2.5), 3.0) * 0.5;
    float inside = smoothstep(0.58, 0.5, r);
    vec3 col = honey * (0.45 + 0.7 * cyl) * rope + spec * rope * vec3(1.0, 0.95, 0.8);
    vec3 bg = imgLod(p * 0.85 + 0.5, 2.0) * 0.2;
    finish(mix(bg, col * 1.15, rope * inside));
}
