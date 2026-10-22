//@doc
 * @brief SIERPINSKI DUST SPACE: a Sierpinski tetrahedron of glowing dust -- every finest sub-tetrahedron a point of
 * light -- and the eye sinks toward one of its corners without end: halving the distance shows the whole again,
 * because the corner's piece is the whole at half the size, so the zoom wraps after every factor two while the next
 * level's dust fades in.  The folds are the tetrahedron's three mirror planes, the scaling is about the corner.
 * One colour family from the photo, a shade for each level of the dust.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance -> the sinking (integrated): a level deeper every few seconds of drive
 *   audioOnset   -> one level of the dust flares up
 *   audioSwell   -> the dust's glow widens
 *
 * Knobs: dotP (the dust's size), turnP (how the view turns about the corner), hueP.
//@params dotP turnP
//@audio audioOnset audioSwell
//@body
/**  The Sierpinski tetrahedron (corners (1,1,1), (1,-1,-1), (-1,1,-1), (-1,-1,1)) folded n times.
 *
 * @param z    The point; returns it folded and scaled n times. (inout)
 * @param n    How many levels. (in)
 *
 * @return
 *   The scale gathered (2^n).
 **/
float sierpFold(inout vec3 z, int n)
{
    float s = 1.0;
    for (int i = 0; i < 12; ++i) {
        if (i >= n) break;
        if (z.x + z.y < 0.0) z.xy = -z.yx;
        if (z.x + z.z < 0.0) z.xz = -z.zx;
        if (z.y + z.z < 0.0) z.zy = -z.yz;
        z = z * 2.0 - vec3(1.0);
        s *= 2.0;
    }
    return s;
}

void main()
{
    vec2 p = screenP();
    float fh = famHue();
    const vec3 V = vec3(1.0, 1.0, 1.0);                          // the corner the eye sinks toward
    float sink = 0.08 * sceneTime + 0.35 * audioAdvance;
    float u = fract(sink);
    float lvl = floor(sink);
    float zs = exp2(-u);                                         // the frame's scale about V
    float dotR = 0.22 + 0.18 * clamp(dotP, 0.0, 1.0);
    float width = 1.0 + 0.8 * clamp(audioSwell, 0.0, 1.0);
    float flare = clamp(audioOnset, 0.0, 1.0);
    // the eye: inside the corner's region, looking toward the tetrahedron's centre, turning slowly
    float turn = (0.04 + 0.1 * clamp(turnP, 0.0, 1.0)) * sceneTime;
    vec3 axis = normalize(-V);
    vec3 side = normalize(cross(axis, vec3(0.0, 1.0, 0.0)));
    vec3 up0 = cross(side, axis);
    vec3 rt = cos(turn) * side + sin(turn) * up0, up = -sin(turn) * side + cos(turn) * up0;
    vec3 ro = V + axis * 0.55;
    vec3 fw = normalize(axis + 0.25 * rt * sin(0.05 * sceneTime) + 0.2 * up * cos(0.04 * sceneTime));
    vec3 rd = normalize(fw * 1.0 + rt * p.x + up * p.y);
    vec3 col = vec3(0.0);
    float t = 0.01;
    for (int i = 0; i < 90; ++i) {
        vec3 xf = ro + rd * t;
        vec3 xw = V + (xf - V) * zs;                             // the world point (zoomed about the corner)
        // two levels of dust: level 7 and the next, which fades in as the zoom passes a factor two
        vec3 z7 = xw;
        float s7 = sierpFold(z7, 7);
        vec3 z8 = z7;
        if (z8.x + z8.y < 0.0) z8.xy = -z8.yx;
        if (z8.x + z8.z < 0.0) z8.xz = -z8.zx;
        if (z8.y + z8.z < 0.0) z8.zy = -z8.yz;
        z8 = z8 * 2.0 - vec3(1.0);
        float d7 = (length(z7) - dotR) / s7 / zs;
        float d8 = (length(z8) - dotR) / (2.0 * s7) / zs;
        float w = 0.004 * width;
        float g7 = exp(-pow(max(d7, 0.0) / w, 2.0)) * (1.0 - u);
        float g8 = exp(-pow(max(d8, 0.0) / (0.7 * w), 2.0)) * u;
        float fl7 = 1.0 + 2.5 * flare * step(0.5, fract(0.5 * (lvl + 7.0)));
        float fl8 = 1.0 + 2.5 * flare * step(0.5, fract(0.5 * (lvl + 8.0)));
        float fade = exp(-0.9 * t) * smoothstep(0.0, 0.05, t);
        col += (famLight(fh, fract(0.13 * (lvl + 7.0)), 0.3 * g7) * g7 * fl7
                + famLight(fh, fract(0.13 * (lvl + 8.0)), 0.3 * g8) * g8 * fl8) * fade * 0.12;
        t += clamp(0.7 * min(d7, d8), 0.0015, 0.05);
        if (t > 2.5) break;
    }
    col += famCol(fh, 0.5) * 0.012;
    finish(famExpose(col, 1.90, 0.90, 0.00, fh));
}
