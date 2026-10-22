//@doc
 * @brief BOTTLE WALL TUNNEL: a tunnel walled with stacked glass bottles, their round bottoms facing in, coloured light
 * shining through them: a light circles round outside with the music's phase, and with every beat a quarter of the
 * bottles flares and glows on after it.  The bottoms sit in a staggered packing with a whole number round; each is a
 * glass disc with the rings of its pushed-up middle, lit by the photo's colour behind it.  Every bottle belongs to one
 * of four groups; a group flares on its beat (the beats counted in a small field of the scene's own) and fades over
 * the next ones.  The glass takes the photo's colours, calmed toward one colour family.
 *
 * Audio Reactivity (structure, not only light):
 *   audioBeatPhase -> every beat a quarter of the bottles flares and glows on (beats counted)
 *   audioPhase     -> the light outside circles round (integrated)
 *   audioAdvance   -> the flight (integrated)
 *   audioSwell     -> the light's strength
 *
 * Knobs: countP (bottles round), afterP (how long they glow on), hueP.
//@params countP afterP
//@audio audioBeatPhase audioPhase audioSwell
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

/**  The photo's colour calmed toward the colour family.
 *
 * @param photo  The photo's colour. (in)
 * @param fh     The family's hue. (in)
 *
 * @return
 *   The colour.
 **/
vec3 tone(vec3 photo, float fh)
{
    float l = luma(photo);
    return mix(photo * 1.1, famCol(fh, 0.15 + 0.7 * l) * (0.25 + 1.2 * l), 0.45);
}

void main()
{
    if (statePass == 1) { fragColor = stateStep(); return; }
    vec2 p = screenP();
    float fh = famHue();
    const float R0 = 0.4;
    float r = max(length(p), 1e-3), a = atan(p.y, p.x);
    float z = R0 / r;
    float fly = 0.22 * sceneTime + 0.8 * audioAdvance;
    vec4 st = texelFetch(texState, ivec2(0, 0), 0);
    float dl = fract(clamp(audioBeatPhase, 0.0, 1.0) - st.y + 1.0);
    float beats = st.x + (dl < 0.5 ? dl : 0.0);                       // the count carried on to this frame
    float M = floor(14.0 + 10.0 * clamp(countP, 0.0, 1.0));
    float w = 6.2831853 * R0 / M;
    vec2 q = vec2(a / 6.2831853 * M, (z + fly) / (0.866 * w));
    float j = floor(q.y + 0.5);
    float off = 0.5 * mod(j, 2.0);
    float i = floor(q.x - off + 0.5);
    vec2 l = vec2(q.x - off - i, (q.y - j) * 0.866);
    float rho = length(l) / 0.46;                                     // 0 in the middle, 1 at the rim
    float px = R0 / (r * r * resolution.y) / w;
    float detail = 1.0 - smoothstep(0.1, 0.3, px);
    vec2 id = vec2(mod(i, M), j);
    vec3 glass = tone(imgLod(fract(vec2(id.x / M, id.y * 0.093)) * 0.8 + 0.1, 3.0), fh);
    float la = 0.03 * sceneTime + 0.4 * audioPhase;
    float lit = 0.25 + 0.9 * pow(max(cos(a - la), 0.0), 2.0);
    // the beat groups: each bottle flares on its group's beat and glows on after it
    float grp = floor(hash21(id) * 4.0);
    float fb = floor(beats);
    float last = fb - mod(fb - grp, 4.0);
    float age = beats - last;
    float after = 1.0 + 2.5 * clamp(afterP, 0.0, 1.0);
    float flare = smoothstep(0.0, 0.08, age) * exp(-age * 2.5 / after);
    float glow = (0.6 + 0.6 * clamp(audioSwell, 0.0, 1.0)) * (lit + 1.2 * flare);
    float punt = 0.75 + 0.25 * cos(rho * 18.0) * (1.0 - rho);         // the rings of the pushed-up middle
    float rim = exp(-pow((1.0 - rho) / (0.06 + 2.0 * px), 2.0));
    float inside = 1.0 - smoothstep(1.0 - px * 2.0, 1.0 + px * 2.0, rho);
    vec3 col = famCol(fh, 0.2) * 0.03;
    col = mix(col, glass * punt * glow * (0.5 + 0.5 * (1.0 - rho * rho)), inside);
    col += glass * rim * 0.4 * glow;
    col = mix(glass * 0.3 * (lit + 0.4), col, detail);
    col = mix(col, famCol(fh, 0.5) * 0.3, smoothstep(6.0, 18.0, z));
    col += famLight(fh, 0.5, 0.6) * exp(-r * 9.0) * 0.3;
    finish(col);
}
