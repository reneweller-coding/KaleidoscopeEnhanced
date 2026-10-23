//@doc
 * @brief SPOT NOISE FLOW SMEAR: spot noise: elliptical spots that follow a vector field and make the field visible in rows; the photo gives colour and field, and the picture shows directional grain.  Every spot sits on a jittered net, is stretched along the direction of the photo's contours (perpendicular to its
 * gradient) and takes its colour from the photo at its centre; the stretch grows with the music's swell.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell   -> the length of the spots
 *   audioAdvance -> the field's direction turns slowly (integrated)
 *
 * Knobs: sizeP (the size of the spots), hueP.
//@params sizeP
//@audio audioSwell audioAdvance
//@body
void main()
{
    vec2 p = screenP();
    float S = 0.03 + 0.025 * clamp(sizeP, 0.0, 1.0);
    vec2 g = p / S;
    vec2 gi = floor(g);
    float len = 1.5 + 3.5 * clamp(audioSwell, 0.0, 1.0);
    float rot = 0.01 * audioAdvance + 0.015 * sceneTime;
    vec3 col = imgLod(p * 0.85 + 0.5, 1.5) * 0.15;
    vec3 acc = vec3(0.0);
    float wsum = 0.0;
    for (int dy = -2; dy <= 2; ++dy)
        for (int dx = -2; dx <= 2; ++dx) {
            vec2 cj = gi + vec2(float(dx), float(dy));
            vec2 h = hash22(cj);
            vec2 pt = (cj + 0.5 + 0.45 * (h - 0.5) * 2.0) * S;
            vec2 uvq = pt * 0.85 + 0.5;
            float e = 0.012;
            float gx = luma(imgLod(uvq + vec2(e, 0.0), 2.5)) - luma(imgLod(uvq - vec2(e, 0.0), 2.5));
            float gy = luma(imgLod(uvq + vec2(0.0, e), 2.5)) - luma(imgLod(uvq - vec2(0.0, e), 2.5));
            float th = atan(gy, gx) + 1.5708 + rot;
            vec2 d = rot2(-th) * (p - pt) / S;
            float en = (d.x / len) * (d.x / len) + d.y * d.y * 2.2;
            float w = exp(-en * 2.0);
            vec3 c = imgLod(uvq, 1.0);
            c = mix(vec3(luma(c)), c, 1.35);
            acc += c * w;
            wsum += w;
        }
    col += acc / max(wsum, 0.15) * smoothstep(0.1, 0.6, wsum) * 1.2;
    finish(col);
}
