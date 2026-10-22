//@doc
 * @brief TEXTURE ROSE WINDOW: a great rose window filling the picture, every pane a different piece of the photo with
 * the light behind it: an inner ring of petals and an outer ring of round lights, set in stone tracery that turns
 * slowly with the music's phase, and the number of petals changes as the harmony moves.  Each petal is a lancet in its
 * sector, each roundel a circle in the outer ring; a pane shows the photo's piece for its place, brighter where the
 * light behind it stands, which circles with the tracery.  The light falls out of the window as soft shafts.  A chord
 * change cross-fades the petal count, as light.  The glass is the photo, calmed toward one colour family.  Distinct
 * from ChromaRoseWindow, whose petals are the pitch classes.
 *
 * Audio Reactivity (structure, not only light):
 *   audioPhase       -> the tracery turns and the light behind circles (integrated)
 *   audioHarmAdvance -> the number of petals: twelve, sixteen or twenty (cross-faded)
 *   audioSwell       -> the light's strength
 *
 * Knobs: sizeP (the window's size), traceryP (the tracery's width), hueP.
//@params sizeP traceryP
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

/**  The window at a place, for one petal count.
 *
 * @param p     The place (the window's radius 1). (in)
 * @param n     The petals. (in)
 * @param turn  The tracery's turn. (in)
 * @param tw    The tracery's width. (in)
 * @param px    A pixel. (in)
 * @param fh    The family's hue. (in)
 *
 * @return
 *   rgb the glass's light, a the tracery's cover.
 **/
vec4 rose(vec2 p, float n, float turn, float tw, float px, float fh)
{
    float r = length(p), a = atan(p.y, p.x) - turn;
    float sec = 6.2831853 / n;
    float si = floor(a / sec);
    float u = (a - (si + 0.5) * sec) / (0.5 * sec);                  // across the petal, -1..1
    float x = (r - 0.18) / 0.5;                                       // along the petal, 0..1
    float halfW = 0.9 * sin(3.14159265 * clamp(x, 0.0, 1.0));
    float petal = (halfW - abs(u)) * r * 0.5 * sec;                   // inside the petal (positive)
    petal = x > 0.0 && x < 1.0 ? petal : -1.0;
    // the outer ring of roundels, one between every two petals
    float ao = a - (floor(a / sec + 0.5)) * sec;
    vec2 qc = r * vec2(cos(ao), sin(ao)) - vec2(0.84, 0.0);
    float roundel = 0.09 * (12.0 / n) * 1.6 - length(qc);
    float glass = max(petal, roundel);
    glass = max(glass, 0.15 - r);                                     // the oculus
    float ang = (si + 0.5) * sec + turn;
    vec2 piece = vec2(0.5) + 0.35 * vec2(cos(ang), sin(ang)) * min(r, 1.0) + vec2(u * 0.04, x * 0.06);
    vec3 c = tone(imgLod(piece, 1.0), fh);
    float cover = 1.0 - smoothstep(-tw - px, -tw + px, glass - tw);  // stone where not deep inside a pane
    return vec4(c, clamp(cover + step(1.0, r), 0.0, 1.0));
}

void main()
{
    vec2 p = screenP();
    float fh = famHue();
    float size = 0.95 + 0.25 * clamp(sizeP, 0.0, 1.0);
    vec2 q = p / (0.5 * size);
    float turn = 0.01 * sceneTime + 0.15 * audioPhase;
    float tw = 0.006 + 0.008 * clamp(traceryP, 0.0, 1.0);
    float px = 1.0 / (0.5 * size * resolution.y);
    float h = max(audioHarmAdvance, 0.0), hk = floor(h), m = smoothstep(0.3, 0.7, fract(h));
    vec4 gA = rose(q, 12.0 + 4.0 * mod(hk, 3.0), turn, tw, px, fh);
    vec4 gB = rose(q, 12.0 + 4.0 * mod(hk + 1.0, 3.0), turn, tw, px, fh);
    vec4 g = mix(gA, gB, m);
    float r = length(q), a = atan(q.y, q.x);
    float la = 3.0 * turn;
    float behind = (0.45 + 0.8 * pow(max(cos(a - la), 0.0), 2.0)) * (0.6 + 0.6 * clamp(audioSwell, 0.0, 1.0));
    vec3 stone = famCol(fh, 0.3) * 0.06 * (0.8 + 0.2 * noise2(q * 30.0));
    vec3 col = mix(g.rgb * behind * 1.1, stone, g.a);
    // the shafts falling out of the window
    float shaft = (0.55 + 0.45 * noise2(vec2(cos(a), sin(a)) * 9.0 + vec2(0.0, 0.05 * sceneTime))) * smoothstep(0.98, 1.05, r) * exp(-2.0 * (r - 1.0));
    col += tone(imgLod(vec2(0.5) + 0.3 * vec2(cos(a), sin(a)), 4.0), fh) * shaft * 0.5 * behind;
    finish(col);
}
