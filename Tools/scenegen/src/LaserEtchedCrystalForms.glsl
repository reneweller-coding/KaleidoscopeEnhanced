//@doc
 * @brief LASER ETCHED CRYSTAL FORMS: floating inside a block of clear glass into which forms have been etched as clouds
 * of tiny fractured points -- spheres, tori, octahedra and twisted rings, repeated through the block and surrounding
 * the eye -- the forms slowly changing into one another with the chords while the view drifts between them.  The
 * points are a skewed jittered lattice; a point shines where it lies in a thin shell round the surface of the form in
 * its cell; a form changes by cross-fading the two forms' shells.  The block is lit from below, so the points glow
 * brighter low in each form; their light is warm white, toned by the photo's colour family.
 *
 * Audio Reactivity (structure, not only light):
 *   audioHarmAdvance -> the forms change into one another with the chords (cross-faded)
 *   audioAdvance     -> the view drifts through the block (integrated)
 *   audioSwell       -> the points' glow
 *
 * Knobs: dotP (the points' spacing), cellP (the forms' spacing), hueP.
//@params dotP cellP
//@audio audioHarmAdvance audioSwell
//@body
/**  The distance to an etched form.
 *
 * @param q     The point (the form's centre at 0). (in)
 * @param kind  0 sphere, 1 torus, 2 octahedron, 3 twisted ring. (in)
 *
 * @return
 *   The distance (roughly).
 **/
float formD(vec3 q, float kind)
{
    float k = mod(kind, 4.0);
    if (k < 0.5) return length(q) - 0.28;
    if (k < 1.5) return length(vec2(length(q.xz) - 0.26, q.y)) - 0.07;
    if (k < 2.5) return (abs(q.x) + abs(q.y) + abs(q.z) - 0.36) * 0.577;
    float a = atan(q.z, q.x);
    vec2 r = vec2(length(q.xz) - 0.25, q.y);
    r = rot2(1.5 * a) * r;
    return length(max(abs(r) - vec2(0.09, 0.03), 0.0)) - 0.01;
}

void main()
{
    vec2 p = screenP();
    float fh = famHue();
    float D = 0.028 - 0.01 * clamp(dotP, 0.0, 1.0);
    float L = 0.9 + 0.4 * clamp(cellP, 0.0, 1.0);
    float h = max(audioHarmAdvance, 0.0);
    float hk = floor(h), hm = smoothstep(0.15, 0.85, h - hk);
    float fly = 0.08 * sceneTime + 0.3 * audioAdvance;
    float glow = 0.6 + 0.6 * clamp(audioSwell, 0.0, 1.0);
    vec3 ro = vec3(0.5 * L + 0.12 * sin(0.3 * fly), 0.5 * L + 0.1 * cos(0.23 * fly), fly);
    vec3 rd = normalize(vec3(p, 1.2));
    rd.xz = rot2(0.25 * sin(0.04 * fly)) * rd.xz;
    rd.yz = rot2(0.2 * sin(0.03 * fly + 1.0)) * rd.yz;
    const mat3 SKEW = mat3(0.9287, 0.0000, -0.3709, 0.1778, 0.8776, 0.4452, 0.3255, -0.4794, 0.8150);
    vec3 col = vec3(0.0);
    float t = 0.1;
    for (int i = 0; i < 120; ++i) {
        vec3 x = ro + rd * t;
        // the nearest candidate point of the skewed jittered lattice
        vec3 dc = floor(SKEW * x / D);
        float hd = fract(sin(dot(dc, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
        vec3 dp = ((dc + 0.5 + 0.6 * (fract(hd * vec3(3.1, 5.7, 7.3)) - 0.5)) * D) * SKEW;
        float d = length(cross(dp - ro, rd));
        vec3 cid = floor(dp / L);
        vec3 q = dp - (cid + 0.5) * L;
        float own = floor(4.0 * fract(sin(dot(cid, vec3(7.1, 3.3, 5.9))) * 4375.85));
        q.xz = rot2(6.2831853 * fract(own * 0.37 + 0.1 * dot(cid, vec3(1.0, 2.0, 3.0)))) * q.xz;
        float sA = exp(-pow(formD(q, hk + own) / 0.014, 2.0)), sB = exp(-pow(formD(q, hk + 1.0 + own) / 0.014, 2.0));
        float shell = (1.0 - hm) * sA + hm * sB;
        float below = 0.55 + 0.6 * smoothstep(0.3, -0.3, q.y);       // lit from below
        float lit = exp(-pow(d / (0.16 * D), 2.0)) * shell * below;
        col += famLight(fh, 0.3 + 0.4 * hd, 0.75) * lit * exp(-0.3 * t) * 0.9;
        t += D * 0.7;
    }
    col = col * glow + famCol(fh, 0.5) * 0.015;
    finish(col);
}
