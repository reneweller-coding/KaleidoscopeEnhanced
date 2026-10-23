//@doc
 * @brief DRUM LANE MIP LAYERS: the drum lanes are scales: the bass drum moves the coarsest level of the photo, the snare the middle one, the hi-hat the finest, each with a phase of its own that runs on with the lane's own
 * smoothed energy (integrated in a small field of the scene's own), so the three levels of detail drift against each other like three separate transparencies: broad fields of colour, edges, and grain, each sliding its own way.
 *
 * Audio Reactivity (structure, not only light):
 *   audioKick/Snare/Hat -> the speed of the coarse, middle and fine level (integrated, never a jump)
 *   audioSwell      -> how strongly the detail levels are added
 *
 * Knobs: gainP (how strongly the detail levels show), hueP.
//@params gainP
//@audio audioKick audioSnare audioHat audioSwell
//@state 3 1 30 32
//@body
/**  The state pass: for each lane the smoothed energy (y) and its running integral (x).
 *
 * @return
 *   x the lane's phase, y the lane's smoothed energy, 0, 1.
 **/
vec4 stateStep()
{
    ivec2 c = stCell();
    vec4 old = stateFrame < 0.5 ? vec4(0.0) : texelFetch(texState, c, 0);
    float e = c.x == 0 ? audioKick : (c.x == 1 ? audioSnare : audioHat);
    float sm = old.y + (clamp(e, 0.0, 1.0) - old.y) * 0.06;
    return vec4(mod(old.x + sm / 30.0, 1000.0), sm, 0.0, 1.0);
}
/**  A detail band of the photo, shifted.
 *
 * @param uv   The place. (in)
 * @param lod  The band's lower level; the band is this level minus the one two levels coarser. (in)
 *
 * @return
 *   The band (signed colour).
 **/
vec3 mipBand(vec2 uv, float lod) { return imgLod(uv, lod) - imgLod(uv, lod + 2.0); }
void main()
{
    if (statePass == 1) { fragColor = stateStep(); return; }
    vec2 p = screenP();
    vec2 uv = p * 0.8 + 0.5;
    vec4 s0 = texelFetch(texState, ivec2(0, 0), 0), s1 = texelFetch(texState, ivec2(1, 0), 0), s2 = texelFetch(texState, ivec2(2, 0), 0);
    float t = sceneTime;
    vec2 sh0 = vec2(cos(0.6), sin(0.6)) * (s0.x * 0.3 + 0.012 * t);
    vec2 sh1 = vec2(cos(2.1), sin(2.1)) * (s1.x * 0.3 + 0.018 * t);
    vec2 sh2 = vec2(cos(3.9), sin(3.9)) * (s2.x * 0.3 + 0.026 * t);
    float g = 0.4 + 0.5 * clamp(gainP, 0.0, 1.0) + 0.3 * clamp(audioSwell, 0.0, 1.0);
    vec3 col = imgLod(uv + sh0, 5.0) * 1.05;
    col += mipBand(uv + sh1, 2.2) * g * (0.8 + 0.8 * s1.y);
    col += mipBand(uv + sh2, 0.3) * g * (0.9 + 0.8 * s2.y);
    finish(max(col, 0.0) * (0.95 + 0.4 * s0.y));
}
