//@doc
 * @brief MIP SELECT BY LUMA: the brightness of the first photo chooses the sharpness of the second: where the first is dark the second shows as coarse fields of colour, where it is bright as fine detail down to the grain -- the first
 * photo draws a map of focus over the second.  The choice becomes steeper with the spectral spread (a narrow spread chooses gently).  A slow drift moves the focus map across the second photo.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSpread     -> how steeply the brightness chooses the sharpness
 *   audioAdvance    -> the focus map drifts (integrated)
 *
 * Knobs: depthP (how coarse the coarsest level is), hueP.
//@params depthP
//@audio audioSpread
//@body
void main()
{
    vec2 p = screenP();
    vec2 uv = p * 0.8 + 0.5;
    vec2 off = 0.05 * vec2(sin(0.02 * audioAdvance + 0.01 * sceneTime), cos(0.018 * audioAdvance));
    float l = luma(imgLod(uv + off, 2.5));
    float steep = 1.0 + 2.0 * clamp(audioSpread, 0.0, 1.0);
    float sel = clamp(pow(clamp((l - 0.15) / 0.7, 0.0, 1.0), 1.0 / steep), 0.0, 1.0);
    float lod = mix(3.0 + 3.0 * clamp(depthP, 0.0, 1.0), 0.0, sel);
    finish(imgB(uv, lod) * 1.08);
}
