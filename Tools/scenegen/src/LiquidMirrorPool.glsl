//@doc
 * @brief LIQUID MIRROR POOL: a pool of quicksilver seen at a slant, its surface a perfect mirror, reflecting a photo
 * kaleidoscope hanging above it -- and waves run over the pool and bend the reflection into ripples and wobbles.
 * Optics: the view ray hits the pool plane, the waves' height field gives the surface normal there, the ray is
 * reflected about it and followed up to the kaleidoscope's plane above; Fresnel makes the far pool brighter.  The
 * waves: a broad swell rolling across, and rings spreading from a few points.  One colour family from the photo.
 *
 * Audio Reactivity (structure, not only light):
 *   audioBass    -> the broad swell's height
 *   audioOnset   -> the rings' height (small: the pool trembles, it does not jump)
 *   audioAdvance -> the waves run and the kaleidoscope above turns (integrated)
 *
 * Knobs: foldP (the kaleidoscope's sides), waveP (the waves' base height), hueP.  Distinct from LiquidMetal, which
 * shows flowing metal.
//@params foldP waveP
//@audio audioBass audioOnset
//@body
/**  The pool's wave height and its slope at a point.
 *
 * @param x     The point on the pool. (in)
 * @param run   The waves' phase. (in)
 * @param base  The swell's height. (in)
 * @param ring  The rings' height. (in)
 *
 * @return
 *   The slope (dh/dx, dh/dz).
 **/
vec2 poolSlope(vec2 x, float run, float base, float ring)
{
    vec2 g = vec2(0.0);
    // the broad swell: two long waves crossing
    vec2 k1 = vec2(0.9, 0.4), k2 = vec2(-0.5, 0.85);
    g += base * (k1 * 2.2 * cos(dot(x, k1) * 2.2 - 1.3 * run) + k2 * 1.7 * cos(dot(x, k2) * 1.7 - run + 1.0)) * 0.5;
    // the rings from four points
    for (int i = 0; i < 4; ++i) {
        float fi = float(i);
        vec2 c = vec2(1.6 * sin(1.9 * fi + 0.3), 2.0 + 1.5 * cos(2.7 * fi));
        vec2 d = x - c;
        float r = length(d) + 1e-4;
        float w = cos(9.0 * r - 3.0 * run - 2.0 * fi) * exp(-0.6 * r);
        g += ring * (d / r) * 9.0 * w * 0.08;
    }
    return g;
}

void main()
{
    vec2 p = screenP();
    float fh = famHue();
    float sides = floor(5.0 + 4.0 * clamp(foldP, 0.0, 1.0));
    float base = (0.05 + 0.08 * clamp(waveP, 0.0, 1.0)) * (0.5 + 1.0 * clamp(audioBass, 0.0, 1.0));
    float ring = 0.02 + 0.06 * clamp(audioOnset, 0.0, 1.0);
    float run = 0.5 * sceneTime + 2.0 * audioAdvance;
    float turn = 0.03 * sceneTime + 0.15 * audioAdvance;
    // the eye above the pool, looking down at a slant
    vec3 ro = vec3(0.0, 1.0, 0.0);
    vec3 rd = normalize(vec3(p.x, p.y - 0.55, 1.0));
    float t = -ro.y / min(rd.y, -0.02);
    vec2 hit = ro.xz + rd.xz * t;
    vec2 g = poolSlope(hit, run, base, ring);
    vec3 n = normalize(vec3(-g.x, 1.0, -g.y));
    vec3 r = reflect(rd, n);
    // up to the kaleidoscope's plane, 3 units above the pool
    float up = (3.0 - 0.0) / max(r.y, 0.05);
    vec2 sky = hit + r.xz * up;
    vec2 k = kaleidoUV(rot2(turn) * sky * 0.12 + 0.5, sides);
    vec3 photo = imgLod(k, 0.8);
    vec3 refl = famCol(fh, 0.15 + 0.7 * luma(photo)) * (0.25 + 1.2 * luma(photo));
    float cosI = max(dot(-rd, n), 0.0);
    float fres = 0.7 + 0.3 * pow(1.0 - cosI, 5.0);                // quicksilver: a strong mirror at every angle
    vec3 col = refl * fres * smoothstep(40.0, 8.0, t);
    // the far pool fades into a haze of the same colour
    col += famCol(fh, 0.45) * 0.05 * smoothstep(6.0, 30.0, t);
    finish(col);
}
