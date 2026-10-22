//@doc
 * @brief MAGNETIC BOTTLE ORBITS: a lattice of magnetic bottles, and in each a charged particle gyrating fast round the
 * field lines while it bounces slowly to and fro between the two mirror points where the field pinches: its path is
 * a tight helix stretched between two turning ends, drawn as a glowing thread; the bottles stand in rows into the
 * depth, so the threads weave into a fabric.  The path is x = X sin(w_b t) along the bottle, with gyration of radius
 * r round it -- tighter where the field is strong near the ends -- sampled over a stretch of time and projected.
 * The threads' light is shades of one colour family from the photo.
 *
 * Audio Reactivity (structure, not only light):
 *   audioHarmAdvance -> the mirrors' strength glides with the chord changes: the bounce lengthens or shortens
 *   audioAdvance     -> the particles run (integrated)
 *   audioSwell       -> the threads' glow
 *
 * Knobs: gyroP (how fast the particles gyrate), rowP (how many rows), hueP.
//@params gyroP rowP
//@audio audioHarmAdvance audioSwell
//@body
void main()
{
    vec2 p = screenP();
    float fh = famHue();
    float h = max(audioHarmAdvance, 0.0);
    float gyro = 14.0 + 14.0 * clamp(gyroP, 0.0, 1.0);
    float rows = 2.0 + 2.0 * clamp(rowP, 0.0, 1.0);
    float X = 0.22 + 0.06 * sin(0.6 * h);
    float run = 0.3 * sceneTime + 1.2 * audioAdvance;
    float glow = 0.7 + 0.6 * clamp(audioSwell, 0.0, 1.0);
    vec3 col = famCol(fh, 0.45) * 0.012;
    for (int r = 3; r >= 0; --r) {
        float fr = float(r);
        if (fr >= rows) continue;
        float z = 1.3 + 0.8 * fr;
        float S = 0.62;                                          // the bottles' spacing (world)
        // which bottle along this row is nearest the pixel
        float wx = p.x * z / 1.2;
        float wy = p.y * z / 1.2 - (0.4 - 0.25 * fr);
        float k = floor(wx / S + 0.5);
        if (abs(wy) > 0.5) continue;
        float hk = fract(sin(k * 12.9898 + fr * 7.7) * 43758.5453);
        vec2 c = vec2(k * S, 0.0);
        float best = 1e9;
        vec2 prev = vec2(0.0);
        for (int i = 0; i <= 120; ++i) {
            float t = run * (0.8 + 0.4 * hk) - 4.0 * float(i) / 120.0 + 6.0 * hk;
            float s = sin(0.9 * t);
            float along = X * s;
            float rad = 0.07 * (1.0 - 0.6 * s * s);               // tighter near the mirrors
            float a = gyro * t;
            vec3 x = vec3(c.x + along, rad * cos(a), rad * sin(a));
            x.xy = rot2(0.5 * (hk - 0.5)) * x.xy;
            vec2 sp = vec2(x.x, x.y + (0.4 - 0.25 * fr)) * 1.2 / (z + x.z);
            if (i > 0) {
                vec2 e = sp - prev;
                best = min(best, length(p - prev - e * clamp(dot(p - prev, e) / max(dot(e, e), 1e-8), 0.0, 1.0)));
            }
            prev = sp;
        }
        float g = exp(-pow(best / 0.0025, 2.0)) + 0.15 * exp(-best / 0.01);
        col += famLight(fh, 0.2 + 0.6 * hk, 0.3) * g * glow / (1.0 + 0.5 * fr);
    }
    finish(col);
}
