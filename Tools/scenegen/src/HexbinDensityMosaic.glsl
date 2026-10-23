//@doc
 * @brief HEXBIN DENSITY MOSAIC: a hexagon binning: the photo is counted in honeycombs, and each cell shows the density of the pixels in its colour as a raised shading; the size of the cells glides so the picture walks from fine to coarse and back.  The cells'
 * heights follow how much structure the photo has under each cell.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance -> the cell size glides (integrated)
 *   audioSwell   -> the height of the relief
 *
 * Knobs: sizeP (the largest cell), hueP.
//@params sizeP
//@audio audioSwell audioAdvance
//@body
void main()
{
    vec2 fc = gl_FragCoord.xy;
    float px = resolution.y / 270.0;
    float big = 18.0 + 22.0 * clamp(sizeP, 0.0, 1.0);
    float Sb = exp(mix(log(5.0), log(big), 0.5 + 0.5 * sin(0.05 * sceneTime + 0.03 * audioAdvance)));
    float S = Sb * px;
    vec2 q = fc / S;
    vec2 r = vec2(1.0, 1.7320508);
    vec2 h = r * 0.5;
    vec2 a = mod(q, r) - h;
    vec2 b = mod(q - h, r) - h;
    vec2 gv = dot(a, a) < dot(b, b) ? a : b;
    vec2 id = q - gv;
    vec2 cc = id * S;
    vec2 uvc = (cc - 0.5 * resolution) / resolution.y * 0.85 + 0.5;
    float lod = log2(Sb) - 0.2;
    vec3 c = imgLod(uvc, lod);
    float m2 = 0.0;
    for (int i = 0; i < 4; ++i) {
        float ang = 1.5707963 * float(i);
        m2 += abs(luma(imgLod(uvc + 0.4 * Sb / 270.0 * vec2(cos(ang), sin(ang)), lod - 1.0)) - luma(c));
    }
    float dens = clamp(m2 * 3.0, 0.0, 1.0);
    float hd = max(abs(gv.x) * 0.8660254 + abs(gv.y) * 0.5, abs(gv.y));
    float rim = smoothstep(0.5, 0.42, hd);
    float rel = 1.0 + (0.45 + 0.4 * clamp(audioSwell, 0.0, 1.0)) * (dens - 0.4) * (0.6 - hd * 1.1);
    vec3 col = c * rel * rim + (1.0 - rim) * vec3(0.03);
    finish(col * 1.15);
}
