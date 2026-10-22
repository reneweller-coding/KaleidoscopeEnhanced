//@doc
 * @brief COLORED SHADOWS RGB: three coloured lamps shine on a pale wall past floating shapes, and every shape throws
 * three shadows -- where one lamp is blocked the wall takes the mix of the other two, where two are blocked the third's
 * colour alone, where all three are blocked it is dark -- so coloured fringes outline everything; each lamp glows with
 * its own band of the music.  The shapes -- discs, rings and bars -- float on a plane between the lamps and the wall;
 * for every place on the wall and every lamp, the line to the lamp is followed to the shapes' plane and tested there.
 * The lamps are two shades of the photo's colour family and a warm white instead of red, green and blue; each lamp's
 * strength is its band, smoothed in a small field of the scene's own.
 *
 * Audio Reactivity (structure, not only light):
 *   audioBass/Mid/High -> each lamp's strength (smoothed)
 *   audioAdvance       -> the shapes float and turn (integrated)
 *
 * Knobs: spreadP (how far apart the lamps stand), countP (how many shapes), hueP.
//@params spreadP countP
//@audio audioBass audioMid audioHigh
//@state 1 1 60
//@body
/**  The state pass: the three bands smoothed.
 *
 * @return
 *   The smoothed bass, middle and highs, 1.
 **/
vec4 stateStep()
{
    vec3 b = clamp(vec3(audioBass, audioMid, audioHigh), 0.0, 1.0);
    vec3 old = stateFrame < 0.5 ? b : texelFetch(texState, ivec2(0, 0), 0).rgb;
    return vec4(mix(old, b, 0.05), 1.0);
}

/**  Whether the shapes block a place on their plane.
 *
 * @param q    The place on the shapes' plane. (in)
 * @param n    How many shapes. (in)
 * @param run  The floating. (in)
 *
 * @return
 *   1 where a shape covers the place (soft at its edge).
 **/
float shapes(vec2 q, float n, float run)
{
    float cover = 0.0;
    for (int k = 0; k < 8; ++k) {
        float i = float(k);
        if (i >= n) break;
        vec2 c = vec2(0.9 * sin(run * (0.3 + 0.05 * i) + 2.1 * i), 0.45 * cos(run * (0.25 + 0.04 * i) + 1.3 * i));
        vec2 d = rot2(run * 0.4 + i) * (q - c);
        float kind = mod(i, 3.0), s = 0.09 + 0.05 * hash11(i * 3.3);
        float sd = kind < 0.5 ? length(d) - s : kind < 1.5 ? abs(length(d) - s) - 0.025 : max(abs(d.x) - 1.6 * s, abs(d.y) - 0.035);
        cover = max(cover, 1.0 - smoothstep(-0.004, 0.004, sd));
    }
    return cover;
}

void main()
{
    if (statePass == 1) { fragColor = stateStep(); return; }
    vec2 p = screenP();
    float fh = famHue();
    vec3 bands = texelFetch(texState, ivec2(0, 0), 0).rgb;
    float run = 0.08 * sceneTime + 0.3 * audioAdvance;
    float n = floor(4.0 + 4.0 * clamp(countP, 0.0, 1.0));
    float spread = 0.35 + 0.35 * clamp(spreadP, 0.0, 1.0);
    const float ZS = 0.45, ZL = 1.6;                                   // the shapes' plane and the lamps, over the wall
    vec3 lampC[3];
    lampC[0] = famLight(fh, 0.15, 0.25);
    lampC[1] = famLight(fract(fh + 0.5), 0.5, 0.25);
    lampC[2] = vec3(1.0, 0.93, 0.82);
    vec3 col = vec3(0.0);
    vec2 wall = p * 1.6;
    for (int k = 0; k < 3; ++k) {
        float fk = float(k);
        vec2 L = spread * vec2(cos(2.0943951 * fk + 1.5707963), sin(2.0943951 * fk + 1.5707963));
        vec2 q = mix(wall, L, ZS / ZL);                                // where the line to the lamp crosses the shapes' plane
        float lit = 1.0 - shapes(q, n, run);
        float b = k == 0 ? bands.x : k == 1 ? bands.y : bands.z;
        col += lampC[k] * lit * (0.25 + 0.55 * b) * exp(-dot(wall - L, wall - L) * 0.15);
    }
    finish(col);
}
