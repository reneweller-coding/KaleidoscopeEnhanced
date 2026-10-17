//@doc
 * @brief FOREST FIRE CRITICALITY: the Drossel-Schwabl forest -- trees grow on empty ground, lightning now and then
 * sets one alight, and fire spreads to every neighbouring tree.  The forest organises itself to the edge of
 * criticality: clusters of every size, burnt out by fronts of every length, regrowing in patches.  The photo is the
 * forest; the fronts glow, the ash smoulders.  An endless, periodic field (a torus).
 *
 * Audio Reactivity (structure, not only light):
 *   audioOnset      -> lightning: a strike at a random place (structure)
 *   audioLevel      -> the growth rate (loud music regrows the forest faster)
 *   audioPhase      -> the palette turns through the photo (integrated)
 *   audioKick       -> the fire flares (light)
 *
 * Knobs: growP (the growth rate's base), sparkP (how often lightning strikes by itself), scaleP (cell size), hueP.
//@params growP sparkP scaleP
//@audio audioOnset audioKick
//@state 480 270 30
//@body
/**  One step of the forest for this cell (the state pass).
 *
 * @return
 *   State (0 ground, 1 tree, 2 fire), fire glow, the tree (0 none, 0.3 a sapling .. 1 old), ash 0..1.
 **/
vec4 stateStep()
{
    ivec2 ip = stCell();
    if (stateFrame < 0.5) {
        bool t = stRand(0) < 0.55;
        return vec4(t ? 1.0 : 0.0, 0.0, t ? 0.3 + 0.7 * stRand(1) : 0.0, 0.0);
    }
    vec4 c = stAt(ip);
    float s = c.r, s2 = s;
    if (s > 1.5) s2 = 0.0;                                     // burnt out
    else if (s > 0.5) {
        bool burn = false;
        for (int j = 0; j < 4; ++j) {
            ivec2 d = j == 0 ? ivec2(1, 0) : j == 1 ? ivec2(-1, 0) : j == 2 ? ivec2(0, 1) : ivec2(0, -1);
            if (stAt(ip + d).r > 1.5) burn = true;
        }
        float strike = 2.0e-7 + 3.0e-6 * clamp(sparkP, 0.0, 1.0);
        if (stRand(2) < strike) burn = true;
        // an onset: lightning at a place drawn every 10 steps
        float slot = floor(stateFrame / 10.0);
        ivec2 at = ivec2(vec2(hash11(slot * 4.13 + 0.2), hash11(slot * 1.77 + 0.8)) * stateRes);
        if (mod(stateFrame, 10.0) < 1.0 && clamp(audioOnset, 0.0, 1.0) > 0.6 && ip == at) burn = true;
        if (burn) s2 = 2.0;
    } else {
        float grow = (0.002 + 0.01 * clamp(growP, 0.0, 1.0)) * (0.4 + 1.2 * clamp(audioLevel, 0.0, 1.0));
        if (stRand(3) < grow) s2 = 1.0;
    }
    float glow = s2 > 1.5 ? 1.0 : c.g * 0.75;
    float age = s2 > 0.5 && s2 < 1.5 ? (s > 0.5 ? min(c.b + 0.003, 1.0) : 0.3) : 0.0;
    float ash = s2 > 1.5 ? 1.0 : c.a * 0.985;
    return vec4(s2, glow, age, ash);
}

void main()
{
    if (statePass == 1) { fragColor = stateStep(); return; }
    vec2 p = screenP();
    float zoom = 0.5 + 0.45 * clamp(scaleP, 0.0, 1.0);
    vec2 cc = stView(p + 0.02 * vec2(sin(0.021 * sceneTime), cos(0.026 * sceneTime)), zoom);
    vec4 s = stLin(cc);
    float tree = smoothstep(0.1, 0.3, s.b);                     // a tree where the filtered tree channel holds
    vec2 uv = cc / stateRes.y * 0.6;
    vec3 photo = imgLod(uv, 0.7);
    vec3 forest = photo * (0.2 + 1.0 * s.b);                   // the old trees fully lit, saplings dimmer
    vec3 fire = mix(imgPalette(0.05 + 0.03 * audioPhase), vec3(1.0, 0.75, 0.4), 0.55);
    vec3 col = mix(photo * 0.05, forest, tree);
    col += vec3(0.12, 0.08, 0.06) * s.a * (1.0 - tree);         // smouldering ash
    col += fire * s.g * (1.3 + 0.9 * clamp(audioKick, 0.0, 1.0));
    finish(col);
}
