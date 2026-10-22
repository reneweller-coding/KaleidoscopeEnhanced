//@doc
 * @brief TREFOIL KNOT CORRIDOR: torus knots of neon hanging in a cubic lattice, each in its own cell; the eye
 * flies down one row of them and threads through the hole of every knot, the neighbouring rows glowing all round.
 * A knot is drawn in its torus' coordinates: at the angle phi round the axis its P strands sit at the tube angles
 * Q (phi + 2 pi k) / P, so one formula gives the trefoil (2,3), the cinquefoil (2,5), the (3,4) and the (3,5) knot.
 * The colour is one family taken from the photo, each knot a shade by its lattice place.
 *
 * Audio Reactivity (structure, not only light):
 *   audioHarmAdvance -> each chord change blends every knot into the next kind, (2,3) -> (3,5) -> (2,5) -> (3,4)
 *   audioAdvance     -> the flight (integrated) and the light pulses running round the knots
 *   audioOnset       -> the pulses' brightness
 *   audioSwell       -> the tubes thicken a little
 *
 * Knobs: tubeP (the tubes' thickness), spinP (how the knots turn), hueP.
//@params tubeP spinP
//@audio audioHarmAdvance audioOnset audioSwell
//@body
/**  The knot kind of a step in the cycle (2,3), (3,5), (2,5), (3,4).
 *
 * @param k  The step (any whole number). (in)
 *
 * @return
 *   (P, Q): P strands round the axis, Q turns through the hole.
 **/
vec2 knotKind(float k)
{
    float m = mod(k, 4.0);
    return m < 0.5 ? vec2(2.0, 3.0) : m < 1.5 ? vec2(3.0, 5.0) : m < 2.5 ? vec2(2.0, 5.0) : vec2(3.0, 4.0);
}

/**  The distance to a (P,Q) torus knot of major radius 1 and tube radius 0.42, measured in the tube's cross
 * section, and where along the knot the nearest strand is.
 *
 * @param q    The point in the knot's frame (axis z). (in)
 * @param pq   (P, Q). (in)
 * @param s    Returns the knot parameter at the nearest strand, 0..1 round the whole knot. (out)
 *
 * @return
 *   The distance to the knot's centre line.
 **/
float knotDist(vec3 q, vec2 pq, out float s)
{
    float phi = atan(q.y, q.x);
    vec2 w = vec2(length(q.xy) - 1.0, q.z);
    float best = 1e9;
    s = 0.0;
    for (int k = 0; k < 3; ++k) {
        if (float(k) >= pq.x) break;
        float a = (phi + 6.2831853 * float(k)) / pq.x;           // the knot parameter of this strand
        float th = pq.y * a;
        float d = length(w - 0.42 * vec2(cos(th), sin(th)));
        if (d < best) { best = d; s = a / 6.2831853; }
    }
    return best;
}

void main()
{
    vec2 p = screenP();
    float fh = famHue();
    float h = max(audioHarmAdvance, 0.0);
    float hk = floor(h);
    float hm = smoothstep(0.15, 0.85, h - hk);
    vec2 kindA = knotKind(hk), kindB = knotKind(hk + 1.0);
    float tube = (0.04 + 0.04 * clamp(tubeP, 0.0, 1.0)) * (0.85 + 0.3 * clamp(audioSwell, 0.0, 1.0));
    float fly = 0.35 * sceneTime + 1.6 * audioAdvance;
    const float CELL = 4.4;
    const float KS = 1.35;                                       // the knots' size
    vec3 ro = vec3(0.12 * sin(0.21 * fly), 0.1 * cos(0.17 * fly), fly);
    vec3 rd = normalize(vec3(p, 1.1));
    rd.xz = rot2(0.18 * sin(0.031 * sceneTime)) * rd.xz;
    rd.yz = rot2(0.12 * sin(0.023 * sceneTime + 1.0)) * rd.yz;
    rd.xy = rot2(0.02 * sceneTime) * rd.xy;
    float spin = (0.03 + 0.08 * clamp(spinP, 0.0, 1.0)) * sceneTime;
    float pulseRun = 0.5 * audioAdvance + 0.04 * sceneTime;
    float pulseAmp = 0.35 + 1.2 * clamp(audioOnset, 0.0, 1.0);
    vec3 col = vec3(0.0);
    float t = 0.05;
    for (int i = 0; i < 80; ++i) {
        vec3 x = ro + rd * t;
        vec3 cid = floor(x / CELL + 0.5);
        vec3 q = x - cid * CELL;
        float hc = fract(sin(dot(cid, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
        // the corridor's own row always, a third of the others
        bool here = (cid.x == 0.0 && cid.y == 0.0) || fract(hc * 7.13) < 0.33;
        q.xy = rot2(spin * (hc < 0.5 ? 1.0 : -1.0) + 6.2831853 * hc) * q.xy;
        float sa, sb;
        float da = knotDist(q / KS, kindA, sa);
        float db = knotDist(q / KS, kindB, sb);
        // the two kinds cross-fade in light (a blend of their distances would show neither)
        da = here ? KS * da - tube : 1e3;
        db = here ? KS * db - tube : 1e3;
        float d = min(da, db);
        float pa = pow(0.5 + 0.5 * cos(6.2831853 * (3.0 * sa - pulseRun + hc)), 12.0);
        float pb = pow(0.5 + 0.5 * cos(6.2831853 * (3.0 * sb - pulseRun + hc)), 12.0);
        float ga = (1.0 - hm) / (1.0 + pow(max(da, 0.0) * 30.0, 2.0));
        float gb = hm / (1.0 + pow(max(db, 0.0) * 30.0, 2.0));
        float pulse = (ga * pa + gb * pb) / max(ga + gb, 1e-4);
        vec3 c = famLight(fh, 0.15 + 0.7 * hc, 0.08 + 0.5 * pulse);
        float fade = exp(-0.09 * t) * smoothstep(0.05, 0.6, t);
        col += c * (ga + gb) * (0.55 + pulseAmp * pulse) * fade * 0.11;
        // never step past the cell's wall (an empty cell is crossed in one go)
        vec3 wall = (0.5 * CELL - abs(x - cid * CELL)) / max(abs(rd), 1e-3);
        t += clamp(0.6 * d, 0.03, min(wall.x, min(wall.y, wall.z)) + 0.03);
        if (t > 40.0) break;
    }
    col += famCol(fh, 0.5) * 0.015;
    finish(col);
}
