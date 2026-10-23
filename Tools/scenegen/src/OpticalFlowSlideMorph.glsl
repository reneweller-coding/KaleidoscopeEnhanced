//@doc
 * @brief OPTICAL FLOW SLIDE MORPH: a morph that slides the pixels of the first photo along the gradient of its difference to the second instead of blending: the shapes slide into one another, edges flowing to edges, and in the
 * middle of the phrase the second photo stands where the first was, and slides back out of it again by the end.  The slide's reach follows the swell.
 *
 * Audio Reactivity (structure, not only light):
 *   audioPhrasePos  -> the degree of the morph (the first photo at the phrase's start and end, the second in the middle)
 *   audioSwell      -> the reach of the sliding
 *
 * Knobs: flowP (the smoothness of the flow field), hueP.
//@params flowP
//@audio audioSwell
//@body
void main()
{
    vec2 p = screenP();
    vec2 uv = p * 0.8 + 0.5;
    float lod = 2.0 + 2.0 * clamp(flowP, 0.0, 1.0);
    float e = 0.006 * (1.0 + lod);
    float d0 = luma(imgB(uv, lod)) - luma(imgLod(uv, lod));
    float dx = (luma(imgB(uv + vec2(e, 0.0), lod)) - luma(imgLod(uv + vec2(e, 0.0), lod))) - (luma(imgB(uv - vec2(e, 0.0), lod)) - luma(imgLod(uv - vec2(e, 0.0), lod)));
    float dy = (luma(imgB(uv + vec2(0.0, e), lod)) - luma(imgLod(uv + vec2(0.0, e), lod))) - (luma(imgB(uv - vec2(0.0, e), lod)) - luma(imgLod(uv - vec2(0.0, e), lod)));
    vec2 flow = vec2(dx, dy) / (2.0 * e) * d0;
    float m = 0.5 - 0.5 * cos(6.2831853 * rhyPhrase());
    float reach = 0.1 + 0.18 * clamp(audioSwell, 0.0, 1.0);
    vec3 a = imgLod(uv - flow * reach * m, 0.7);
    vec3 b = imgB(uv + flow * reach * (1.0 - m), 0.7);
    finish(mix(a, b, smoothstep(0.2, 0.8, m)) * 1.05);
}
