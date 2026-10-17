//@doc
 * @brief TEXTURE SYNTHESIS GROWTH: new, never-seen surfaces grown from the photo's own patterns -- by-example noise:
 * on a triangle lattice every corner takes the photo from a random place, and the three patches meeting in each
 * triangle are blended so that their variance is kept, so the result has the photo's grain and colour but none of
 * its places.  The synthesis spreads outward from the middle over the plain photo when the scene begins, then the
 * lattice keeps sliding, new patches welling up all the time; the patch size changes with the harmony.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the lattice slides: new patches well up (integrated: the music's drive)
 *   audioHarmAdvance -> each change of harmony changes the patch size (crossfaded)
 *
 * Knobs: patchP (the base patch size), mixP (how far the patches overlap), photoP (photo share), hueP.
//@params patchP mixP photoP
//@audio audioHarmAdvance
//@body
/**  By-example noise: the photo re-assembled on a triangle lattice from patches at random places.
 *
 * @param x     The point in lattice units. (in)
 * @param pz    The patches' size in the photo. (in)
 * @param seed  The lattice's seed. (in)
 * @param sharp How sharply the patches meet (higher: less overlap). (in)
 *
 * @return
 *   The synthesised colour.
 **/
vec3 synth(vec2 x, float pz, float seed, float sharp)
{
    vec2 sk = vec2(x.x - x.y * 0.57735, x.y * 1.1547);          // skew onto the triangle lattice
    vec2 b = floor(sk), f = fract(sk);
    vec2 v0, v1, v2;
    vec3 w;
    if (f.x + f.y < 1.0) { v0 = b; v1 = b + vec2(1.0, 0.0); v2 = b + vec2(0.0, 1.0); w = vec3(1.0 - f.x - f.y, f.x, f.y); }
    else { v0 = b + vec2(1.0, 1.0); v1 = b + vec2(0.0, 1.0); v2 = b + vec2(1.0, 0.0); w = vec3(f.x + f.y - 1.0, 1.0 - f.x, 1.0 - f.y); }
    w = pow(w, vec3(sharp));
    w /= dot(w, vec3(1.0));
    vec3 mean = imgLod(vec2(0.5), 9.0);
    vec3 acc = vec3(0.0);
    for (int i = 0; i < 3; ++i) {
        vec2 v = i == 0 ? v0 : (i == 1 ? v1 : v2);
        vec2 off = hash22(v + seed * 17.0);
        float ang = 6.2831853 * hash21(v + seed * 5.0 + 0.5);
        vec2 uv = off * 0.7 + 0.15 + rot2(ang) * (x - v) * pz;
        acc += (imgLod(uv, 0.4) - mean) * (i == 0 ? w.x : (i == 1 ? w.y : w.z));
    }
    return mean + acc / sqrt(dot(w, w));                        // keeps the variance where the patches blend
}

void main()
{
    vec2 p = screenP();
    float h = max(audioHarmAdvance, 0.0);
    float g = smoothstep(0.2, 0.8, fract(h));
    float sA = 2.5 + 1.5 * hash11(floor(h) * 1.7 + 0.3) + 2.0 * clamp(patchP, 0.0, 1.0);
    float sB = 2.5 + 1.5 * hash11((floor(h) + 1.0) * 1.7 + 0.3) + 2.0 * clamp(patchP, 0.0, 1.0);
    float sharp = 1.0 + 4.0 * (1.0 - clamp(mixP, 0.0, 1.0));
    vec2 slide = vec2(0.04 * sceneTime + 0.15 * audioAdvance, 0.017 * sceneTime);
    vec3 cA = synth(p * sA + slide, 0.11, floor(h), sharp);
    vec3 cB = g > 0.001 ? synth(p * sB + slide, 0.11, floor(h) + 1.0, sharp) : cA;
    vec3 syn = mix(cA, cB, g);
    // the synthesis grows outward from the middle over the plain photo as the scene begins
    vec3 photo = imgLod(p * 0.5 + 0.5, 0.0);
    float front = 0.1 + 0.12 * sceneTime;
    float grown = smoothstep(front, front - 0.25, length(p) + 0.15 * fbm(p * 3.0));
    vec3 col = mix(photo, syn, grown * (1.0 - 0.3 * clamp(photoP, 0.0, 1.0)));
    finish(max(col, 0.0) * 1.05);
}
