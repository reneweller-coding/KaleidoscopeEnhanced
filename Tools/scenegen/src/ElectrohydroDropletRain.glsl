//@doc
 * @brief ELECTROHYDRO DROPLET RAIN: drops falling through an electric field -- the field stretches every drop along
 * itself into a spindle, drops that come near draw each other in and fuse, and a drop stretched too far pinches in
 * the middle and parts into two.  A slow rain of round drops fills the frame, each a lens on the photo; as the field
 * swells the drops lengthen, necks form and break, and the rain becomes a falling lace.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell      -> the field: drops lengthen, pinch and split
 *   audioAdvance    -> the rain falls (integrated: the music's drive)
 *   audioKick       -> the drops' rims flash (light)
 *
 * Knobs: densityP (how many drops), sizeP (the drops' size), photoP (photo share), hueP.
//@params densityP sizeP photoP
//@audio audioSwell audioKick
//@body
void main()
{
    vec2 p = screenP();
    float E = 0.2 + 1.3 * clamp(audioSwell, 0.0, 1.0);
    float colW = 0.09 - 0.04 * clamp(densityP, 0.0, 1.0);
    float rBase = (0.018 + 0.012 * clamp(sizeP, 0.0, 1.0));
    float fall = 0.08 * sceneTime + 0.25 * audioAdvance;
    float F = 0.0;
    vec2 gradF = vec2(0.0);
    float nearestW = 0.0;
    vec2 nearestC = vec2(0.0);
    float colIdx = floor(p.x / colW);
    for (int ci = -1; ci <= 1; ++ci) {
        float cx = colIdx + float(ci);
        for (int k = 0; k < 3; ++k) {
            float hk = hash21(vec2(cx, float(k) * 3.1));
            float r = rBase * (0.7 + 0.6 * hk);
            float speed = 0.6 + 0.8 * r / rBase * 0.5;
            float y = 0.75 - mod(fall * speed + hk * 1.7 + float(k) * 0.57, 1.5);   // falls through, wraps above the frame
            float x = (cx + 0.3 + 0.4 * hash21(vec2(cx, float(k) + 9.0))) * colW + 0.01 * sin(3.0 * y + 6.0 * hk);
            // stretched along the field (vertical); a long drop is two lobes drifting apart
            float st = 1.0 + 0.9 * E * r / rBase;
            float sep = max(st - 1.6, 0.0) * r * 1.2;
            for (int lobe = 0; lobe < 2; ++lobe) {
                vec2 c = vec2(x, y + (lobe == 0 ? sep : -sep));
                vec2 d = (p - c) * vec2(1.0, 1.0 / min(st, 1.8));
                float dd = dot(d, d) + 1e-6;
                float w = r * r * 0.55 / dd;
                F += w;
                gradF += -2.0 * w / dd * d * vec2(1.0, 1.0 / min(st, 1.8));
                if (w > nearestW) { nearestW = w; nearestC = c; }
            }
        }
    }
    vec3 tone = imgPalette(0.55 + 0.03 * audioPhase);
    vec3 bg = imgLod(p * 0.5 + 0.5, 2.5) * 0.35;
    float inside = smoothstep(0.9, 1.1, F);
    vec2 nrm2 = -gradF / max(length(gradF), 1e-4);
    float edge = clamp(1.0 / max(F, 1e-3), 0.0, 1.0);          // 1 at the rim, smaller toward the middle
    vec2 lens = nrm2 * (1.0 - edge) * 0.04 + (p - nearestC) * 0.8;
    vec3 photo = imgLod(nearestC * 0.5 + 0.5 + lens, 0.4);
    vec3 drop = mix(tone * 1.2, photo * 1.5, 0.5 + 0.45 * clamp(photoP, 0.0, 1.0)) * (0.7 + 0.5 * (1.0 - edge));
    float rim = smoothstep(0.75, 1.0, edge) * inside;
    drop += mix(tone, vec3(1.0), 0.6) * rim * (0.3 + 0.6 * clamp(audioKick, 0.0, 1.0));
    drop += pow(max(dot(nrm2, normalize(vec2(-0.6, 0.8))), 0.0), 8.0) * (1.0 - edge) * 0.35;
    vec3 col = mix(bg, drop, inside);
    finish(col);
}
