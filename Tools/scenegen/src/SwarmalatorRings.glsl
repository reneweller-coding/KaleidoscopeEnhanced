//@doc
 * @brief SWARMALATOR RINGS: swarmalators -- oscillators that swarm, whose place and phase pull on each other (O'Keeffe,
 * Ha and Strogatz): like phases attract or repel in space, near neighbours pull each other's phases together or
 * apart.  As the two couplings change, the swarm passes through its states: a still ring whose phase runs round it,
 * a ring that splinters into clusters, an active ring that churns, a phase wave, a clump in sync.  144 swarmalators
 * on the state pass, drawn as round beads coloured by their phase.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell      -> J, how much like phases attract in space
 *   audioHarmAdvance -> K, the phase coupling: each change of harmony moves it (gliding; it also drifts slowly)
 *   audioKick       -> the beads flash (light)
 *
 * Knobs: spreadP (the swarm's size on screen), beadP (the beads' size), photoP (photo share), hueP.
//@params spreadP beadP photoP
//@audio audioSwell audioKick audioHarmAdvance
//@state 12 12 60
//@body
/**  One swarmalator step (the state pass): the place moves by the others' attraction (shaped by phase) and
 * repulsion; the phase by its own frequency and the others' pull, weighted by distance.
 *
 * @return
 *   The place (xy), the phase (z), its own frequency (w).
 **/
vec4 stateStep()
{
    ivec2 ip = stCell();
    if (stateFrame < 0.5) {
        float a = 6.2831853 * stRand(0), r = sqrt(stRand(1)) * 1.2;
        return vec4(r * cos(a), r * sin(a), 6.2831853 * stRand(2), 0.2 * (stRand(3) - 0.5));
    }
    vec4 me = stAt(ip);
    float J = 0.1 + 0.9 * clamp(audioSwell, 0.0, 1.0);
    float h = max(audioHarmAdvance, 0.0);
    float hs = floor(h) + smoothstep(0.2, 0.8, fract(h));
    float K = -1.0 + 1.4 * (0.5 + 0.5 * sin(1.3 * hs + 0.05 * sceneTime));
    vec2 dx = vec2(0.0);
    float dth = 0.0;
    for (int j = 0; j < 12; ++j) for (int i = 0; i < 12; ++i) {
        if (i == ip.x && j == ip.y) continue;
        vec4 o = texelFetch(texState, ivec2(i, j), 0);
        vec2 d = o.xy - me.xy;
        float l = max(length(d), 0.02);
        dx += d / l * (1.0 + J * cos(o.z - me.z)) - d / (l * l);
        dth += sin(o.z - me.z) / l;
    }
    float dt = 0.03;
    vec2 x = me.xy + dt * dx / 143.0;
    float th = me.z + dt * (me.w + K * dth / 143.0);
    return vec4(x, mod(th, 6.2831853), me.w);
}

void main()
{
    if (statePass == 1) { fragColor = stateStep(); return; }
    vec2 p = screenP();
    float sc = 0.26 + 0.12 * clamp(spreadP, 0.0, 1.0);
    float rb = 0.011 + 0.008 * clamp(beadP, 0.0, 1.0);
    vec3 col = imgLod(p * 0.3 + 0.5, 5.0) * 0.1;
    float glow = 0.0;
    vec3 glowC = vec3(0.0);
    for (int j = 0; j < 12; ++j) for (int i = 0; i < 12; ++i) {
        vec4 o = texelFetch(texState, ivec2(i, j), 0);
        vec2 c = o.xy * sc;
        float d = length(p - c);
        vec3 tone = imgPalette(o.z / 6.2831853 + 0.03 * audioPhase);
        float g = exp(-d * d / (rb * rb * 8.0));
        glow += g;
        glowC += tone * g;
        float core = smoothstep(rb, rb * 0.4, d);
        if (core > 0.001) {
            vec3 photo = imgLod(vec2(cos(o.z), sin(o.z)) * 0.3 + 0.5, 1.0);
            vec3 cb = mix(tone * 1.4, photo * 1.6, 0.35 + 0.5 * clamp(photoP, 0.0, 1.0)) * (1.0 + 0.5 * clamp(audioKick, 0.0, 1.0));
            col = mix(col, cb, core);
        }
    }
    col += glowC * 0.3;
    finish(col * 1.3);
}
