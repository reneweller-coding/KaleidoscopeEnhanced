//@doc
 * @brief LE PARC MIRROR RAIN: after Julio Le Parc's "Continuel-lumiere": hundreds of small square mirrors hang on
 * threads in rows and turn slowly; a light shines on them and their reflected spots dance across a dark wall,
 * stretched and squeezed as each mirror turns.  A mirror at x turned by the angle a sends its spot to x + D sin(2a)
 * on the wall (it turns about its vertical thread, so the spots move sideways) and its spot is the square seen cos
 * a wide; each pixel gathers the spots of the mirrors in its row band whose reach covers it.  The light's colour
 * comes from one colour family from the photo; the spots overlap into brighter patches.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance -> the mirrors turn (integrated)
 *   audioOnset   -> a gust runs through one row: its mirrors turn a little further
 *   audioSwell   -> the light's brightness
 *
 * Knobs: mirrorP (how many mirrors per row), reachP (how far the spots travel), hueP.
//@params mirrorP reachP
//@audio audioOnset audioSwell
//@body
void main()
{
    vec2 p = screenP();
    float fh = famHue();
    float n = floor(16.0 + 16.0 * clamp(mirrorP, 0.0, 1.0));   // mirrors per screen width
    float S = 1.8 / n;
    float D = 0.15 + 0.25 * clamp(reachP, 0.0, 1.0);
    float spin = 0.15 * sceneTime + 0.5 * audioAdvance;
    float gust = clamp(audioOnset, 0.0, 1.0);
    float rowH = S * 1.3;
    float row = floor(p.y / rowH);
    float fy = p.y / rowH - row;
    vec3 col = famCol(fh, 0.4) * 0.02;
    for (int dr = 0; dr < 2; ++dr) {
        float rw = row + float(dr) - (fy < 0.5 ? 1.0 : 0.0);
        float yC = (rw + 0.5) * rowH;
        float inRow = smoothstep(0.5 * rowH, 0.3 * rowH, abs(p.y - yC));
        if (inRow <= 0.0) continue;
        float push = gust * step(0.5, fract(rw * 0.37 + 0.1)) * 0.6;
        int span = int(D / S) + 2;
        float c0 = floor((p.x + 0.9) / S);
        for (int k = -14; k <= 14; ++k) {
            if (abs(k) > span) continue;
            float c = c0 + float(k);
            float hc = fract(sin(c * 12.9898 + rw * 78.233) * 43758.5453);
            float a = spin * (0.5 + hc) * (hc < 0.5 ? -1.0 : 1.0) + 6.2831853 * hc + push;
            float x = (c + 0.5) * S - 0.9 + D * sin(2.0 * a);
            float w = 0.5 * S * abs(cos(a)) + 0.004;
            float spot = smoothstep(w, w * 0.7, abs(p.x - x));
            col += famLight(fh, 0.3 + 0.4 * hc, 0.4) * spot * inRow * (0.35 + 0.3 * abs(cos(a)));
        }
    }
    col *= 0.7 + 0.6 * clamp(audioSwell, 0.0, 1.0);
    finish(col);
}
