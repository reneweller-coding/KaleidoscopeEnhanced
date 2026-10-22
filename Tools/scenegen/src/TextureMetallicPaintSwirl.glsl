//@doc
 * @brief TEXTURE METALLIC PAINT SWIRL: metallic paint stirred in a pot: the photo's colours marbled into swirls that
 * keep turning with the music's drive, full of tiny metal flakes that flash as they catch the light; with every chord
 * change the flakes tilt another way and a new pattern of sparkle runs through the paint.  The swirl is the photo read
 * through a turning, twisting warp -- two short carried layers cross-faded, so it never stretches without end; the
 * flakes are a fine grid of tiny tilted mirrors, each flashing where its tilt meets the light; a chord change
 * cross-fades to another set of tilts.  The colours are the photo's, calmed toward one colour family.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance     -> the paint turns and swirls (integrated)
 *   audioHarmAdvance -> the flakes tilt anew with every chord change (cross-faded)
 *   audioSwell       -> the flakes' flash
 *
 * Knobs: swirlP (how strongly the paint swirls), flakeP (how many flakes flash), hueP.
//@params swirlP flakeP
//@audio audioHarmAdvance audioSwell
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

/**  The flakes' flash for one set of tilts.
 *
 * @param cell  The flake. (in)
 * @param L     The light's direction. (in)
 * @param seed  The set of tilts. (in)
 *
 * @return
 *   The flash.
 **/
float flakes(vec2 cell, vec3 L, float seed)
{
    vec2 h = hash22(cell + seed) - 0.5;
    vec3 n = normalize(vec3(h * 1.2, 1.0));
    return pow(max(dot(reflect(-L, n), vec3(0.0, 0.0, 1.0)), 0.0), 60.0);
}

void main()
{
    vec2 p = screenP();
    float fh = famHue();
    float run = 0.04 * sceneTime + 0.2 * audioAdvance;
    float sw = 1.0 + 1.5 * clamp(swirlP, 0.0, 1.0);
    vec3 paint = vec3(0.0);
    for (int i = 0; i < 2; ++i) {
        float ph = fract(run + 0.5 * float(i));
        float w = 1.0 - abs(2.0 * ph - 1.0);
        float r = length(p);
        vec2 q = rot2(sw * ph * exp(-r * 1.5) * 1.2) * p;               // a whirl that turns the middle most
        q += 0.12 * sw * vec2(sin(3.0 * q.y + 6.2831853 * ph), cos(2.5 * q.x - 6.2831853 * ph)) * ph;
        paint += w * tone(imgLod(vec2(0.5) + q * vec2(0.5, 0.85) + float(i) * 0.37, 1.5), fh);
    }
    float la = 0.06 * sceneTime;
    vec3 L = normalize(vec3(cos(la), sin(la), 1.2));
    vec2 cell = floor(gl_FragCoord.xy / 3.0);
    float h = max(audioHarmAdvance, 0.0), hk = floor(h), m = smoothstep(0.3, 0.7, fract(h));
    float fl = mix(flakes(cell, L, mod(hk, 9.0) * 17.3), flakes(cell, L, mod(hk + 1.0, 9.0) * 17.3), m);
    fl *= step(1.0 - (0.15 + 0.35 * clamp(flakeP, 0.0, 1.0)), hash21(cell + 0.5));
    vec3 col = paint * 0.85 + famLight(fh, 0.6, 0.8) * fl * (0.5 + 1.2 * clamp(audioSwell, 0.0, 1.0));
    finish(col);
}
