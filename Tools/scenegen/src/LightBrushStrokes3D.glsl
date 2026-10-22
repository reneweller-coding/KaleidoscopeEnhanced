//@doc
 * @brief LIGHT BRUSH STROKES 3D: broad strokes of light painted into empty space, sweeping arcs with bristle streaks,
 * hang around the eye while the view circles slowly round them with the music's phase; every bar paints a new stroke,
 * every phrase a big one, and the oldest fade away.  A small field of the scene's own keeps the last twelve strokes --
 * each its birth, its size and its seed -- written into the next slot when the bar phase wraps (or a phrase begins); a
 * stroke is an arc in its own tilted plane, painted out along its length over a second and a half after its birth,
 * drawn as a line through twenty-four points with a width that swells and tapers and bristles along it.  Shades of one
 * colour family from the photo.
 *
 * Audio Reactivity (structure, not only light):
 *   audioBarPhase  -> every bar paints a new stroke
 *   audioPhrasePos -> every phrase paints a big one
 *   audioPhase     -> the view circles round the strokes (integrated)
 *   audioSwell     -> the strokes' glow
 *
 * Knobs: widthP (the strokes' width), lifeP (how long they stay), hueP.
//@params widthP lifeP
//@audio audioBarPhase audioPhrasePos audioPhase audioSwell
//@state 13 1 60 32
//@body
/**  The state pass: twelve stroke slots and a thirteenth that remembers the last bar phase, the strokes so far and
 * the phrase position.
 *
 * @return
 *   A stroke: its birth (s), its size, its seed, 1; or the bookkeeping: last bar phase, strokes so far, last phrase
 *   position, 1.
 **/
vec4 stateStep()
{
    int j = stCell().x;
    float bp = clamp(audioBarPhase, 0.0, 1.0), pp = clamp(audioPhrasePos, 0.0, 1.0);
    if (stateFrame < 0.5) return j == 12 ? vec4(bp, 0.0, pp, 1.0) : vec4(-1.5 * float(12 - j), 0.6, fract(float(j) * 0.618034), 1.0);
    vec4 book = texelFetch(texState, ivec2(12, 0), 0);
    bool phrase = pp < book.z - 0.5;
    bool paint = bp < book.x - 0.5 || phrase;
    if (j == 12) return vec4(bp, paint ? mod(book.y + 1.0, 1200.0) : book.y, pp, 1.0);
    if (paint && j == int(mod(book.y, 12.0))) return vec4(stateFrame / 60.0, phrase ? 1.0 : 0.6, fract(book.y * 0.618034 + 0.1), 1.0);
    return texelFetch(texState, ivec2(j, 0), 0);
}

/**  A point of a stroke in view space.
 *
 * @param s     Along the stroke, 0..1. (in)
 * @param seed  The stroke's seed. (in)
 * @param size  The stroke's size. (in)
 * @param orb   The view's orbit. (in)
 *
 * @return
 *   The point.
 **/
vec3 strokeAt(float s, float seed, float size, float orb)
{
    vec3 c = vec3((seed - 0.5) * 2.6, (fract(seed * 7.3) - 0.5) * 1.4, (fract(seed * 3.1) - 0.5) * 1.4);
    float R = (0.6 + 0.6 * fract(seed * 11.7)) * size;
    float a0 = 6.2831853 * fract(seed * 5.9), sweep = 2.0 + 2.0 * fract(seed * 13.1);
    float an = a0 + sweep * s;
    vec3 u = normalize(vec3(cos(seed * 19.0), 0.4 * sin(seed * 23.0), sin(seed * 19.0)));
    vec3 v = normalize(cross(u, vec3(0.3, 1.0, 0.2)));
    vec3 x = c + R * (cos(an) * u + sin(an) * v);
    float co = cos(orb), so = sin(orb);
    x = vec3(co * x.x + so * x.z, x.y, -so * x.x + co * x.z);
    return x + vec3(0.0, 0.0, 2.2);
}

void main()
{
    if (statePass == 1) { fragColor = stateStep(); return; }
    vec2 p = screenP();
    float fh = famHue();
    float now = (stateFrame - 1.0 + stateFrac) / 60.0;                // the newest step's time carried on
    float orb = 0.03 * sceneTime + 0.35 * audioPhase;
    float wW = 0.03 + 0.04 * clamp(widthP, 0.0, 1.0);
    float life = 10.0 + 14.0 * clamp(lifeP, 0.0, 1.0);
    float glow = 0.6 + 0.6 * clamp(audioSwell, 0.0, 1.0);
    vec3 col = famCol(fh, 0.4) * 0.02;
    for (int j = 0; j < 12; ++j) {
        vec4 st = texelFetch(texState, ivec2(j, 0), 0);
        float age = now - st.x;
        if (age < 0.0 || age > life) continue;
        float painted = smoothstep(0.0, 1.5, age);                    // how far along it has been painted
        float fade = smoothstep(0.0, 0.2, age) * (1.0 - smoothstep(0.6 * life, life, age));
        float best = 9.0, bs = 0.0, bz = 1.0;
        vec3 prev = strokeAt(0.0, st.z, st.y, orb);
        vec2 pv = prev.xy / prev.z;
        for (int k = 1; k <= 24; ++k) {
            float s = float(k) / 24.0;
            if (s > painted + 0.04) break;
            vec3 cur = strokeAt(s, st.z, st.y, orb);
            vec2 cv = cur.xy / cur.z;
            vec2 ab = cv - pv, ap = p - pv;
            float h = clamp(dot(ap, ab) / max(dot(ab, ab), 1e-8), 0.0, 1.0);
            float d = length(ap - ab * h);
            if (d < best) { best = d; bs = (float(k - 1) + h) / 24.0; bz = mix(prev.z, cur.z, h); }
            pv = cv;
            prev = cur;
        }
        float w = wW * st.y / bz * sin(3.14159265 * clamp(bs, 0.0, 1.0)) * smoothstep(0.0, 0.05, painted - bs + 0.05);
        float across = best / max(w, 1e-4);
        float bristle = 0.6 + 0.4 * sin(across * 9.0 + st.z * 40.0) * sin(bs * 70.0 + st.z * 9.0);
        float g = exp(-pow(across, 4.0)) * bristle + 0.15 * exp(-best / (2.0 * max(w, 1e-4)));
        col += famLight(fh, 0.2 + 0.6 * st.z, 0.35 + 0.3 * (1.0 - across)) * g * fade * glow;
    }
    finish(col);
}
