//@doc
 * @brief KILIM STEP EDGES: the stepped edges of a kilim: the photo drawn in 45-degree steps of yarn, colour by colour with interlocking
 * teeth, in five yarn colours taken from the photo itself.  Every step is a diamond of yarn; where two colours meet the edge climbs in
 * stairs.  The step width follows the spectrum's width and the interlocking teeth the music's phase.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSpread     -> the width of the steps (finer yarn as the spectrum widens)
 *   audioPhase      -> the teeth between the colours shift (integrated)
 *
 * Knobs: stepP (the base step width), toothP (how strongly the colours interlock), hueP.
//@params stepP toothP
//@audio audioSpread
//@body
void main()
{
    vec2 p = screenP();
    vec2 uv0 = p * 0.8 + 0.5;
    float t = sceneTime * 0.1 + 0.8 * audioPhase;
    float N = 26.0 + 30.0 * (1.0 - clamp(stepP, 0.0, 1.0)) * (1.0 - 0.3 * clamp(audioSpread, 0.0, 1.0));
    vec2 q = rot2(0.7853982) * p * N;
    vec2 cell = floor(q);
    vec2 f = fract(q) - 0.5;
    float teeth = (0.1 + 0.3 * clamp(toothP, 0.0, 1.0)) * sin(1.7 * cell.x + 2.3 * cell.y + t);
    vec2 cc = (cell + 0.5 + teeth * 0.5);
    vec2 cp = rot2(-0.7853982) * (cc / N);
    vec3 c = imgLod(cp * 0.8 + 0.5, 2.0);
    vec3 pal[5];
    pal[0] = imgLod(vec2(0.2, 0.25), 5.0);
    pal[1] = imgLod(vec2(0.78, 0.22), 5.0);
    pal[2] = imgLod(vec2(0.5, 0.5), 5.0);
    pal[3] = imgLod(vec2(0.22, 0.78), 5.0);
    pal[4] = imgLod(vec2(0.8, 0.8), 5.0);
    float best = 9.0;
    vec3 yarn = c;
    for (int i = 0; i < 5; ++i) {
        float d = dot(c - pal[i], c - pal[i]);
        if (d < best) { best = d; yarn = pal[i]; }
    }
    yarn = mix(yarn, c, 0.35);
    float stp = smoothstep(0.5, 0.36, max(abs(f.x), abs(f.y)));
    vec3 col = yarn * (0.7 + 0.5 * stp) * (0.85 + 0.15 * cos(6.2831853 * f.x) * cos(6.2831853 * f.y));
    finish(col * 1.1);
}
