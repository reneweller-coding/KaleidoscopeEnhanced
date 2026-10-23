//@doc
 * @brief STEPPING BARS PHOTO: the stepping feet illusion: two bars run at one steady speed across a pattern of black and bright stripes, one bar light and one dark in the photo's colours, and they seem to move now in step, now to
 * halt and run again, because their contrast with the stripes alternates.  The bars carry some of the photo; the stripes' spacing follows the spectral spread and the bars' speed the drive of the music.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the bars' running (integrated)
 *   audioSpread     -> the stripes' spacing
 *
 * Knobs: stripeP (the spacing of the stripes), hueP.
//@params stripeP
//@audio audioSpread
//@body
void main()
{
    vec2 p = screenP();
    float asp = resolution.x / resolution.y;
    float sw = (0.045 + 0.05 * clamp(stripeP, 0.0, 1.0)) * (0.8 + 0.5 * clamp(audioSpread, 0.0, 1.0));
    vec3 cs = imgLod(p * 0.8 + 0.5, 3.0);
    float stripe = mod(floor(p.x / sw), 2.0);
    vec3 col = cs * mix(0.08, 1.25, stripe);
    float per = 2.0 * asp + 0.6;
    float x1 = mod(0.02 * audioAdvance + 0.05 * sceneTime, per) - 0.5 * per;
    float x2 = mod(0.02 * audioAdvance + 0.05 * sceneTime + 0.5 * per, per) - 0.5 * per;
    vec3 cA = mix(imgLod(vec2(0.25, 0.3), 6.0), imgLod(p * 0.8 + 0.5, 2.5), 0.35);
    vec3 cB = mix(imgLod(vec2(0.75, 0.7), 6.0), imgLod(p * 0.8 + 0.5, 2.5), 0.35);
    cA = clamp(mix(vec3(luma(cA)), cA, 2.2), 0.0, 1.0);
    cB = clamp(mix(vec3(luma(cB)), cB, 2.2), 0.0, 1.0);
    cA *= 0.6 / max(luma(cA), 0.1);
    cB *= 0.6 / max(luma(cB), 0.1);
    float h = 0.1;
    float b1 = smoothstep(0.01, 0.0, abs(p.x - x1) - 0.19) * smoothstep(0.01, 0.0, abs(p.y - 0.12) - h);
    float b2 = smoothstep(0.01, 0.0, abs(p.x - x2) - 0.19) * smoothstep(0.01, 0.0, abs(p.y + 0.12) - h);
    col = mix(col, cA, b1);
    col = mix(col, cB, b2);
    finish(col);
}
