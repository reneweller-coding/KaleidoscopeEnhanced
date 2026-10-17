//@doc
 * @brief GLASS MARBLE CASCADE: a stream of glass marbles pouring through the frame without a floor -- a close-packed
 * river of spheres sliding down and across, each one a little lens that turns the photo behind it upside down and
 * shrinks it, with a bright highlight and a darker rim where the glass bends the light away.  The marbles jostle
 * and roll as they pour; the stream keeps flowing with the music's drive.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the stream pours (integrated: the music's drive)
 *   audioPhase      -> the marbles roll (integrated)
 *   audioKick       -> the highlights flash (light)
 *
 * Knobs: sizeP (the marbles' size), refractP (how strongly they bend the photo), photoP (photo share), hueP.
//@params sizeP refractP photoP
//@audio audioKick
//@body
void main()
{
    vec2 p = screenP();
    float R = 0.04 + 0.03 * clamp(sizeP, 0.0, 1.0);
    float flow = 0.15 * sceneTime + 0.5 * audioAdvance;
    vec2 dir = normalize(vec2(0.35, -1.0));
    vec2 q = p - dir * flow;
    // a hexagonal packing, loosened so the marbles jostle
    vec2 a = vec2(2.0, 3.4641016) * R;
    vec3 col = imgLod(p * 0.4 + 0.5, 4.0) * 0.2;
    float bestZ = 0.0;
    for (int k = 0; k < 2; ++k) {
        vec2 off = k == 0 ? vec2(0.0) : 0.5 * a;
        vec2 cellId = floor((q - off) / a);
        for (int j = -1; j <= 1; ++j) for (int i = -1; i <= 1; ++i) {
            vec2 cc = cellId + vec2(float(i), float(j));
            vec2 h = hash22(cc + float(k) * 5.3);
            vec2 c = off + (cc + 0.5) * a + R * 0.12 * vec2(sin(sceneTime * (0.8 + h.x) + 6.28 * h.y), cos(sceneTime * (0.7 + h.y) + 6.28 * h.x));
            vec2 d = (q - c) / (R * 0.97);
            float r2 = dot(d, d);
            if (r2 >= 1.0) continue;
            float z = sqrt(1.0 - r2);
            if (z < bestZ) continue;
            bestZ = z;
            // the lens: the photo behind, seen through the sphere -- turned over and shrunk, bent more toward the rim
            float k2 = 0.4 + 0.5 * clamp(refractP, 0.0, 1.0);
            vec2 world = c + dir * flow;
            vec2 inside = -d * k2 * (0.6 + 0.4 * z) * 0.25;
            vec3 photo = imgLod(world * 0.5 + 0.5 + inside, 0.6);
            vec3 tone = imgPalette(h.x * 0.3 + 0.03 * audioPhase);
            vec3 g = mix(photo * tone * 1.6, photo * 1.3, 0.55 + 0.4 * clamp(photoP, 0.0, 1.0));
            g *= 0.45 + 0.55 * z;                               // the rim bends the light away
            float spin = 0.02 * audioPhase + h.y * 6.28;
            vec2 hl = d - 0.45 * vec2(cos(2.3 + 0.1 * spin), sin(2.3 + 0.1 * spin));
            g += pow(max(1.0 - length(hl) * 2.4, 0.0), 3.0) * (0.6 + 0.6 * clamp(audioKick, 0.0, 1.0));
            g += pow(1.0 - z, 4.0) * 0.25 * mix(tone, vec3(1.0), 0.5);   // the rim's sheen
            col = g;
        }
    }
    finish(col);
}
