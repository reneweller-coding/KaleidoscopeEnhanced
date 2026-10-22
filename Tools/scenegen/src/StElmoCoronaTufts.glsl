//@doc
 * @brief ST ELMO CORONA TUFTS: St. Elmo's fire: a field of metal tips, row behind row, each crowned with a violet brush
 * of glow -- fine streamers fanning upward from the tip, each bending and stretching on its own -- so the whole field
 * flickers softly without ever jumping; the tufts grow as the music swells.  A streamer leaves its tip at its own angle
 * in the fan, its length and bend riding slow noise, its light fading toward its end; the near rows are larger.  The
 * violet is pulled a little toward the photo's hue.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell   -> the tufts' size
 *   audioAdvance -> the streamers' flicker runs (integrated)
 *
 * Knobs: tipP (the tips' spacing), fanP (how wide the tufts fan), hueP.
//@params tipP fanP
//@audio audioSwell
//@body
void main()
{
    vec2 p = screenP();
    float fh = famHue();
    float vh = fract(0.78 + 0.3 * (fract(fh - 0.78 + 0.5) - 0.5));
    float W0 = 0.14 + 0.06 * clamp(tipP, 0.0, 1.0);
    float fan = 0.5 + 0.4 * clamp(fanP, 0.0, 1.0);
    float size = 0.6 + 0.8 * clamp(audioSwell, 0.0, 1.0);
    float run = 0.4 * sceneTime + 1.6 * audioAdvance;
    vec3 col = famCol(vh, 0.45) * 0.015;
    for (int r = 0; r < 3; ++r) {                                    // far rows first
        float fr = float(r);
        float sc = 0.55 + 0.3 * fr;
        float W = W0 * sc;
        float yt = 0.3 - 0.35 * fr;                                   // the row's tips
        float i0 = floor(p.x / W + 0.37 * fr);
        for (int k = -1; k <= 1; ++k) {
            float i = i0 + float(k);
            float hi = fract(sin(i * 12.9898 + fr * 7.0) * 43758.5453);
            vec2 tip = vec2((i + 0.5 - 0.37 * fr + 0.2 * (hi - 0.5)) * W, yt + 0.02 * sc * (hi - 0.5));
            vec2 rel = p - tip;
            // the tip itself, and the mast below it
            col += famLight(vh, 0.5, 0.8) * exp(-dot(rel, rel) / (0.00002 * sc * sc)) * 0.8;
            col += vec3(0.25) * exp(-pow(rel.x / (0.002 * sc), 2.0)) * step(rel.y, 0.0) * exp(rel.y * 6.0) * 0.15;
            float L = 0.15 * sc * size;
            for (int j = 0; j < 7; ++j) {
                float fj = float(j);
                float ang = fan * (fj / 6.0 - 0.5) * 2.2;
                float nz = noise2(vec2(run * 0.7 + 13.0 * hi, fj * 3.1));
                vec2 dir = vec2(sin(ang), cos(ang)), perp = vec2(cos(ang), -sin(ang));
                float len = L * (0.55 + 0.6 * nz);
                float s = clamp(dot(rel, dir) / len, 0.0, 1.0);
                float bend = 0.3 * (noise2(vec2(run * 0.5 + 7.0 * hi, fj * 5.7 + 2.0)) - 0.5) * len;
                float d = abs(dot(rel, perp) - bend * s * s);
                float w = 0.002 * sc * (1.0 + 2.0 * s);
                float g = exp(-pow(d / w, 2.0)) * pow(1.0 - s, 1.5) * step(0.0, dot(rel, dir));
                col += famLight(vh, 0.3 + 0.1 * fj, 0.25) * g * 0.8 * (0.6 + 0.4 * fr);
            }
            col += famCol(vh, 0.5) * exp(-length(rel - vec2(0.0, 0.4 * L)) / (0.6 * L)) * 0.1;  // the glow round the tuft
        }
    }
    finish(col);
}
