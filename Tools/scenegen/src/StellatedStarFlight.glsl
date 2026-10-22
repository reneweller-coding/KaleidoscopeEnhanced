//@doc
 * @brief STELLATED STAR FLIGHT: star bodies of geometry -- a dodecahedron whose twelve faces rise into pyramids,
 * Kepler's stellations -- drawn as edges of light round a glowing core, a star field of them streaming toward the
 * eye.  The icosahedral mirrors fold every edge onto one: the dodecahedron's half edge, or the spike from a face's
 * tip down to a corner; how high the tips stand is the stellation.  One colour family from the photo; the cores'
 * temperature follows the music.
 *
 * Audio Reactivity (structure, not only light):
 *   audioHarmAdvance -> each chord change raises or lowers the tips, gliding: flat dodecahedron, small stellation,
 *                       long spikes
 *   audioRolloff     -> the cores' temperature: brighter music, whiter cores
 *   audioAdvance     -> the stream toward the eye and the stars' turning (integrated)
 *   audioSwell       -> the cores swell
 *
 * Knobs: densityP (how many stars), spikeP (the tips' base height), hueP.
//@params densityP spikeP
//@audio audioHarmAdvance audioRolloff audioSwell
//@body
/**  The distance to a segment.
 *
 * @param x  The point. (in)
 * @param a  One end. (in)
 * @param b  The other end. (in)
 *
 * @return
 *   The distance.
 **/
float segD(vec3 x, vec3 a, vec3 b)
{
    vec3 ab = b - a;
    return length(x - a - ab * clamp(dot(x - a, ab) / dot(ab, ab), 0.0, 1.0));
}

/**  The star's edges: folded by the icosahedral mirrors, the dodecahedron's half edge blended with the spike from a
 * face's tip to its corner.
 *
 * @param x     The point (dodecahedron of corners (+-1,+-1,+-1) and the cyclic (0,+-phi,+-1/phi)). (in)
 * @param tipR  The tips' distance from the centre (1.30 is the face itself: no spike). (in)
 * @param m     0: the dodecahedron's edges, 1: the spikes. (in)
 *
 * @return
 *   The distance to the nearest edge.
 **/
float starEdges(vec3 x, float tipR, float m)
{
    const vec3 r2 = vec3(-0.809017, -0.5, 0.309017);
    for (int k = 0; k < 6; ++k) {
        x.xy = abs(x.xy);
        x -= 2.0 * min(dot(x, r2), 0.0) * r2;
    }
    const vec3 V = vec3(0.618034, 0.0, 1.618034);              // a corner
    float dDod = segD(x, vec3(0.0, 0.0, 1.618034), V);
    vec3 tip = tipR * vec3(0.0, 0.5257311, 0.8506508);         // over the face's centre
    float dSp = segD(x, tip, V);
    return mix(dDod, min(dSp, dDod + 0.15 * (1.0 - m)), m);
}

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

void main()
{
    vec2 p = screenP();
    float fh = famHue();
    const float CELL = 5.0;
    float h = max(audioHarmAdvance, 0.0);
    float lv = 1.0 + 0.9 * sin(0.75 * h - 1.2) + 0.35 * clamp(spikeP, 0.0, 1.0);   // the stellation, 0..2.3
    float tipR = 1.3 + 0.6 * clamp(lv, 0.0, 2.3);
    float m = smoothstep(0.0, 0.6, lv);
    float warm = clamp(audioRolloff, 0.0, 1.0);
    float coreR = 0.35 + 0.25 * clamp(audioSwell, 0.0, 1.0);
    float present = 0.55 + 0.4 * clamp(densityP, 0.0, 1.0);
    float fly = 0.6 * sceneTime + 2.6 * audioAdvance;
    float spin = 0.05 * sceneTime + 0.3 * audioAdvance;
    vec3 ro = vec3(0.6 * sin(0.04 * fly), 0.5 * cos(0.035 * fly), fly);               // along the cells' corners
    vec3 rd = normalize(vec3(p, 1.2));
    rd.xz = rot2(0.25 * sin(0.021 * sceneTime)) * rd.xz;
    rd.yz = rot2(0.18 * sin(0.017 * sceneTime + 1.0)) * rd.yz;
    rd.xy = rot2(0.015 * sceneTime) * rd.xy;
    // the lattice stands askew to the flight, so the eye never runs along a plane between the cells
    const mat3 SKEW = mat3(0.9287, 0.0000, -0.3709, 0.1778, 0.8776, 0.4452, 0.3255, -0.4794, 0.8150);
    vec3 rdL = SKEW * rd;
    vec3 col = vec3(0.0);
    float t = 0.05;
    for (int i = 0; i < 100; ++i) {
        vec3 x = SKEW * (ro + rd * t);
        vec3 cid = floor(x / CELL);
        vec3 q0 = x - (cid + 0.5) * CELL;
        float hc = fract(sin(dot(cid, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
        float d = 1e3;
        if (fract(hc * 13.7) < present) {
            vec3 q = q0 - (fract(hc * vec3(3.1, 5.7, 7.3)) - 0.5) * 0.6;
            q = axisRot(normalize(vec3(hc - 0.5, 0.6, 0.4)), spin * (0.5 + hc) + 6.2831853 * hc) * q;
            float sc = 0.55 + 0.2 * fract(hc * 9.1);
            float de = starEdges(q / sc, tipR, m) * sc - 0.02;
            float r = length(q);
            float ge = 1.0 / (1.0 + pow(max(de, 0.0) * 30.0, 2.0));
            float gc = exp(-pow(r / (coreR * sc), 2.0));
            float fade = exp(-0.05 * t) * smoothstep(0.05, 0.5, t);
            col += (famLight(fh, 0.2 + 0.6 * hc, 0.15) * ge * 0.1 + famLight(fh, 0.8, 0.3 + 0.6 * warm) * gc * 0.08) * fade;
            d = min(de, r - coreR * sc);
        }
        vec3 wall = (0.5 * CELL - abs(q0)) / max(abs(rdL), 1e-3);
        t += clamp(0.6 * d, 0.02, max(min(wall.x, min(wall.y, wall.z)), 0.0) + 0.03);
        if (t > 60.0) break;
    }
    col += famCol(fh, 0.5) * 0.012;
    finish(col);
}
