//@doc
 * @brief DARNING STITCH FIELD: darning: the photo drawn through dense parallel stitches that change length at the edges of the picture and
 * make a pattern in the direction of the warp; every stitch is a rounded bar of thread in the colour of the photo at its middle.  The
 * stitches grow longer and shorter as the spectrum widens.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSpread     -> the stitches' length
 *   audioAdvance    -> the rows drift sideways, each at its own pace (integrated)
 *
 * Knobs: rowsP (how many rows), gapP (the gaps between stitches), hueP.
//@params rowsP gapP
//@audio audioSpread
//@body
void main()
{
    vec2 p = screenP();
    vec2 uv = p * 0.8 + 0.5;
    float t = sceneTime * 0.05 + 0.4 * audioAdvance;
    float R = 24.0 + 24.0 * clamp(rowsP, 0.0, 1.0);
    float row = floor(p.y * R);
    float fy = fract(p.y * R) - 0.5;
    float e = length(vec2(luma(imgLod(uv + vec2(0.01, 0.0), 1.5)) - luma(imgLod(uv - vec2(0.01, 0.0), 1.5)),
                          luma(imgLod(uv + vec2(0.0, 0.01), 1.5)) - luma(imgLod(uv - vec2(0.0, 0.01), 1.5)))) * 8.0;
    float Ls = (0.09 + 0.12 * clamp(audioSpread, 0.0, 1.0)) * (1.0 - 0.5 * clamp(e, 0.0, 1.0));
    float off = hash11(row * 3.7) * Ls + t * (0.2 + 0.3 * hash11(row * 7.1)) * 0.2;
    float x = p.x + off;
    float id = floor(x / Ls);
    float fx = fract(x / Ls) - 0.5;
    float gap = 0.12 + 0.2 * clamp(gapP, 0.0, 1.0);
    vec2 cp = vec2((id + 0.5) * Ls - off, (row + 0.5) / R);
    vec3 c = imgLod(cp * 0.8 + 0.5, 1.5);
    vec2 d = vec2(abs(fx) * Ls * R * 0.0 + abs(fx) * 2.0, abs(fy) * 2.0);
    float bar = smoothstep(1.0 - gap, 1.0 - gap - 0.12, d.x) * smoothstep(0.95, 0.7, d.y);
    vec3 col = c * (0.65 + 0.45 * cos(1.5 * fy * 3.14159265)) * bar + 0.12 * imgLod(uv, 4.5) * (1.0 - bar);
    finish(col * 1.1);
}
