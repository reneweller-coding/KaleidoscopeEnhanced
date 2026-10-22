//@doc
 * @brief GYROID INTERSECTION LINES: two gyroids, the second shifted against the first; neither surface is shown,
 * only the curves where they cut each other glow -- a spatial net of luminous threads with no face anywhere,
 * endless, flown through.  The distance to the curves is the length of the two surfaces' values over their
 * gradients, so a thread keeps its width wherever it runs.  One colour family from the photo, the threads a shade
 * by their depth.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance  -> the shift between the two gyroids (the net lurches and re-knots) and the flight, both
 *                    integrated
 *   audioSwell    -> the threads' thickness
 *   audioCentroid -> the light's temperature at the cores
 *
 * Knobs: scaleP (the net's mesh), shiftP (the shift's base), hueP.  Distinct from GyroidTriplyPeriodicLabyrinth,
 * which shows the surface itself.
//@params scaleP shiftP
//@audio audioSwell audioCentroid
//@body
/**  The gyroid's value and gradient.
 *
 * @param x  The point. (in)
 * @param g  Returns the gradient. (out)
 *
 * @return
 *   sin x cos y + sin y cos z + sin z cos x.
 **/
float gyroid(vec3 x, out vec3 g)
{
    vec3 s = sin(x), c = cos(x);
    g = vec3(c.x * c.y - s.z * s.x, -s.x * s.y + c.y * c.z, -s.y * s.z + c.z * c.x);
    return dot(s, c.yzx);
}

void main()
{
    vec2 p = screenP();
    float fh = famHue();
    float sc = 1.6 + 0.8 * clamp(scaleP, 0.0, 1.0);
    vec3 shift = vec3(0.9, 0.55, 0.3) + 0.4 * clamp(shiftP, 0.0, 1.0)
                 + 0.55 * vec3(sin(0.31 * audioAdvance + 0.02 * sceneTime), sin(0.23 * audioAdvance + 1.7),
                               cos(0.19 * audioAdvance + 0.015 * sceneTime));
    float width = 0.05 + 0.04 * clamp(audioSwell, 0.0, 1.0);
    float warm = clamp(audioCentroid, 0.0, 1.0);
    float fly = 0.25 * sceneTime + 1.2 * audioAdvance;
    vec3 ro = vec3(0.4 * sin(0.05 * fly), 0.3 * cos(0.04 * fly), fly);
    vec3 rd = normalize(vec3(p, 1.0));
    rd.xz = rot2(0.25 * sin(0.027 * sceneTime)) * rd.xz;
    rd.yz = rot2(0.2 * sin(0.021 * sceneTime + 2.0)) * rd.yz;
    rd.xy = rot2(0.017 * sceneTime) * rd.xy;
    vec3 col = vec3(0.0);
    float t = 0.1;
    for (int i = 0; i < 90; ++i) {
        vec3 x = (ro + rd * t) * sc;
        vec3 g1, g2;
        float a = gyroid(x, g1);
        float b = gyroid(x + shift, g2);
        float d = length(vec2(a / max(length(g1), 0.25), b / max(length(g2), 0.25))) / sc;
        float core = exp(-pow(d / (width / sc), 2.0));
        float halo = 0.02 / (0.02 + d * d * 60.0);
        float fade = exp(-0.11 * t);
        col += famLight(fh, clamp(t / 10.0, 0.0, 1.0), 0.15 + 0.5 * warm * core) * (core * 0.5 + halo * 0.12) * fade;
        t += clamp(0.45 * d, 0.025, 0.25);
        if (t > 14.0) break;
    }
    col *= 0.35;
    col += famCol(fh, 0.5) * 0.012;
    finish(col);
}
