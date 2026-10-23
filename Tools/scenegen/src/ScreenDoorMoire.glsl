//@doc
 * @brief SCREEN DOOR MOIRE: two fly screens in front of the photo, turned against each other and shifted a little: the moire
 * rosettes wander across the picture, their meshes drawn as fine dark threads over the photo's own colours, the picture itself
 * a little pushed aside by the rosettes' lattice.
 *
 * Audio Reactivity (structure, not only light):
 *   audioPhase      -> the turn of the second screen (integrated)
 *   audioSpread     -> the mesh width
 *
 * Knobs: meshP (the base mesh), turnP (the base angle between the screens), hueP.
//@params meshP turnP
//@audio audioSpread
//@body
void main()
{
    vec2 p = screenP();
    vec2 uv = p * 0.8 + 0.5;
    float t = sceneTime * 0.2 + 1.5 * audioPhase;
    float N = (30.0 + 40.0 * clamp(meshP, 0.0, 1.0)) * (0.9 + 0.2 * clamp(audioSpread, 0.0, 1.0));
    float a2 = 0.04 + 0.12 * clamp(turnP, 0.0, 1.0) + 0.02 * sin(0.3 * t);
    vec2 q1 = p * N;
    vec2 q2 = rot2(a2) * p * N + 0.3 * t;
    vec2 f1 = abs(fract(q1) - 0.5), f2 = abs(fract(q2) - 0.5);
    float m1 = smoothstep(0.32, 0.46, max(f1.x, f1.y));
    float m2 = smoothstep(0.32, 0.46, max(f2.x, f2.y));
    float mesh = 1.0 - 0.65 * max(m1, m2) * (0.5 + 0.5 * max(m1, m2));
    vec2 sh = 0.004 * (vec2(sin(6.2831853 * q1.x), sin(6.2831853 * q1.y)) + vec2(sin(6.2831853 * q2.x), sin(6.2831853 * q2.y)));
    vec3 col = imgLod(uv + sh, 0.5) * mesh * 1.1;
    finish(col);
}
