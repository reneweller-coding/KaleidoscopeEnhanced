//@doc
 * @brief TRIANGLE MEDIAL RECURSION: the triangle cut into its four medial triangles, the middle one turned over (mirrored), and so on to the pixel:
 * the photo in an endless triangle spiral, mirrored in every inverted triangle.  The depth follows the phrase, one more level fading in
 * as the finest fades out, and the whole picture turns slowly.
 *
 * Audio Reactivity (structure, not only light):
 *   audioPhrasePos  -> the depth flows with the phrase (cross-faded, continuous)
 *   audioAdvance    -> the picture turns (integrated)
 *   audioSwell      -> the triangles' shading
 *
 * Knobs: baseP (the depth it flows around), hueP.
//@params baseP
//@audio audioPhrasePos audioSwell
//@body
/**  The colour of the medial triangle recursion at a place, to a given depth.
 *
 * @param bary   The place in barycentric coordinates of the big triangle. (in)
 * @param depth  The number of levels. (in)
 *
 * @return
 *   The colour.
 **/
vec3 triMedial(vec3 bary, int depth)
{
    float flips = 0.0;
    float path = 0.0;
    for (int i = 0; i < 9; ++i) {
        if (i >= depth) break;
        if (bary.x > 0.5) { bary = vec3(2.0 * bary.x - 1.0, 2.0 * bary.y, 2.0 * bary.z); path = path * 3.0 + 1.0; }
        else if (bary.y > 0.5) { bary = vec3(2.0 * bary.x, 2.0 * bary.y - 1.0, 2.0 * bary.z); path = path * 3.0 + 2.0; }
        else if (bary.z > 0.5) { bary = vec3(2.0 * bary.x, 2.0 * bary.y, 2.0 * bary.z - 1.0); path = path * 3.0 + 0.0; }
        else { bary = vec3(1.0) - 2.0 * bary; flips += 1.0; path = path * 3.0 + 1.5; }
    }
    vec2 A = vec2(0.0, 2.4), B = vec2(-1.8, -0.6), C = vec2(1.8, -0.6);
    vec2 pt = bary.x * A + bary.y * B + bary.z * C;
    vec2 uv = pt * 0.35 + 0.5;
    vec3 col = imgLod(uv, 0.5 + 0.9 * float(depth));
    float edge = min(bary.x, min(bary.y, bary.z));
    return col * (0.85 + 0.2 * smoothstep(0.0, 0.05, edge)) * (0.9 + 0.12 * mod(flips, 2.0));
}
void main()
{
    vec2 p = screenP();
    float t = 0.03 * sceneTime + 0.15 * audioAdvance;
    vec2 q = rot2(0.1 * sin(t)) * p;
    vec2 A = vec2(0.0, 2.4), B = vec2(-1.8, -0.6), C = vec2(1.8, -0.6);
    vec2 v0 = B - A, v1 = C - A, v2 = q - A;
    float d00 = dot(v0, v0), d01 = dot(v0, v1), d11 = dot(v1, v1), d20 = dot(v2, v0), d21 = dot(v2, v1);
    float den = d00 * d11 - d01 * d01;
    float bv = (d11 * d20 - d01 * d21) / den, bw = (d00 * d21 - d01 * d20) / den;
    vec3 bary = vec3(1.0 - bv - bw, bv, bw);
    vec3 col;
    if (bary.x < 0.0 || bary.y < 0.0 || bary.z < 0.0) {
        bary = clamp(bary, 0.0, 1.0);
        bary /= max(bary.x + bary.y + bary.z, 1e-3);
    }
    float d = 2.5 + 2.0 * clamp(baseP, 0.0, 1.0) + 1.2 * sin(6.2831853 * clamp(audioPhrasePos, 0.0, 1.0));
    int di = int(floor(d));
    col = mix(triMedial(bary, di), triMedial(bary, di + 1), smoothstep(0.55, 1.0, fract(d)));
    finish(col * (0.95 + 0.15 * clamp(audioSwell, 0.0, 1.0)));
}
