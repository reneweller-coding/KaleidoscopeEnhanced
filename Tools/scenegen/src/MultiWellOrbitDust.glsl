//@doc
 * @brief MULTI WELL ORBIT DUST: dust circling several wandering centres of gravity, each grain on its own orbit with a
 * short glowing tail: near a centre the grains race round in tight circles, further out they drift slowly; where two
 * wells come close their swarms brush past each other.  Each grain belongs to one well, orbits it at its own radius
 * with Kepler's angular speed (r^(-3/2)), on an ellipse tilted its own way, and draws a tail along its recent arc.
 * The dust's light is shades of one colour family from the photo.
 *
 * Audio Reactivity (structure, not only light):
 *   audioHarmAdvance -> the wells wander with the chord changes
 *   audioAdvance     -> the orbits run (integrated)
 *   audioSwell       -> the tails' length
 *
 * Knobs: grainP (how many grains), wellP (how many wells), hueP.
//@params grainP wellP
//@audio audioHarmAdvance audioSwell
//@body
void main()
{
    vec2 p = screenP();
    float fh = famHue();
    float h = max(audioHarmAdvance, 0.0);
    float N = floor(120.0 + 120.0 * clamp(grainP, 0.0, 1.0));
    float wells = floor(2.0 + 2.0 * clamp(wellP, 0.0, 1.0));
    float run = 0.1 * sceneTime + 0.4 * audioAdvance;
    float tail = 0.15 + 0.35 * clamp(audioSwell, 0.0, 1.0);
    vec3 col = famCol(fh, 0.45) * 0.012;
    for (int i = 0; i < 240; ++i) {
        float fi = float(i);
        if (fi >= N) break;
        float h1 = fract(sin(fi * 12.9898) * 43758.5453), h2 = fract(sin(fi * 78.233) * 43758.5453);
        float w = floor(h1 * wells);
        vec2 c = vec2(0.6 * sin(0.4 * h + 2.3 * w + 0.03 * sceneTime), 0.35 * cos(0.33 * h + 1.7 * w));
        float r = 0.06 + 0.32 * h2 * h2 + 0.02;
        float om = 0.5 * pow(r / 0.2, -1.5);
        float e = 0.3 * fract(h1 * 9.7);
        float tilt = 6.2831853 * fract(h1 * 3.3);
        float a = om * run + 6.2831853 * fract(h1 * 5.1);
        // the grain and its tail: the arc it covered over the last stretch
        float best = 1e9, along = 0.0;
        vec2 prev = vec2(0.0);
        for (int k = 0; k <= 6; ++k) {
            float ak = a - tail * float(k) / 6.0;
            vec2 q = c + rot2(tilt) * vec2(r * cos(ak), r * (1.0 - e) * sin(ak));
            if (k > 0) {
                vec2 ed = q - prev;
                float hh = clamp(dot(p - prev, ed) / max(dot(ed, ed), 1e-8), 0.0, 1.0);
                float d = length(p - prev - ed * hh);
                if (d < best) { best = d; along = (float(k) - 1.0 + hh) / 6.0; }
            }
            prev = q;
        }
        float head = exp(-pow(length(p - (c + rot2(tilt) * vec2(r * cos(a), r * (1.0 - e) * sin(a)))) / 0.004, 2.0));
        float g = exp(-pow(best / 0.0025, 2.0)) * (1.0 - along) * 0.6 + head;
        col += famLight(fh, 0.2 + 0.6 * h2, 0.4) * g;
    }
    // the wells: faint glows
    for (int w = 0; w < 4; ++w) {
        float fw = float(w);
        if (fw >= wells) break;
        vec2 c = vec2(0.6 * sin(0.4 * h + 2.3 * fw + 0.03 * sceneTime), 0.35 * cos(0.33 * h + 1.7 * fw));
        col += famLight(fh, 0.5, 0.6) * exp(-length(p - c) * 25.0) * 0.4;
    }
    finish(famExpose(col, 5.67, 0.70, 0.03, fh));
}
