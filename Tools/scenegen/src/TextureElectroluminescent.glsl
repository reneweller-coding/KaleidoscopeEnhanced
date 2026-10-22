//@doc
 * @brief TEXTURE ELECTROLUMINESCENT: the photo becomes an electroluminescent foil: its areas, cut by brightness into
 * six flat panels, light up one after another with the beats -- each panel glowing softly and fading as the next one
 * lights -- separated by thin dark gaps.  A panel is one band of the softened photo's brightness; on every beat the next
 * band takes its turn (the beats counted in a small field of the scene's own), rising softly and fading over the
 * following beats.  The foil's glow is a cool shade of one colour family, tinted by the photo.
 *
 * Audio Reactivity (structure, not only light):
 *   audioBeatPhase -> the panels light one after another, one a beat (counted)
 *   audioSwell     -> the foil's glow
 *
 * Knobs: bandP (how sharply the panels are cut), afterP (how long they glow on), hueP.
//@params bandP afterP
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
    return vec4(mod(old.x + d, 4092.0), bp, 0.0, 1.0);
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
    float soft = 3.5 - 1.5 * clamp(bandP, 0.0, 1.0);
    float l = luma(imgLod(uv, soft));
    float v = clamp(l, 0.0, 0.999) * 6.0;
    float band = floor(v);
    float e = 0.5 - abs(fract(v) - 0.5);                             // the distance to the panel's edge, in bands
    float dv = length(vec2(dFdx(v), dFdy(v)));
    float gap = smoothstep(0.5 * dv, 1.5 * dv + 0.02, e);
    // its turn: the panel's beat came this many beats ago
    float age = mod(beats - band, 6.0);
    float after = 0.8 + 2.0 * clamp(afterP, 0.0, 1.0);
    float lit = smoothstep(0.0, 0.12, age) * exp(-age / after) + 0.12;
    vec3 tint = imgLod(uv, 4.0);
    vec3 foil = mix(famLight(fh, 0.3 + 0.08 * band, 0.25), famCol(fh, 0.5) * (0.4 + luma(tint)), 0.3);
    float glow = 0.6 + 0.6 * clamp(audioSwell, 0.0, 1.0);
    vec3 col = foil * lit * gap * glow * 1.1 + famCol(fh, 0.4) * 0.02;
    finish(col);
}
