//@doc
 * @brief GYROID SURFACE SWARM: particles flowing on an invisible gyroid surface, drawing it as a moving sheet of points:
 * the surface's endless curving channels appear only as the dust that clings to them, streaming along.  The points
 * are a fine jittered 3D lattice of candidates drifting through space; a point shows where it lies close to the
 * gyroid (the gyroid's value over its gradient), so as the lattice drifts the points slide over the surface and new
 * ones light as they reach it.  The eye flies slowly through.  The points' light is shades of one colour family.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance     -> the stream of points and the flight (integrated)
 *   audioHarmAdvance -> the surface shifts with the chord changes (its level set wanders)
 *   audioSwell       -> how thick the clinging layer is
 *
 * Knobs: dotP (how fine the points are), cellP (the gyroid's scale), hueP.
//@params dotP cellP
//@audio audioHarmAdvance audioSwell
//@body
void main()
{
    vec2 p = screenP();
    float fh = famHue();
    float h = max(audioHarmAdvance, 0.0);
    float D = 0.035 - 0.012 * clamp(dotP, 0.0, 1.0);
    float sc = 3.0 + 2.0 * clamp(cellP, 0.0, 1.0);
    float level = 0.3 * sin(0.6 * h);
    float layer = 0.08 + 0.1 * clamp(audioSwell, 0.0, 1.0);
    float stream = 0.05 * sceneTime + 0.2 * audioAdvance;
    float fly = 0.1 * sceneTime + 0.35 * audioAdvance;
    vec3 ro = vec3(0.2 * sin(0.2 * fly), 0.15 * cos(0.15 * fly), fly);
    vec3 rd = normalize(vec3(p, 1.2));
    rd.xz = rot2(0.2 * sin(0.03 * sceneTime)) * rd.xz;
    const mat3 SKEW = mat3(0.9287, 0.0000, -0.3709, 0.1778, 0.8776, 0.4452, 0.3255, -0.4794, 0.8150);
    vec3 col = vec3(0.0);
    float t = 0.35;
    vec3 drift = vec3(stream, 0.6 * stream, 0.3 * stream);
    for (int i = 0; i < 110; ++i) {
        vec3 x = ro + rd * t;
        vec3 xl = x - drift;                                     // the drifting candidate lattice
        vec3 dc = floor(SKEW * xl / D);
        float hd = fract(sin(dot(dc, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
        vec3 dp = ((dc + 0.5 + 0.6 * (fract(hd * vec3(3.1, 5.7, 7.3)) - 0.5)) * D) * SKEW + drift;
        float d = length(cross(dp - ro, rd));
        vec3 y = dp * sc;
        vec3 s = sin(y), c = cos(y);
        float gv = dot(s, c.yzx) - level;
        vec3 grad = vec3(c.x * c.y - s.z * s.x, -s.x * s.y + c.y * c.z, -s.y * s.z + c.z * c.x);
        float near = exp(-pow(gv / max(length(grad), 0.3) / (layer), 2.0));
        float lit = exp(-pow(d / (0.16 * D), 2.0)) * near;
        col += famLight(fh, 0.3 + 0.4 * fract(dot(dc, vec3(0.031, 0.017, 0.023))), 0.4) * lit * exp(-0.35 * t) * 0.6;
        t += D * 0.7;
    }
    finish(col);
}
