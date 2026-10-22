//@doc
 * @brief TEXTURE MOSAIC DOME: looking up into a dome of mosaic: rings of small stones in the photo's colours set in
 * gold joints, gold ribs running from the crown to the windows at its base, and light falling in through the windows
 * as it wanders round with the music's phase -- the stones on the lit side sparkle; the number of ribs changes with
 * the harmony.  The dome is seen from below: the distance from the middle is the height in the dome, the angle the way
 * round; the stones sit in rings, each ring with a whole number of stones for its girth, each stone the photo's colour
 * at its middle and tilted a little its own way, so it catches the light when the light comes round.  The rib count
 * steps with the harmony's advance and is cross-faded as light.  The stones take the photo's colours, calmed toward one
 * colour family.
 *
 * Audio Reactivity (structure, not only light):
 *   audioPhase       -> the light from the windows wanders round the dome (integrated)
 *   audioHarmAdvance -> the ribs: a chord change brings more or fewer (cross-faded)
 *   audioSwell       -> the light's strength
 *
 * Knobs: stoneP (the stones' size), goldP (how much the gold shines), hueP.
//@params stoneP goldP
//@audio audioPhase audioHarmAdvance audioSwell
//@body
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

/**  The gold ribs' glow.
 *
 * @param a   The angle round. (in)
 * @param r   The distance from the crown. (in)
 * @param nr  The number of ribs. (in)
 * @param px  A pixel. (in)
 *
 * @return
 *   The glow.
 **/
float ribs(float a, float r, float nr, float px)
{
    float sec = 6.2831853 / nr;
    float d = abs(mod(a + 0.5 * sec, sec) - 0.5 * sec) * r;
    return exp(-pow(d / (0.006 + 1.5 * px), 2.0)) * smoothstep(0.08, 0.15, r);
}

void main()
{
    vec2 p = screenP();
    float fh = famHue();
    float r = length(p), a = atan(p.y, p.x);
    float S = 0.022 + 0.018 * clamp(stoneP, 0.0, 1.0);               // a stone's size
    float px = 1.0 / resolution.y;
    // the stones: rings of stones, each ring with a whole number for its girth
    float ring = floor(r / S);
    float rc = (ring + 0.5) * S;
    float nS = max(floor(6.2831853 * rc / S), 1.0);
    float sa = (a / 6.2831853 + 0.5) * nS;
    float si = floor(sa);
    vec2 l = vec2(fract(sa) - 0.5, r / S - ring - 0.5);
    float gap = 0.42 - max(abs(l.x), abs(l.y));                       // inside the stone (positive)
    float ac = (si + 0.5) / nS * 6.2831853 - 3.14159265;
    vec3 stone = tone(imgLod(vec2(0.5) + 0.42 * rc * vec2(cos(ac), sin(ac)), 2.0), fh);
    vec2 tilt = hash22(vec2(mod(si, nS), ring)) - 0.5;
    float la = 0.03 * sceneTime + 0.4 * audioPhase;
    vec2 L = vec2(cos(la), sin(la));
    float facing = dot(normalize(vec2(cos(ac), sin(ac)) + tilt * 1.4), L);
    float glow = 0.6 + 0.6 * clamp(audioSwell, 0.0, 1.0);
    float lit = (0.35 + 0.65 * max(facing, 0.0)) * glow;
    float sparkle = pow(max(facing, 0.0), 12.0) * 1.5 * glow;
    vec3 gold = famLight(fh, 0.8, 0.45) * vec3(1.0, 0.85, 0.55);
    float sw = max(1.5 * px / S, 0.02);
    vec3 col = mix(gold * (0.25 + 0.35 * clamp(goldP, 0.0, 1.0)) * lit, stone * lit + stone * sparkle * 0.6, smoothstep(-sw, sw, gap));
    // the ribs, cross-faded with the harmony
    float h = max(audioHarmAdvance, 0.0), hk = floor(h), m = smoothstep(0.3, 0.7, fract(h));
    float rb = mix(ribs(a, r, 8.0 + 4.0 * mod(hk, 3.0), px), ribs(a, r, 8.0 + 4.0 * mod(hk + 1.0, 3.0), px), m);
    col = mix(col, gold * (0.6 + 0.6 * max(dot(vec2(cos(a), sin(a)), L), 0.0)) * glow, rb);
    // the crown's medallion and the windows' light at the base
    col = mix(col, gold * 0.8 * glow, 1.0 - smoothstep(0.06, 0.06 + 2.0 * px, r));
    float win = pow(max(cos(a * 12.0), 0.0), 8.0) * smoothstep(0.75, 0.95, r);
    col += famLight(fh, 0.6, 0.7) * win * (0.3 + 0.9 * max(dot(vec2(cos(a), sin(a)), L), 0.0)) * glow;
    finish(col);
}
