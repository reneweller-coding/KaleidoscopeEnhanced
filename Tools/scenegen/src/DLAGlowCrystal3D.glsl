//@doc
 * @brief DLA GLOW CRYSTAL 3D: a crystal grown by diffusion-limited aggregation in space -- glowing particles that
 * wandered until they stuck -- branching out round the eye like a coral of light, tips still growing; when it has
 * filled the view it fades and a new one starts from the middle.  The aggregate is drawn as a branching tree of
 * dotted arms (six main arms, each splitting again and again with a twist, every branch a row of round particles);
 * its growth reveals the branches level by level, the newest particles brightest.  Two crystals overlap as one
 * fades and the next grows.  The particles' light is shades of one colour family from the photo, the inner ones
 * deeper and the tips paler.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell   -> the supply of particles: the crystal grows faster
 *   audioAdvance -> the growth clock (integrated) and the crystal's slow turn
 *
 * Knobs: armP (how many main arms), spreadP (how widely the branches fan), hueP.  Distinct from BrownianTreeRain,
 * which is flat.
//@params armP spreadP
//@audio audioSwell
//@state 1 1 60 32
//@body
/**  The state pass: a clock whose speed follows the swell, summed step by step (so its speed changes, never its
 * reading).
 *
 * @return
 *   The clock, 0, 0, 1.
 **/
vec4 stateStep()
{
    float prev = stateFrame < 0.5 ? 0.0 : texelFetch(texState, ivec2(0, 0), 0).r;
    return vec4(prev + (0.6 + 0.8 * clamp(audioSwell, 0.0, 1.0)) / 60.0, 0.0, 0.0, 1.0);
}

/**  The crystal's light at a screen point: its branches, revealed up to a growth radius.
 *
 * @param p       The screen point. (in)
 * @param seed    The crystal's seed. (in)
 * @param grow    How far it has grown (0..1.4). (in)
 * @param arms    The main arms. (in)
 * @param fan     The branches' fan angle. (in)
 * @param turn    The crystal's turn. (in)
 * @param shade   Returns the nearest particle's depth in the tree (0 trunk .. 1 tip). (out)
 *
 * @return
 *   The light.
 **/
float crystal(vec2 p, float seed, float grow, float arms, float fan, float turn, out float shade)
{
    float light = 0.0;
    shade = 0.0;
    for (int a = 0; a < 8; ++a) {
        float fa = float(a);
        if (fa >= arms) break;
        float ang = 6.2831853 * (fa + 0.3 * fract(seed * 7.0 + fa * 0.37)) / arms + turn;
        vec2 o = vec2(0.0);
        float len = 0.16;
        float dir = ang;
        // walk down one path of the binary tree per level, choosing the branch nearer the pixel
        for (int lv = 0; lv < 6; ++lv) {
            float flv = float(lv);
            vec2 e = len * vec2(cos(dir), sin(dir));
            float reach = length(o + e);
            // the particles along this branch: round dots spaced along it, shown up to the growth front
            for (int k = 0; k < 4; ++k) {
                vec2 q = o + e * (float(k) + 0.5) / 4.0;
                float rq = length(q);
                float shown = smoothstep(grow, grow - 0.05, rq);
                float fresh = exp(-(grow - rq) / 0.08) * step(rq, grow);
                float d = length(p - q);
                float g = smoothstep(0.009, 0.005, d) + 0.25 * exp(-d / 0.012);
                light += g * shown * (0.5 + 1.2 * fresh);
                if (g * shown > 0.3) shade = flv / 5.0;
            }
            o += e;
            float h = fract(sin(seed * 13.7 + fa * 7.1 + flv * 3.3 + floor(o.x * 9.0)) * 43758.5453);
            float bend = fan * (0.6 + 0.4 * h);
            // pick the child branch on the pixel's side
            vec2 rel = p - o;
            float side = sign(dot(rel, vec2(-sin(dir), cos(dir))) + 1e-4);
            dir += side * bend + 0.2 * (h - 0.5);
            len *= 0.78;
            if (reach > grow + 0.05) break;
        }
    }
    return light;
}

void main()
{
    if (statePass == 1) { fragColor = stateStep(); return; }
    float swellClock = texelFetch(texState, ivec2(0, 0), 0).r;   // seconds, run faster as the music swells
    vec2 p = screenP();
    float fh = famHue();
    float arms = floor(5.0 + 3.0 * clamp(armP, 0.0, 1.0));
    float fan = 0.35 + 0.4 * clamp(spreadP, 0.0, 1.0);
    float clock = 0.06 * swellClock + 0.1 * audioAdvance;
    float turn = 0.02 * sceneTime + 0.05 * audioAdvance;
    float cyc = floor(clock), u = clock - cyc;
    vec3 col = famCol(fh, 0.45) * 0.012;
    // the current crystal grows; the last one fades
    float sNow, sOld;
    float now = crystal(p, cyc, 1.4 * u, arms, fan, turn, sNow);
    float old = crystal(p, cyc - 1.0, 1.4, arms, fan, turn + 1.0, sOld) * (1.0 - smoothstep(0.0, 0.35, u));
    col += famLight(fh, 0.2 + 0.6 * sNow, 0.3 * sNow) * now * 0.5 + famLight(fh, 0.2 + 0.6 * sOld, 0.2) * old * 0.5;
    finish(famExpose(col, 1.85, 0.70, 0.03, fh));
}
