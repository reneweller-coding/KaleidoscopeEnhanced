//@doc
 * @brief LEMNISCATE LIGHT LOOPS: thick neon tubes bent into Cassini's ovals -- the curves where the product of the
 * distances to two foci is constant -- in every cell of a spatial lattice, each in its own tilted plane: two
 * separate loops, Bernoulli's figure eight, a waisted peanut, a plain oval, depending on how the constant stands
 * to the foci; all of them deform together.  The distance to a loop is its implicit value over its gradient in the
 * plane, joined with the height above it.  One colour family from the photo.
 *
 * Audio Reactivity (structure, not only light):
 *   audioHarmAdvance -> the constant glides with the chord changes: loops part into pairs, touch in the figure
 *                       eight, merge into ovals -- all cells in step, each from its own starting point
 *   audioAdvance     -> the planes turn and the eye drifts (integrated)
 *   audioSwell       -> the tubes thicken
 *   audioOnset       -> light runs round the loops
 *
 * Knobs: tubeP (the tubes' thickness), spreadP (how different the cells' loops are), hueP.
//@params tubeP spreadP
//@audio audioHarmAdvance audioSwell audioOnset
//@body
/**  A rotation about an axis.
 *
 * @param ax  The unit axis. (in)
 * @param a   The angle. (in)
 *
 * @return
 *   The rotation matrix.
 **/
mat3 axisRot(vec3 ax, float a)
{
    float c = cos(a), s = sin(a);
    return mat3(c + ax.x * ax.x * (1.0 - c), ax.y * ax.x * (1.0 - c) + ax.z * s, ax.z * ax.x * (1.0 - c) - ax.y * s,
                ax.x * ax.y * (1.0 - c) - ax.z * s, c + ax.y * ax.y * (1.0 - c), ax.z * ax.y * (1.0 - c) + ax.x * s,
                ax.x * ax.z * (1.0 - c) + ax.y * s, ax.y * ax.z * (1.0 - c) - ax.x * s, c + ax.z * ax.z * (1.0 - c));
}

/**  The distance to a Cassini oval (foci at +-1 on x, constant a^2) in the plane z = 0.
 *
 * @param q  The point. (in)
 * @param a  The constant's root: below 1 two loops, 1 the lemniscate, above 1 one loop. (in)
 *
 * @return
 *   The distance to the curve (approximate in the plane, exact across it).
 **/
float cassini(vec3 q, float a)
{
    float r2 = dot(q.xy, q.xy);
    float f = r2 * r2 - 2.0 * (q.x * q.x - q.y * q.y) - (a * a * a * a - 1.0);
    vec2 g = 4.0 * vec2(q.x * (r2 - 1.0), q.y * (r2 + 1.0));
    float dp = abs(f) / max(length(g), 0.9);
    return length(vec2(dp, q.z));
}

void main()
{
    vec2 p = screenP();
    float fh = famHue();
    const float CELL = 4.0;
    float h = max(audioHarmAdvance, 0.0);
    float aBase = 1.0 + 0.32 * sin(0.85 * h) + 0.12 * sin(0.31 * h + 2.0);
    float spread = 0.08 + 0.2 * clamp(spreadP, 0.0, 1.0);
    float tube = (0.045 + 0.035 * clamp(tubeP, 0.0, 1.0)) * (0.85 + 0.35 * clamp(audioSwell, 0.0, 1.0));
    float turn = 0.04 * sceneTime + 0.3 * audioAdvance;
    float runL = 0.5 * audioAdvance + 0.04 * sceneTime;
    float onset = clamp(audioOnset, 0.0, 1.0);
    float drift = 0.3 * sceneTime + 1.3 * audioAdvance;
    vec3 ro = vec3(0.4 * sin(0.04 * drift), 0.35 * cos(0.035 * drift), drift);
    vec3 rd = normalize(vec3(p, 1.1));
    rd.xz = rot2(0.3 * sin(0.022 * sceneTime)) * rd.xz;
    rd.yz = rot2(0.2 * sin(0.018 * sceneTime + 1.0)) * rd.yz;
    // the lattice stands askew to the flight, so the eye never runs along a plane between the cells
    const mat3 SKEW = mat3(0.9287, 0.0000, -0.3709, 0.1778, 0.8776, 0.4452, 0.3255, -0.4794, 0.8150);
    vec3 rdL = SKEW * rd;
    vec3 col = vec3(0.0);
    float t = 0.05;
    for (int i = 0; i < 96; ++i) {
        vec3 x = SKEW * (ro + rd * t);
        vec3 cid = floor(x / CELL);
        vec3 q0 = x - (cid + 0.5) * CELL;
        float hc = fract(sin(dot(cid, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
        // each loop off its cell's centre, so no empty planes line up between the cells
        vec3 jit = (fract(hc * vec3(13.7, 19.3, 23.9)) - 0.5) * 0.8;
        vec3 q = axisRot(normalize(fract(hc * vec3(3.1, 5.7, 7.3)) - 0.5 + vec3(0.0, 0.0, 0.01)),
                         turn * (0.4 + 0.8 * hc) + 6.2831853 * hc) * (q0 - jit) / 0.8;
        float a = aBase + spread * (fract(hc * 11.3) - 0.5) * 2.0;
        float d = cassini(q, a) * 0.8 - tube;
        float ang = atan(q.y, q.x);
        float run = pow(0.5 + 0.5 * cos(2.0 * ang - 6.2831853 * runL + 6.2831853 * hc), 10.0);
        float g = 1.0 / (1.0 + pow(max(d, 0.0) * 26.0, 2.0));
        float core = exp(-pow(max(d, 0.0) / (0.5 * tube), 2.0));
        float fade = exp(-0.08 * t) * smoothstep(0.05, 0.5, t);
        col += famLight(fh, 0.15 + 0.7 * hc, 0.1 + 0.35 * core + 0.4 * run * onset) * g * (1.0 + 1.5 * run * onset) * fade * 0.075;
        vec3 wall = (0.5 * CELL - abs(q0)) / max(abs(rdL), 1e-3);
        t += clamp(0.55 * d, 0.02, max(min(wall.x, min(wall.y, wall.z)), 0.0) + 0.03);
        if (t > 36.0) break;
    }
    col += famCol(fh, 0.5) * 0.012;
    finish(col);
}
