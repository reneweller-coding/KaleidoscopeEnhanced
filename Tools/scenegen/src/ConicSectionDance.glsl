//@doc
 * @brief CONIC SECTION DANCE: a space full of unseen double cones, one in every cell, each standing its own way, and
 * through them a stack of planes; only where a plane cuts a cone does light appear -- circles, ellipses, parabolas,
 * hyperbolas, each passing into the next as the planes tilt -- and the eye flies through the drifting figures.  A
 * figure is where both the cone's and the plane's distances vanish, so the light is the length of the two.  The
 * planes are laid out within each cell, so nothing far away races.  One colour family from the photo.
 *
 * Audio Reactivity (structure, not only light):
 *   audioHarmAdvance -> the planes' tilt glides with every chord change: circles stretch to ellipses, open into
 *                       parabolas and hyperbolas
 *   audioSpread      -> how many planes: a broad spectrum packs them closer
 *   audioAdvance     -> the flight and the planes' slow drift through the cones (integrated)
 *   audioSwell       -> the curves' glow widens
 *
 * Knobs: openP (the cones' opening), lineP (the curves' thickness), hueP.
//@params openP lineP
//@audio audioHarmAdvance audioSpread audioSwell
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

void main()
{
    vec2 p = screenP();
    float fh = famHue();
    const float CELL = 4.0;
    float h = max(audioHarmAdvance, 0.0);
    float tilt = 0.75 + 0.55 * sin(0.8 * h) + 0.2 * sin(0.31 * h + 1.0);
    float half_ = 0.35 + 0.25 * clamp(openP, 0.0, 1.0);          // the cones' half angle
    float ca = cos(half_), sa = sin(half_);
    float sp = 0.5 - 0.2 * clamp(audioSpread, 0.0, 1.0);
    float width = (0.018 + 0.016 * clamp(lineP, 0.0, 1.0)) * (0.85 + 0.4 * clamp(audioSwell, 0.0, 1.0));
    float slide = 0.25 * audioAdvance + 0.02 * sceneTime;
    float fly = 0.3 * sceneTime + 1.3 * audioAdvance;
    vec3 ro = vec3(0.4 * sin(0.04 * fly), 0.35 * cos(0.035 * fly), fly);
    vec3 rd = normalize(vec3(p, 1.1));
    rd.xz = rot2(0.3 * sin(0.022 * sceneTime)) * rd.xz;
    rd.yz = rot2(0.2 * sin(0.018 * sceneTime + 1.0)) * rd.yz;
    const mat3 SKEW = mat3(0.9287, 0.0000, -0.3709, 0.1778, 0.8776, 0.4452, 0.3255, -0.4794, 0.8150);
    vec3 rdL = SKEW * rd;
    vec3 col = vec3(0.0);
    float t = 0.05;
    for (int i = 0; i < 100; ++i) {
        vec3 x = SKEW * (ro + rd * t);
        vec3 cid = floor(x / CELL);
        vec3 q0 = x - (cid + 0.5) * CELL;
        float hc = fract(sin(dot(cid, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
        vec3 q = axisRot(normalize(fract(hc * vec3(3.1, 5.7, 7.3)) - 0.5 + vec3(0.0, 0.0, 0.01)), 6.2831853 * hc) * q0;
        // the double cone round z, apex at the cell's centre
        float dc = (length(q.xy) * ca - abs(q.z) * sa);
        // the planes: normal tilted from the cone's axis by the music, stacked every sp
        vec3 n = vec3(sin(tilt) * cos(6.2831853 * hc), sin(tilt) * sin(6.2831853 * hc), cos(tilt));
        float u = dot(q, n) / sp + slide + hc;
        float dp = abs(u - floor(u + 0.5)) * sp;
        float d = length(vec2(dc, dp));
        float reach = smoothstep(1.9, 1.3, max(abs(q0.x), max(abs(q0.y), abs(q0.z))));
        float g = exp(-pow(d / width, 2.0)) + 0.1 * width * width / (width * width + d * d);
        float fade = exp(-0.07 * t) * smoothstep(0.05, 0.5, t);
        col += famLight(fh, 0.15 + 0.7 * fract(hc * 3.3 + 0.1 * floor(u + 0.5)), 0.2 * exp(-pow(d / width, 2.0)))
               * g * reach * fade * 0.3;
        vec3 wall = (0.5 * CELL - abs(q0)) / max(abs(rdL), 1e-3);
        t += clamp(0.5 * d, 0.02, max(min(wall.x, min(wall.y, wall.z)), 0.0) + 0.03);
        if (t > 32.0) break;
    }
    col += famCol(fh, 0.5) * 0.012;
    finish(col);
}
