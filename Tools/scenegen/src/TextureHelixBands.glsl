//@doc
 * @brief TEXTURE HELIX BANDS: two bands cut from the photo wind endlessly round the flight path like ribbons on a
 * spiral stair, the view flying along inside them; the winding tightens or loosens as the harmony moves.  A band is a
 * strip of a helicoid round the flight: a ray from the axis keeps its angle, so it meets the band where the helix's
 * angle comes round to it -- once every turn, a fixed step apart in depth -- and only where the meeting lies within the
 * band's width; the nearest meeting shows the photo along the band.  A chord change cross-fades to another winding, as
 * light (the winding times the depth must never change smoothly with the music, or the far turns would race).  The
 * bands are the photo, calmed toward one colour family.
 *
 * Audio Reactivity (structure, not only light):
 *   audioHarmAdvance -> the winding: a chord change brings a tighter or looser one (cross-faded)
 *   audioAdvance     -> the flight along the bands (integrated)
 *   audioSwell       -> the bands' glow
 *
 * Knobs: widthP (the bands' width), turnP (how tightly they wind), hueP.
//@params widthP turnP
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

/**  The bands seen along a ray, for one winding.
 *
 * @param r    The ray's distance from the middle. (in)
 * @param a    The ray's angle. (in)
 * @param om   The winding (turns of angle per unit of depth). (in)
 * @param bw   The bands' half width. (in)
 * @param fly  The flight. (in)
 * @param fh   The family's hue. (in)
 *
 * @return
 *   rgb the light, a 1 where a band shows.
 **/
vec4 bands(float r, float a, float om, float bw, float fly, float fh)
{
    const float RH = 0.55;
    float best = 1e9;
    vec4 res = vec4(0.0);
    for (int b = 0; b < 2; ++b) {
        float off = 3.14159265 * float(b);
        // the depths where the helix's angle comes round to this ray: om (z + fly) + off = a + 2 pi n
        float z0 = (a - off) / om - fly;
        float step0 = 6.2831853 / om;
        float n0 = ceil((0.15 - z0) / step0);
        for (int j = 0; j < 4; ++j) {
            float z = z0 + (n0 + float(j)) * step0;
            float rho = r * z;
            float v = (rho - RH) / bw;
            if (abs(v) < 1.0 && z < best) {
                best = z;
                float u = (z + fly) * 0.12 + 0.5 * float(b);
                vec3 ph = tone(imgLod(vec2(0.5 + 0.4 * sin(6.2831853 * u * 0.5), 0.5 + 0.35 * v), 1.5), fh);
                float edge = 1.0 - smoothstep(0.85, 1.0, abs(v));
                float shade = 0.55 + 0.45 * cos(v * 1.4);
                res = vec4(ph * shade * edge * exp(-0.06 * z), 1.0);
                res.rgb += famLight(fh, 0.6, 0.6) * exp(-pow((1.0 - abs(v)) / 0.06, 2.0)) * 0.3 * exp(-0.06 * z);
            }
        }
    }
    return res;
}

void main()
{
    vec2 p = screenP();
    float fh = famHue();
    float r = max(length(p), 1e-3), a = atan(p.y, p.x);
    float fly = 0.3 * sceneTime + 1.0 * audioAdvance;
    float bw = 0.12 + 0.12 * clamp(widthP, 0.0, 1.0);
    float base = 0.8 + 0.6 * clamp(turnP, 0.0, 1.0);
    float h = max(audioHarmAdvance, 0.0), hk = floor(h), m = smoothstep(0.3, 0.7, fract(h));
    vec4 bA = bands(r, a, base * (1.0 + 0.3 * mod(hk, 3.0)), bw, fly, fh);
    vec4 bB = bands(r, a, base * (1.0 + 0.3 * mod(hk + 1.0, 3.0)), bw, fly, fh);
    vec4 bnd = mix(bA, bB, m);
    float glow = 0.6 + 0.6 * clamp(audioSwell, 0.0, 1.0);
    vec3 col = famCol(fh, 0.4) * 0.03 + famLight(fh, 0.5, 0.6) * exp(-r * 6.0) * 0.25;
    col = mix(col, bnd.rgb * glow, bnd.a);
    finish(col);
}
