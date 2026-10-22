//@doc
 * @brief GLASS GYROID REFRACTION: a gyroid of clear glass stands before the photo -- an endless sponge of curved
 * channels -- and the view drifts through it: the photo is seen broken and bent through the glass walls, the walls'
 * edges catch the light and caustic lines run over their faces.  The glass is the shell |g| < thickness round the
 * gyroid g = sin x cos y + sin y cos z + sin z cos x.  The ray steps through it and bends at every wall it crosses
 * (refraction by the wall's normal, total reflection where it must), a Fresnel share of each crossing reflects the
 * room's light; at the end the bent ray looks up the photo.  The photo's colours, calmed toward one colour family.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell   -> the glass' thickness: the channels narrow as the music swells
 *   audioAdvance -> the view drifts through the gyroid (integrated) and the caustics run
 *
 * Knobs: cellP (the channels' size), bendP (the glass' refractive index), hueP.
//@params cellP bendP
//@audio audioSwell
//@body
/**  The photo's colour calmed toward the colour family.
 *
 * @param photo  The photo's colour. (in)
 * @param fh     The family's hue. (in)
 *
 * @return
 *   The colour.
 **/
vec3 tone(vec3 photo, float fh)
{
    float l = luma(photo);
    return mix(photo * 1.1, famCol(fh, 0.15 + 0.7 * l) * (0.25 + 1.2 * l), 0.45);
}

/**  The gyroid's value at a point.
 *
 * @param y  The point (in gyroid units). (in)
 *
 * @return
 *   sin x cos y + sin y cos z + sin z cos x.
 **/
float gyroid(vec3 y)
{
    return dot(sin(y), cos(y.yzx));
}

void main()
{
    vec2 p = screenP();
    float fh = famHue();
    float sc = 3.0 + 2.0 * clamp(cellP, 0.0, 1.0);
    float ior = 1.15 + 0.3 * clamp(bendP, 0.0, 1.0);
    float thick = 0.15 + 0.35 * clamp(audioSwell, 0.0, 1.0);
    float fly = 0.08 * sceneTime + 0.3 * audioAdvance;
    float run = 0.2 * sceneTime + 0.6 * audioAdvance;
    vec3 x = vec3(0.3 * sin(0.21 * fly), 0.25 * cos(0.17 * fly), fly);
    vec3 dir = normalize(vec3(p, 1.3));
    dir.xz = rot2(0.25 * sin(0.05 * fly)) * dir.xz;
    dir.yz = rot2(0.2 * sin(0.04 * fly + 1.0)) * dir.yz;
    vec3 glow = vec3(0.0);
    vec3 trans = vec3(1.0);
    vec3 tint = mix(vec3(1.0), famCol(fh, 0.5), 0.12);
    float prev = abs(gyroid(x * sc)) - thick;
    for (int i = 0; i < 72; ++i) {
        x += dir * 0.04;
        vec3 y = x * sc;
        float gv = gyroid(y);
        float s = abs(gv) - thick;
        if (s * prev < 0.0) {
            // a wall: its outward normal is the shell's gradient
            vec3 sn = sin(y), cn = cos(y);
            vec3 grad = vec3(cn.x * cn.y - sn.z * sn.x, -sn.x * sn.y + cn.y * cn.z, -sn.y * sn.z + cn.z * cn.x);
            vec3 n = normalize(grad * sign(gv) + 1e-5);
            bool entering = s < 0.0;
            vec3 N = entering ? n : -n;
            if (dot(dir, N) > 0.0) N = -N;
            float eta = entering ? 1.0 / ior : ior;
            float cosi = -dot(dir, N);
            float fres = 0.04 + 0.96 * pow(1.0 - cosi, 5.0);
            // the caustic web over the wall's face
            float cg = gyroid(y * 2.7 + vec3(run, -0.7 * run, 0.4 * run));
            float caus = exp(-cg * cg * 14.0);
            glow += trans * famLight(fh, 0.4 + 0.3 * caus, 0.7) * (fres * 0.9 + 0.12 * caus);
            vec3 rf = refract(dir, N, eta);
            dir = dot(rf, rf) > 0.0 ? normalize(rf) : reflect(dir, N);
            trans *= (1.0 - fres) * tint;
        }
        prev = s;
    }
    vec2 uv = 0.5 + 0.45 * dir.xy / max(dir.z, 0.25);
    vec3 col = tone(imgLod(uv, 0.8), fh) * trans + glow * 0.6;
    finish(col);
}
