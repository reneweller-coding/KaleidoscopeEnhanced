//@doc
 * @brief TEXTURE FLUORESCENT VEINS: the photo's veins -- its dark lines and sharp edges -- fluoresce under a black
 * light, and the glow runs along them in waves, one wave a beat, from a source that wanders slowly over the picture.
 * The veins are where the softened photo turns dark between brighter sides or changes sharply (its ridges and its
 * slope); a wave reaches a place as long after its beat as the distance from the source takes, so the glow spreads over
 * the network ring by ring and fades behind (the beats counted in a small field of the scene's own).  The dim photo
 * stays visible; the glow is a shade of one colour family.
 *
 * Audio Reactivity (structure, not only light):
 *   audioBeatPhase -> a wave of glow runs along the veins every beat (counted)
 *   audioSwell     -> the glow's strength
 *
 * Knobs: veinP (how many veins glow), speedP (how fast the waves spread), hueP.
//@params veinP speedP
//@audio audioBeatPhase audioSwell
//@state 1 1 60 32
//@body
/**  The state pass: the beats counted by summing the beat phase's steps.
 *
 * @return
 *   x the beats so far, y the last beat phase, 0, 1.
 **/
vec4 stateStep()
{
    float bp = clamp(audioBeatPhase, 0.0, 1.0);
    if (stateFrame < 0.5) return vec4(0.0, bp, 0.0, 1.0);
    vec4 old = texelFetch(texState, ivec2(0, 0), 0);
    float d = fract(bp - old.y + 1.0);
    if (d > 0.5) d = 0.0;
    return vec4(mod(old.x + d, 4096.0), bp, 0.0, 1.0);
}

void main()
{
    if (statePass == 1) { fragColor = stateStep(); return; }
    vec2 p = screenP();
    float fh = famHue();
    vec4 st = texelFetch(texState, ivec2(0, 0), 0);
    float dl = fract(clamp(audioBeatPhase, 0.0, 1.0) - st.y + 1.0);
    float beats = st.x + (dl < 0.5 ? dl : 0.0);                       // the count carried on to this frame
    vec2 uv = vec2(0.5) + p * vec2(0.55, 0.95);
    float l = luma(imgLod(uv, 2.0)), lb = luma(imgLod(uv, 4.0));
    float ridge = smoothstep(0.02, 0.12, lb - l);                     // darker than its surroundings: a vein
    float slope = smoothstep(0.03, 0.12, length(vec2(dFdx(l), dFdy(l))) * resolution.y / 60.0);
    float vein = max(ridge, slope * (0.5 + 0.5 * clamp(veinP, 0.0, 1.0)));
    vec2 src = vec2(0.6 * sin(0.04 * sceneTime), 0.3 * cos(0.03 * sceneTime));
    float lam = 0.3 + 0.3 * clamp(speedP, 0.0, 1.0);                  // how far a wave spreads in a beat
    float age = fract(beats - length(p - src) / lam);                 // beats since a wave passed here
    float wave = smoothstep(0.0, 0.08, age) * exp(-age * 3.0);
    float glow = 0.6 + 0.6 * clamp(audioSwell, 0.0, 1.0);
    vec3 fl = famLight(fh, 0.55, 0.3);
    vec3 col = imgLod(uv, 1.5) * 0.12 + fl * vein * (0.12 + 1.3 * wave) * glow;
    finish(col);
}
