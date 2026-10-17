//@doc
 * @brief ROCK-PAPER-SCISSORS SPIRALS: cyclic competition of three or four species (May-Leonard, with mobility) --
 * each species grows into empty space and is eaten by the one before it in the cycle, and the whole field
 * organises itself into rotating spirals of species chasing each other, soft and endless.  Every species shows its
 * own cut of the photo; where they meet, the colours blend.  An endless, periodic field.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSectionId  -> each new section switches between three and four species (the fourth fades in or dies out)
 *   audioPhase      -> the mobility breathes (integrated): the spirals widen and narrow
 *   audioOnset      -> a patch of one species dropped at a wandering place (new spiral cores)
 *   audioKick       -> the fronts flash (light)
 *
 * Knobs: speciesP (three or four species at first), mobilityP (the spirals' size), scaleP (the field on screen), hueP.
//@params speciesP mobilityP scaleP
//@audio audioKick audioOnset audioSectionId
//@state 320 180 240
//@body
/**  One explicit step of cyclic competition with diffusion for this cell (the state pass).
 *
 * @return
 *   The densities of the four species.
 **/
vec4 stateStep()
{
    ivec2 ip = stCell();
    if (stateFrame < 0.5) {
        vec4 a = vec4(stRand(0), stRand(1), stRand(2), stRand(3)) * 0.3;
        return a;
    }
    vec4 a = stAt(ip);
    vec4 lap = stLap9(ip);
    bool four = mod(floor(clamp(speciesP, 0.0, 0.999) * 2.0) + max(audioSectionId, 0.0), 2.0) > 0.5;
    float D = (0.06 + 0.25 * clamp(mobilityP, 0.0, 1.0)) * (1.0 + 0.3 * sin(0.2 * audioPhase));
    float rho = a.x + a.y + a.z + a.w;
    // the predator of each species is the one before it in the cycle (with three species, x is eaten by z)
    vec4 pred = four ? a.wxyz : vec4(a.z, a.x, a.y, 0.0);
    vec4 grow = a * (1.0 - rho) - 2.5 * a * pred;              // strong predation: no coexistence, spirals
    if (!four) grow.w = -0.5 * a.w;                             // the fourth dies out while only three play
    float dt = 0.1;
    vec4 a2 = a + dt * (grow + D * lap);
    // a fourth species that is let back in starts from a trace
    if (four && a.w < 0.002) a2.w = 0.002 * stRand(4);
    // an onset: a patch of one species at a place drawn every 30 steps
    float slot = floor(stateFrame / 30.0);
    vec2 at = vec2(hash11(slot * 3.1 + 0.2), hash11(slot * 1.3 + 0.7)) * stateRes;
    vec2 d = vec2(ip) - at;
    d -= stateRes * floor(d / stateRes + 0.5);
    if (mod(stateFrame, 30.0) < 1.0 && clamp(audioOnset, 0.0, 1.0) > 0.6 && length(d) < 5.0) {
        int sp = int(hash11(slot) * (four ? 4.0 : 3.0));
        a2 = vec4(0.0);
        a2[sp] = 0.8;
    }
    return clamp(a2, 0.0, 1.0);
}

void main()
{
    if (statePass == 1) { fragColor = stateStep(); return; }
    vec2 p = screenP();
    float zoom = 0.45 + 0.45 * clamp(scaleP, 0.0, 1.0);
    vec2 cc = stView(p, zoom);
    vec4 a = stLin(cc);
    vec2 uv = p * 0.7 + 0.5 + 0.004 * sceneTime * vec2(1.0, 0.4);
    // every species its own cut of the photo, tinted by its own tone
    vec3 c0 = imgLod(uv, 0.7) * mix(vec3(1.0), imgPalette(0.0 + 0.03 * audioPhase) * 1.6, 0.4);
    vec3 c1 = imgLod(vec2(1.0 - uv.y, uv.x) + 0.2, 0.7) * mix(vec3(1.0), imgPalette(0.25 + 0.03 * audioPhase) * 1.6, 0.4);
    vec3 c2 = imgLod(vec2(uv.y, 1.0 - uv.x) * 1.2 + 0.1, 0.7) * mix(vec3(1.0), imgPalette(0.5 + 0.03 * audioPhase) * 1.6, 0.4);
    vec3 c3 = imgLod(1.0 - uv * 1.1, 0.7) * mix(vec3(1.0), imgPalette(0.75 + 0.03 * audioPhase) * 1.6, 0.4);
    float tot = max(a.x + a.y + a.z + a.w, 1e-3);
    // the species told apart by brightness as well as by their cut and tone
    vec3 col = (c0 * a.x * 1.35 + c1 * a.y * 0.8 + c2 * a.z * 0.45 + c3 * a.w * 1.05) / tot * smoothstep(0.05, 0.5, tot) * 1.2;
    // fronts: where the dominant species changes fastest
    vec4 ax = stLin(cc + vec2(1.0, 0.0)), ay = stLin(cc + vec2(0.0, 1.0));
    float front = length(ax - a) + length(ay - a);
    col += mix(imgPalette(0.6 + 0.03 * audioPhase), vec3(1.0), 0.5) * smoothstep(0.05, 0.25, front)
           * (0.15 + 0.4 * clamp(audioKick, 0.0, 1.0));
    finish(col);
}
