//@doc
 * @brief QUILLING COILS: strips of paper rolled into spirals: every cell of a grid holds a coil in the colour of the photo at that place, and
 * the coils roll up and down, their winding count swelling and falling, the tape shaded round its edge so each reads as a rolled strip.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell      -> the number of windings of every coil
 *   audioPhase      -> the coils turn (integrated)
 *
 * Knobs: cellsP (how many coils), tapeP (the tape's width), hueP.
//@params cellsP tapeP
//@audio audioSwell
//@body
void main()
{
    vec2 p = screenP();
    float t = sceneTime * 0.3 + 2.0 * audioPhase;
    float N = 6.0 + 8.0 * clamp(cellsP, 0.0, 1.0);
    vec2 q = p * N;
    vec2 cell = floor(q);
    vec2 f = fract(q) - 0.5;
    vec3 c = imgLod((cell + 0.5) / N * 0.8 + 0.5, 2.0);
    float rho = length(f) * 2.0;
    float ph = atan(f.y, f.x) / 6.2831853 + 0.5;
    float turns = 3.0 + 4.0 * clamp(audioSwell, 0.0, 1.0);
    float dir = mod(cell.x + cell.y, 2.0) < 0.5 ? 1.0 : -1.0;
    float s = rho * turns - dir * (ph + 0.12 * t);
    float tape = 0.45 + 0.4 * clamp(tapeP, 0.0, 1.0);
    float fr = fract(s);
    float strip = smoothstep(0.0, 0.08, fr) * smoothstep(tape + 0.08, tape, fr);
    float shade = sin(3.14159265 * clamp(fr / tape, 0.0, 1.0));
    float inside = smoothstep(1.0, 0.92, rho);
    vec3 paper = c * (0.55 + 0.7 * shade);
    vec3 ground = imgLod(p * 0.8 + 0.5, 4.5) * 0.35;
    vec3 col = mix(ground, paper, strip * inside);
    finish(col * 1.1);
}
