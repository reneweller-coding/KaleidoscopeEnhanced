//@doc
 * @brief SMOKE RING GATES: a flight through a procession of smoke rings, each turning about its own core and fraying
 * as it ages; a new ring is blown into the distance at every bar, a big one at every new phrase, and the rings drift
 * toward the eye while the flight runs on through them, past a procession of fainter rings standing along the way.  A small field of the scene's own keeps the last sixteen rings
 * -- each its birth, the flight's place then, its size and its seed -- written into the next slot when the bar phase
 * wraps or a phrase begins.  A ring is a torus seen from its axis: its density falls off from the core circle, its
 * smoke is noise wound round the core (turning with the ring), its edge frays and thins with age.  The smoke is lit in
 * shades of one colour family from the photo.
 *
 * Audio Reactivity (structure, not only light):
 *   audioBarPhase  -> every bar blows a new ring into the distance
 *   audioPhrasePos -> every new phrase blows a big one
 *   audioAdvance   -> the flight through the rings (integrated)
 *   audioSwell     -> the light on the smoke
 *
 * Knobs: sizeP (the rings' size), frayP (how fast they fray), hueP.
//@params sizeP frayP
//@audio audioBarPhase audioPhrasePos audioSwell
//@state 17 1 60 32
//@body
/**  The state pass: sixteen ring slots and a seventeenth that remembers the last bar phase, the rings so far and the
 * phrase position.
 *
 * @return
 *   A ring: its birth (s), the flight's place then, its size, its seed; or the bookkeeping: last bar phase, rings so
 *   far, last phrase position, 1.
 **/
vec4 stateStep()
{
    int j = stCell().x;
    float bp = clamp(audioBarPhase, 0.0, 1.0), pp = clamp(audioPhrasePos, 0.0, 1.0);
    if (stateFrame < 0.5) return j == 16 ? vec4(bp, 0.0, pp, 1.0) : vec4(-100.0, 0.0, 0.0, 0.0);
    vec4 book = texelFetch(texState, ivec2(16, 0), 0);
    bool phrase = pp < book.z - 0.5;
    bool drop = bp < book.x - 0.5 || phrase;
    if (j == 16) return vec4(bp, drop ? mod(book.y + 1.0, 1600.0) : book.y, pp, 1.0);
    if (drop && j == int(mod(book.y, 16.0)))
        return vec4(stateFrame / 60.0, 0.25 * sceneTime + 0.9 * audioAdvance, phrase ? 1.0 : 0.6, fract(book.y * 0.618034));
    return texelFetch(texState, ivec2(j, 0), 0);
}

void main()
{
    if (statePass == 1) { fragColor = stateStep(); return; }
    vec2 p = screenP();
    float fh = famHue();
    const float F = 1.1, Z0 = 7.0, V = 0.5;
    float fly = 0.25 * sceneTime + 0.9 * audioAdvance;
    float now = (stateFrame - 1.0 + stateFrac) / 60.0;                // the newest step's time carried on
    float size = 0.65 + 0.3 * clamp(sizeP, 0.0, 1.0);
    float fray = 0.5 + 0.8 * clamp(frayP, 0.0, 1.0);
    float glow = 0.6 + 0.6 * clamp(audioSwell, 0.0, 1.0);
    vec3 col = famCol(fh, 0.4) * 0.03;
    // the procession: fainter rings standing every few steps along the way, so the way is never empty
    float k0 = floor(fly / 2.2) + 1.0;
    for (int i = 0; i < 6; ++i) {
        float k = k0 + float(i);
        float dz = k * 2.2 - fly;
        vec2 w = p * dz / F;
        float rho = length(w), d = rho - size * 0.9;
        float smoke = fbm(w / max(rho, 1e-4) * 2.5 + vec2(d * 9.0, 0.3 * sceneTime) + k * 7.0);
        float dens = exp(-pow(d / 0.07, 2.0)) * (0.4 + 0.9 * smoke);
        col += famLight(fh, 0.3 + 0.4 * fract(k * 0.618), 0.4) * dens * smoothstep(0.05, 0.6, dz) * exp(-0.12 * dz) * glow * 0.35;
    }
    for (int j = 0; j < 16; ++j) {
        vec4 rg = texelFetch(texState, ivec2(j, 0), 0);
        float age = now - rg.x;
        if (age < 0.0 || age > 40.0) continue;
        float dz = rg.y + Z0 - V * age - fly;                          // the ring's depth now
        if (dz < 0.05 || dz > 14.0) continue;
        vec2 w = p * dz / F;
        float R = size * rg.z * (1.0 + 0.04 * age);
        float th0 = 0.05 + 0.025 * age * fray;                         // the smoke spreads as it ages
        float rho = length(w);
        float d = rho - R;
        vec2 dir = w / max(rho, 1e-4);
        float spin = 1.5 * age + 6.2831853 * rg.w;
        float smoke = fbm(dir * 2.5 + vec2(d * 9.0 * cos(spin), d * 9.0 * sin(spin)) + rg.w * 11.0);
        float dens = exp(-pow(d / th0, 2.0)) * (0.4 + 0.9 * smoke) * exp(-0.06 * age * fray);
        float fade = smoothstep(0.05, 0.6, dz) * exp(-0.08 * dz) * smoothstep(0.0, 1.5, age);
        col += famLight(fh, 0.3 + 0.4 * rg.w, 0.4) * dens * fade * glow * 0.9;
    }
    col += famLight(fh, 0.5, 0.6) * exp(-length(p) * 5.0) * 0.15;
    finish(col);
}
