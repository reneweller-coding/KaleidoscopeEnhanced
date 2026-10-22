//@doc
 * @brief WHITNEY ARABESQUE: after John Whitney's "Arabesque": hundreds of points on harmonic paths with graded
 * speeds -- the n-th point turns n steps faster than the first -- so the swarm is a loose cloud most of the time
 * and then, whenever the common clock passes a simple fraction of a step, falls into rosettes, spokes and stars,
 * dissolves and orders itself anew.  Each point draws a short glowing comet trail (the arc it covered a moment
 * ago), so the fast outer ones become arcs and the slow inner ones dots.  The points' colours are shades of one
 * colour family from the photo.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance     -> the common clock (integrated): the music's drive brings the moments of order faster
 *   audioHarmAdvance -> the step between neighbouring speeds changes with the chord changes (another family of
 *                       figures, the two swarms' light cross-faded)
 *   audioSwell       -> the points' glow
 *
 * Knobs: pointP (how many points), shapeP (the path's shape: circle to wave), hueP.
//@params pointP shapeP
//@audio audioHarmAdvance audioSwell
//@body
/**  The swarm's light for one frequency grid.
 *
 * @param p      The point. (in)
 * @param N      How many points. (in)
 * @param step_  The step between neighbouring speeds. (in)
 * @param s      The common clock. (in)
 * @param shape  The path's shape. (in)
 * @param fh     The colour family. (in)
 *
 * @return
 *   The light.
 **/
vec3 swarm(vec2 p, float N, float step_, float s, float shape, float fh)
{
    vec3 col = vec3(0.0);
    for (int i = 0; i < 180; ++i) {
        float fi = float(i);
        if (fi >= N) break;
        float r = 0.08 + 0.4 * fi / N;
        // its speed: one step faster than its inner neighbour
        float k = 1.0 + step_ * fi;
        float a = 6.2831853 * k * s;
        vec2 pt = r * vec2(cos(a), sin(a) * (1.0 - 0.5 * shape) + shape * 0.25 * sin(3.0 * a));
        // a short trail: the point a moment ago
        float a2 = 6.2831853 * k * (s - 0.0012);
        vec2 pt2 = r * vec2(cos(a2), sin(a2) * (1.0 - 0.5 * shape) + shape * 0.25 * sin(3.0 * a2));
        vec2 e = pt - pt2;
        float tt = clamp(dot(p - pt2, e) / max(dot(e, e), 1e-8), 0.0, 1.0);
        float dt = length(p - pt2 - e * tt);
        float d = length(p - pt);
        float g = exp(-d * d / 0.0001) + 0.5 * exp(-dt * dt / 0.00003) * tt;
        col += famLight(fh, fi / N, 0.4) * g;
    }
    return col;
}

void main()
{
    vec2 p = screenP() * vec2(0.6, 1.0);                             // the figure spread over the picture's width
    float fh = famHue();
    float N = floor(100.0 + 80.0 * clamp(pointP, 0.0, 1.0));
    float h = max(audioHarmAdvance, 0.0);
    float hk = floor(h), hm = smoothstep(0.15, 0.85, h - hk);
    float shape = clamp(shapeP, 0.0, 1.0);
    float glow = 0.6 + 0.6 * clamp(audioSwell, 0.0, 1.0);
    // two grids cross-faded in light as the harmony moves on (a changed grid would make every point jump)
    float clock = 0.004 * sceneTime + 0.012 * audioAdvance;
    vec3 col = swarm(p, N, (1.0 + mod(hk, 3.0)) / 3.0, clock, shape, fh) * (1.0 - hm);
    if (hm > 0.001) col += swarm(p, N, (1.0 + mod(hk + 1.0, 3.0)) / 3.0, clock, shape, fh) * hm;
    col *= glow;
    col += famCol(fh, 0.45) * 0.02;
    finish(famExpose(col, 3.31, 0.70, 0.05, fh));
}
