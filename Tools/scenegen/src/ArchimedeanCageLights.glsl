//@doc
 * @brief ARCHIMEDEAN CAGE LIGHTS: Archimedean solids -- the cuboctahedron, the icosidodecahedron -- as cages of light
 * strung along the line of flight and all around it; as the eye comes near, a cage opens, its edges withdrawing
 * toward their middles until only short bars float in a ring, and the eye passes through.  Each solid is folded by
 * its mirror group onto half of one edge (the cube's group for the cuboctahedron, the icosahedron's for the other);
 * opening trims that half edge from the corner end.  One colour family from the photo.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSectionId/Age -> every new section turns the cages into the other solid, over six seconds
 *   audioSwell         -> the cages open wider (on top of the opening as the eye approaches)
 *   audioAdvance       -> the flight and the cages' turning (integrated)
 *   audioKick          -> the corners flash (light)
 *
 * Knobs: barP (the bars' thickness), spaceP (the cages' spacing), hueP.
//@params barP spaceP
//@audio audioSectionId audioSectionPrev audioSectionAge audioSwell audioKick
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

/**  The cuboctahedron's edges (corners (+-1,+-1,0) and permutations, scaled to radius 1.618): fold by the cube's
 * mirrors (sort x >= y >= z >= 0), then the half edge from the corner (1,1,0) to the edge's middle (1,.5,.5).
 *
 * @param x     The point. (in)
 * @param open  How far the edge has withdrawn from its corner, 0..1. (in)
 *
 * @return
 *   The distance to the nearest edge, and (y) to the nearest corner.
 **/
vec2 cuboctaEdges(vec3 x, float open)
{
    x = abs(x) / 1.1441;
    if (x.x < x.y) x.xy = x.yx;
    if (x.x < x.z) x.xz = x.zx;
    if (x.y < x.z) x.yz = x.zy;
    const vec3 V = vec3(1.0, 1.0, 0.0), M = vec3(1.0, 0.5, 0.5);
    return vec2(segD(x, mix(V, M, open), M), length(x - V)) * 1.1441;
}

/**  The icosidodecahedron's edges (corners at radius phi): fold by the icosahedral mirrors, then the half edge from
 * the corner (0,0,phi) to the edge's middle.
 *
 * @param x     The point. (in)
 * @param open  How far the edge has withdrawn from its corner, 0..1. (in)
 *
 * @return
 *   The distance to the nearest edge, and (y) to the nearest corner.
 **/
vec2 icosidodecaEdges(vec3 x, float open)
{
    const vec3 r2 = vec3(-0.809017, -0.5, 0.309017);
    for (int k = 0; k < 6; ++k) {
        x.xy = abs(x.xy);
        x -= 2.0 * min(dot(x, r2), 0.0) * r2;
    }
    const vec3 V = vec3(0.0, 0.0, 1.618034), M = vec3(0.4045085, 0.25, 1.4635255);
    return vec2(segD(x, mix(V, M, open), M), length(x - V));
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
    float CELL = 5.0 + 2.0 * clamp(spaceP, 0.0, 1.0);
    float kind = mix(mod(max(audioSectionPrev, 0.0), 2.0), mod(max(audioSectionId, 0.0), 2.0),
                     smoothstep(0.0, 6.0, audioSectionAge));
    float bar = 0.03 + 0.03 * clamp(barP, 0.0, 1.0);
    float swellOpen = 0.45 * clamp(audioSwell, 0.0, 1.0);
    float kick = clamp(audioKick, 0.0, 1.0);
    float fly = 0.45 * sceneTime + 2.0 * audioAdvance;
    float spin = 0.04 * sceneTime + 0.25 * audioAdvance;
    vec3 ro = vec3(0.25 * sin(0.05 * fly), 0.2 * cos(0.04 * fly), fly);   // through the cages' centres
    vec3 rd = normalize(vec3(p, 1.1));
    rd.xz = rot2(0.25 * sin(0.022 * sceneTime)) * rd.xz;
    rd.yz = rot2(0.18 * sin(0.018 * sceneTime + 1.0)) * rd.yz;
    vec3 col = vec3(0.0);
    float t = 0.05;
    for (int i = 0; i < 100; ++i) {
        vec3 x = ro + rd * t;
        vec3 cid = floor(x / CELL + 0.5);
        vec3 q0 = x - cid * CELL;
        float hc = fract(sin(dot(cid, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
        // a cage opens as the eye comes near it
        float near = 1.0 - smoothstep(0.6 * CELL, 1.6 * CELL, length(cid * CELL - ro));
        float open = clamp(0.85 * near + swellOpen, 0.0, 0.92);
        vec3 q = axisRot(normalize(fract(hc * vec3(3.1, 5.7, 7.3)) - 0.5 + vec3(0.0, 0.0, 0.01)),
                         spin * (0.5 + hc) + 6.2831853 * hc) * q0;
        float sc = 1.3;
        vec2 dA = cuboctaEdges(q / sc, open) * sc;
        vec2 dB = icosidodecaEdges(q / sc, open) * sc;
        // the two solids cross-fade in light (a blend of their distances would show neither)
        float de = min(dA.x, dB.x) - bar;
        float g = (1.0 - kind) / (1.0 + pow(max(dA.x - bar, 0.0) * 28.0, 2.0)) + kind / (1.0 + pow(max(dB.x - bar, 0.0) * 28.0, 2.0));
        float gv = ((1.0 - kind) * exp(-pow(dA.y / (4.0 * bar), 2.0)) + kind * exp(-pow(dB.y / (4.0 * bar), 2.0)))
                   * (1.0 - open) * (0.3 + 2.0 * kick);
        float fade = exp(-0.07 * t) * smoothstep(0.05, 0.5, t);
        col += (famLight(fh, 0.2 + 0.6 * hc, 0.15) * g + famLight(fh, 0.6, 0.6) * gv) * fade * 0.08;
        vec3 wall = (0.5 * CELL - abs(q0)) / max(abs(rd), 1e-3);
        t += clamp(0.6 * de, 0.02, max(min(wall.x, min(wall.y, wall.z)), 0.0) + 0.03);
        if (t > 45.0) break;
    }
    col += famCol(fh, 0.5) * 0.012;
    finish(col);
}
