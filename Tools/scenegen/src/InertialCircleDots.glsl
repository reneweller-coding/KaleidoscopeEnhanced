//@doc
 * @brief INERTIAL CIRCLE DOTS: particles seen in a rotating frame -- a merry-go-round's view of drifting matter: each
 * glides with the slow drift but circles at the frame's inertial frequency, so its track is a chain of loops, and the
 * loops of the whole field add up to a dense pattern of curls.  A particle's place is its drift plus a circle,
 * x = x0 + v t + r (cos(f t), sin(f t)); its recent track is drawn as a fading trail.  The particles sit on a jittered
 * grid; each pixel looks at the particles of its cell and the neighbours'.  The light is shades of one colour family.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance -> the frame turns and the particles drift (integrated): with more drive, more loops
 *   audioSwell   -> the inertial circles' size
 *
 * Knobs: driftP (how fast the matter drifts), trailP (how long the trails are), hueP.
//@params driftP trailP
//@audio audioSwell
//@body
void main()
{
    vec2 p = screenP();
    float fh = famHue();
    const float S = 0.2;
    float drift = 0.04 + 0.08 * clamp(driftP, 0.0, 1.0);
    float rad = S * (0.2 + 0.35 * clamp(audioSwell, 0.0, 1.0));
    float clock = 0.5 * sceneTime + 2.0 * audioAdvance;
    float trail = 3.0 + 3.0 * clamp(trailP, 0.0, 1.0);
    vec2 g0 = floor(p / S);
    vec3 col = famCol(fh, 0.45) * 0.012;
    for (int k = 0; k < 9; ++k) {
        vec2 cid = g0 + vec2(float(k % 3) - 1.0, float(k / 3) - 1.0);
        float hc = fract(sin(dot(cid, vec2(12.9898, 78.233))) * 43758.5453);
        float f = 1.0 + 0.3 * hc;                                 // the inertial frequency (a little different each)
        vec2 v = drift * vec2(cos(6.2831853 * fract(hc * 3.7)), sin(6.2831853 * fract(hc * 3.7)));
        // the drift wraps inside the particle's own cell, so it never leaves the neighbours' reach
        vec2 x0 = (cid + 0.5) * S;
        float best = 1e9, age = 0.0;
        vec2 prev = vec2(0.0);
        for (int i = 0; i <= 16; ++i) {
            float tt = clock - trail * float(i) / 16.0;
            vec2 w = vec2(sin(v.x * tt * 3.0 + 6.0 * hc), sin(v.y * tt * 3.0 + 3.0 * hc)) * S * 0.25;
            vec2 x = x0 + w + rad * vec2(cos(f * tt + 6.2831853 * hc), sin(f * tt + 6.2831853 * hc));
            if (i > 0) {
                vec2 e = x - prev;
                float hh = clamp(dot(p - prev, e) / max(dot(e, e), 1e-8), 0.0, 1.0);
                float d = length(p - prev - e * hh);
                if (d < best) { best = d; age = (float(i) - 1.0 + hh) / 16.0; }
            }
            prev = x;
        }
        vec2 head = x0 + vec2(sin(v.x * clock * 3.0 + 6.0 * hc), sin(v.y * clock * 3.0 + 3.0 * hc)) * S * 0.25
                    + rad * vec2(cos(f * clock + 6.2831853 * hc), sin(f * clock + 6.2831853 * hc));
        float g = exp(-pow(best / 0.0045, 2.0)) * (1.0 - age) + smoothstep(0.008, 0.004, length(p - head));
        col += famLight(fh, 0.2 + 0.6 * hc, 0.4) * g;
    }
    finish(col);
}
