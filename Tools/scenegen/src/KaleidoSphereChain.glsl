//@doc
 * @brief KALEIDO SPHERE CHAIN: a chain of mirror spheres winding off into the depth, each sphere reflecting the world
 * round it -- and the world is a photo kaleidoscope, so every sphere holds a curved rosette, smaller and smaller down
 * the chain.  A sphere's normal at the point seen reflects the view ray; the reflected direction is folded into the
 * kaleidoscope's sector (its own symmetry per sphere) and read from the photo.  Between the spheres the same
 * kaleidoscope stands as a dim backdrop.  The photo's own colours, calmed toward one colour family.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance     -> the chain winds (integrated) and the eye glides along it
 *   audioHarmAdvance -> each sphere's symmetry glides with the chord changes (the light of two counts cross-faded)
 *   audioSwell       -> the spheres' highlights
 *
 * Knobs: sizeP (the spheres' size), windP (how far the chain winds), hueP.
//@params sizeP windP
//@audio audioHarmAdvance audioSwell
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

/**  The kaleidoscopic world in a direction: the direction's angle round the view axis folded into a sector.
 *
 * @param d      The direction. (in)
 * @param sides  The symmetry. (in)
 * @param fh     The colour family. (in)
 *
 * @return
 *   The light.
 **/
vec3 world(vec3 d, float sides, float fh)
{
    float sec = 6.2831853 / sides;
    float a = abs(mod(atan(d.y, d.x), sec) - 0.5 * sec);
    float el = acos(clamp(d.z, -1.0, 1.0)) / 3.14159265;
    vec2 uv = vec2(0.2 + 0.6 * el, 0.2 + 0.6 * a / (0.5 * sec));
    return tone(imgLod(uv, 0.8), fh);
}

void main()
{
    vec2 p = screenP();
    float fh = famHue();
    float h = max(audioHarmAdvance, 0.0);
    float R = 0.35 + 0.2 * clamp(sizeP, 0.0, 1.0);
    float wind = 0.6 + 0.8 * clamp(windP, 0.0, 1.0);
    float glide = 0.25 * sceneTime + 1.0 * audioAdvance;
    float hk = floor(h), hm = smoothstep(0.15, 0.85, h - hk);
    vec3 ro = vec3(0.0, 0.0, glide);
    vec3 rd = normalize(vec3(p, 1.1));
    rd.xy = rot2(0.02 * sceneTime) * rd.xy;
    // the chain: a sphere every 1.6 units along z, its centre on a winding path
    vec3 col = world(rd, 6.0, fh) * 0.25;
    float t = 0.2;
    for (int i = 0; i < 70; ++i) {
        vec3 x = ro + rd * t;
        float k = floor(x.z / 1.6 + 0.5);
        vec3 c = vec3(wind * vec2(sin(0.5 * k + 0.3), cos(0.37 * k)) * 0.9, k * 1.6);
        float d = length(x - c) - R;
        if (d < 0.002) {
            vec3 n = normalize(x - c);
            vec3 r = reflect(rd, n);
            float sA = 5.0 + mod(hk + k, 4.0), sB = 5.0 + mod(hk + 1.0 + k, 4.0);
            vec3 c3 = mix(world(r, sA, fh), world(r, sB, fh), hm);
            float fres = 0.6 + 0.4 * pow(1.0 - abs(dot(n, rd)), 3.0);
            float hl = pow(max(dot(r, normalize(vec3(0.3, 0.6, -0.7))), 0.0), 40.0);
            col = c3 * fres + famLight(fh, 0.6, 0.8) * hl * (0.3 + 0.6 * clamp(audioSwell, 0.0, 1.0));
            col *= exp(-0.06 * t);
            break;
        }
        t += d * 0.9;
        if (t > 40.0) break;
    }
    finish(col);
}
