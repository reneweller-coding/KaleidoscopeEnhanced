//@doc
 * @brief STOKESIAN SEDIMENTATION: clouds of small spheres sinking through a thick liquid -- a cloud falls faster than
 * any one sphere would, because it drags its liquid with it, and inside it the spheres circulate: down through the
 * middle, up round the sides, a pair of eddies in every slice.  As it falls the cloud flattens and widens into a
 * torus, its two eddies drift apart and it trails a fan of spheres leaking from its rear, until it splits in two.
 * Clouds fall one after another across the frame; every sphere is a round bead coloured by the photo.
 *
 * Audio Reactivity (structure, not only light):
 *   audioLevel      -> how many spheres fill the clouds
 *   audioAdvance    -> the clouds sink (integrated: the music's drive)
 *   audioKick       -> the beads flash (light)
 *
 * Knobs: cloudsP (how many clouds side by side), sizeP (the clouds' size), photoP (photo share), hueP.
//@params cloudsP sizeP photoP
//@audio audioKick
//@body
/**  The circulation inside a sinking cloud, in the cloud's own frame (radius 1): a pair of eddies centred at +-b.
 *
 * @param q  The point in the cloud's frame. (in)
 * @param b  The eddies' half spacing. (in)
 *
 * @return
 *   The velocity.
 **/
vec2 cloudFlow(vec2 q, float b)
{
    vec2 u = vec2(0.0);
    for (int s = 0; s < 2; ++s) {
        float sg = s == 0 ? 1.0 : -1.0;
        vec2 d = q - vec2(sg * b, 0.0);
        float r2 = dot(d, d) + 0.08;
        u += sg * vec2(d.y, -d.x) / r2 * 0.35;                  // down through the middle, up round the sides
    }
    return u;
}

void main()
{
    vec2 p = screenP();
    float nCols = floor(3.0 + 1.99 * clamp(cloudsP, 0.0, 1.0));
    float a0 = 0.12 + 0.05 * clamp(sizeP, 0.0, 1.0);
    float fill = 0.35 + 0.65 * clamp(audioLevel, 0.0, 1.0);
    float sink = 0.05 * sceneTime + 0.12 * audioAdvance;
    float colW = 1.7777778 / nCols;
    float sp = 0.012;
    vec3 tone = imgPalette(0.45 + 0.03 * audioPhase);
    vec3 col = imgLod(p * 0.3 + 0.5, 5.0) * 0.12;
    for (int c = 0; c < 5; ++c) {
        if (float(c) >= nCols) break;
        float hc = hash11(float(c) * 7.3 + 1.1);
        float prog = fract(sink * (0.8 + 0.4 * hc) + hc);       // the cloud's fall from top to bottom, then the next
        vec2 ctr = vec2(-0.8888889 + (float(c) + 0.5) * colW + 0.04 * sin(6.0 * prog + hc * 6.0), 0.75 - 1.5 * prog);
        float a = a0 * (1.0 + 0.7 * prog);                      // flattening and widening
        float b = 0.25 + 0.55 * prog;                           // the eddies drift apart
        vec2 q = (p - ctr) / vec2(a * (1.0 + 0.5 * prog), a * (1.0 - 0.35 * prog));
        // the envelope: the cloud, and a fan leaking upward behind it
        float env = smoothstep(1.25, 0.7, length(q)) + smoothstep(0.6, 0.0, abs(q.x) - 0.2 * max(q.y, 0.0)) * smoothstep(3.5, 0.8, q.y) * smoothstep(-0.1, 0.1, q.y) * 0.5;
        if (env < 0.01) continue;
        float fade = smoothstep(0.0, 0.08, prog) * (1.0 - smoothstep(0.9, 1.0, prog));
        for (int ph = 0; ph < 2; ++ph) {
            float f = fract(sceneTime / 2.5 + 0.5 * float(ph));
            float w = 1.0 - abs(2.0 * f - 1.0);
            vec2 x0 = q;
            for (int s = 0; s < 5; ++s) x0 -= cloudFlow(x0, b) * f * 0.5;
            vec2 g = x0 * a / sp + float(ph) * 0.39 + float(c) * 3.7;
            vec2 cell = floor(g);
            float best = 1e9;
            vec2 bestC = cell;
            for (int jj = -1; jj <= 1; ++jj) for (int ii = -1; ii <= 1; ++ii) {
                vec2 cc = cell + vec2(float(ii), float(jj));
                vec2 cp = cc + 0.5 + 0.35 * (hash22(cc) - 0.5);
                float d = length(g - cp) * sp;
                if (d < best) { best = d; bestC = cc; }
            }
            float exist = smoothstep(hash21(bestC) - 0.08, hash21(bestC) + 0.08, fill * env);
            float bead = smoothstep(sp * 0.42, sp * 0.18, best) * exist * w * fade;
            if (bead > 0.001) {
                vec3 photo = imgLod((bestC * sp) * 0.7 + 0.5, 1.0);
                vec3 cb = mix(tone * 1.3, photo * 1.6, 0.5 + 0.45 * clamp(photoP, 0.0, 1.0)) * (1.0 + 0.4 * clamp(audioKick, 0.0, 1.0));
                col = mix(col, cb, bead);
            }
        }
    }
    finish(col * 1.4);
}
