//@doc
 * @brief TAPERED MIRROR SPHERE: a kaleidoscope whose three mirrors taper toward the far end, seen from close up: the
 * images no longer lie in a plane but close into a sphere of facets round the eye -- the sphere fills the whole
 * frame and its facets run on past the edges.  Optics: tapered mirrors are the mirror planes of a polyhedral group
 * meeting at a point; a view direction is folded by those planes into one spherical triangle, the bounces counted,
 * and the content seen there.  The taper decides the group: tetrahedral, octahedral or icosahedral.  The content
 * is the photo, lit in one colour family; every bounce costs a tenth of the light.
 *
 * Audio Reactivity (structure, not only light):
 *   audioHarmAdvance -> the taper steps with the chord changes (tetrahedral, octahedral, icosahedral), the light of
 *                       two tapers cross-faded
 *   audioAdvance     -> the content turns inside the facets (integrated)
 *   audioSwell       -> the facets' edges glow
 *
 * Knobs: contentP (how large the photo's piece in a facet is), edgeP (the edges' brightness), hueP.
//@params contentP edgeP
//@audio audioHarmAdvance audioSwell
//@body
/**  Fold a direction by the mirror planes of a polyhedral group (reflect across any of the chamber's three walls it
 * lies behind, again and again), counting the reflections.
 *
 * @param d     The direction. (in)
 * @param kind  0 tetrahedral, 1 octahedral, 2 icosahedral. (in)
 * @param n     Returns the number of reflections. (out)
 * @param e     Returns the distance to the nearest mirror plane. (out)
 *
 * @return
 *   The folded direction.
 **/
vec3 groupFold(vec3 d, float kind, out float n, out float e)
{
    // the chamber's three walls (dot >= 0 inside): tetrahedral x >= y >= |z|; octahedral x >= y >= z >= 0;
    // icosahedral x >= 0, y >= 0 and the plane with normal (-0.809, -0.5, 0.309)
    vec3 m1 = kind < 1.5 ? vec3(0.7071068, -0.7071068, 0.0) : vec3(1.0, 0.0, 0.0);
    vec3 m2 = kind < 1.5 ? vec3(0.0, 0.7071068, -0.7071068) : vec3(0.0, 1.0, 0.0);
    vec3 m3 = kind < 0.5 ? vec3(0.0, 0.7071068, 0.7071068) : kind < 1.5 ? vec3(0.0, 0.0, 1.0) : vec3(-0.809017, -0.5, 0.309017);
    n = 0.0;
    for (int i = 0; i < 12; ++i) {
        float a = dot(d, m1);
        if (a < 0.0) { d -= 2.0 * a * m1; n += 1.0; }
        float b = dot(d, m2);
        if (b < 0.0) { d -= 2.0 * b * m2; n += 1.0; }
        float c = dot(d, m3);
        if (c < 0.0) { d -= 2.0 * c * m3; n += 1.0; }
    }
    e = min(dot(d, m1), min(dot(d, m2), dot(d, m3)));
    return d;
}

/**  The light seen through the tapered mirrors in a direction.
 *
 * @param d     The view direction. (in)
 * @param kind  The group. (in)
 * @param turn  The content's turn. (in)
 * @param sz    The content's size. (in)
 * @param fh    The colour family. (in)
 * @param e     Returns the distance to the facet's edge. (out)
 *
 * @return
 *   The light.
 **/
vec3 facetLight(vec3 d, float kind, float turn, float sz, float fh, out float e)
{
    float n;
    vec3 f = groupFold(d, kind, n, e);
    // seen from the chamber's middle: project onto the plane across it
    vec3 mid = kind < 0.5 ? vec3(0.9486833, 0.3162278, 0.0) : kind < 1.5 ? vec3(0.8017837, 0.5345225, 0.2672612)
                          : vec3(0.1455, 0.194, 0.97);
    vec3 u1 = normalize(cross(mid, vec3(0.0, 0.3, 1.0)));
    vec3 u2 = cross(mid, u1);
    vec2 uv = rot2(turn) * (vec2(dot(f, u1), dot(f, u2)) / max(dot(f, mid), 0.2)) / sz + 0.5;
    vec3 photo = imgLod(uv, 1.0 + 0.3 * n);
    vec3 c = famCol(fh, 0.15 + 0.7 * luma(photo)) * (0.3 + 1.2 * luma(photo));
    return c * pow(0.9, n);
}

void main()
{
    vec2 p = screenP();
    float fh = famHue();
    float h = max(audioHarmAdvance, 0.0);
    float hk = floor(h), hm = smoothstep(0.15, 0.85, h - hk);
    float kA = mod(hk, 3.0), kB = mod(hk + 1.0, 3.0);
    float turn = 0.04 * sceneTime + 0.2 * audioAdvance;
    float sz = 0.6 + 0.8 * clamp(contentP, 0.0, 1.0);
    float edgeK = (0.3 + 0.7 * clamp(edgeP, 0.0, 1.0)) * (0.6 + 0.8 * clamp(audioSwell, 0.0, 1.0));
    // the eye inside the sphere of images, looking out along a slowly wandering direction
    vec3 fw = normalize(vec3(0.3 * sin(0.03 * sceneTime), 0.25 * cos(0.025 * sceneTime), 1.0));
    vec3 rt = normalize(cross(fw, vec3(0.0, 1.0, 0.0)));
    vec3 up = cross(rt, fw);
    vec3 d = normalize(fw * 0.8 + rt * p.x + up * p.y);
    float eA, eB;
    vec3 cA = facetLight(d, kA, turn, sz, fh, eA);
    vec3 cB = facetLight(d, kB, turn, sz, fh, eB);
    vec3 col = mix(cA, cB, hm);
    float e = mix(eA, eB, hm);
    col *= smoothstep(0.0, 0.006, e);                            // the mirrors' meeting lines
    col += famLight(fh, 0.6, 0.5) * exp(-e / 0.004) * 0.12 * edgeK;
    finish(col);
}
