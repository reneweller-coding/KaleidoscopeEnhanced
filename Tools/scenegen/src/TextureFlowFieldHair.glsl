//@doc
 * @brief TEXTURE FLOW FIELD HAIR: the photograph combed into hair -- countless
 * fine strands follow a flowing field that curls around the picture's
 * forms, each strand taking the colour of the photo where it grows, with
 * a silky sheen band running across the strands like light on real hair;
 * the field sways slowly as if in a breeze.  Endless, mirrorable.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the sway (integrated, jump-free)
 *   audioSpread     -> the curls tighten
 *   audioKick       -> the sheen flares (light)
 *   audioMode       -> the sheen: cool in minor, warm in major
 *   audioRoughness  -> the strands frizz
 *   audioSwell      -> strand length (slow)
 *
 * Knobs: strandP (strand density), curlP (curl scale), sheenP, hueP.
//@params strandP curlP sheenP
//@audio audioSpread audioKick audioMode audioRoughness audioSwell
//@body
float gT, gC, gS;
vec2 fieldAt(vec2 x)
{
    float a = 6.2831853 * fbm3(x * gS + vec2(0.0, gT)) * gC;
    return vec2(cos(a), sin(a));
}

void main()
{
    vec2 p = screenP();
    float kick = clamp(audioKick, 0.0, 1.0);
    float swell = clamp(audioSwell, 0.0, 1.0);
    float mode = clamp(audioMode, 0.0, 1.0);
    float rough = clamp(audioRoughness, 0.0, 1.0);
    gT = 0.02 * sceneTime + 0.15 * audioAdvance;
    gC = 0.6 + 0.8 * clamp(audioSpread, 0.0, 1.0);
    gS = 0.8 + 1.5 * clamp(curlP, 0.0, 1.0);
    // Line integral convolution of noise along the field: strands.
    float fine = 150.0 + 250.0 * clamp(strandP, 0.0, 1.0);
    float stepL = 0.004 + 0.004 * swell;
    float acc = 0.0, wsum = 0.0;
    vec2 xf = p, xb = p;
    for (int i = 0; i < 14; ++i) {
        float w = 1.0 - float(i) / 14.0;
        xf += fieldAt(xf) * stepL;
        xb -= fieldAt(xb) * stepL;
        acc += (noise2(xf * fine) + noise2(xb * fine)) * w;
        wsum += 2.0 * w;
    }
    float strand = acc / wsum;
    strand = clamp((strand - 0.5) * (3.0 + 2.0 * (1.0 - rough)) + 0.5, 0.0, 1.0);
    vec2 uv = p * 0.5 + 0.5;
    vec3 ph = imgLod(uv, 2.0);
    vec3 col = ph * (0.45 + 0.75 * strand);
    // Sheen: a band where the strands lie across a light direction.
    vec2 v = fieldAt(p);
    float across = abs(dot(v, normalize(vec2(0.6, 0.8))));
    float band = exp(-pow(dot(p, vec2(0.8, -0.6)) - 0.5 * sin(0.03 * sceneTime), 2.0) * 6.0);
    vec3 sc = mix(vec3(0.85, 0.9, 1.0), vec3(1.0, 0.9, 0.75), mode);
    col += sc * pow(across, 8.0) * band * strand * (0.2 + 0.4 * clamp(sheenP, 0.0, 1.0)) * (1.0 + 1.5 * kick);
    col = mix(col, col * glowColour(ph, p, hueP * 0.159) * 1.2, 0.06);
    finish(col);
}
