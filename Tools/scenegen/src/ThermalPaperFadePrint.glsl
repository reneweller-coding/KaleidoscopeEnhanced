//@doc
 * @brief THERMAL PAPER FADE PRINT: thermal paper: the photo burns in as darkness and fades again, fastest at the lightest and at the darkest places; the paper has roller streaks across and a yellowing that wanders.  The fading comes and goes with
 * the phrase, so the print is strong, pale and strong again.
 *
 * Audio Reactivity (structure, not only light):
 *   audioPhrasePos -> the fading time (periodic over the phrase)
 *   audioSwell     -> the strength of the roller streaks
 *
 * Knobs: sizeP (the width of the streaks), hueP.
//@params sizeP
//@audio audioSwell audioPhrasePos
//@body
void main()
{
    vec2 p = screenP();
    vec2 fc = gl_FragCoord.xy;
    vec2 uv = p * 0.8 + 0.5 + 0.03 * vec2(sin(0.05 * sceneTime), cos(0.04 * sceneTime));
    vec3 c = imgLod(uv, 0.5);
    float l = luma(c);
    float d = 1.0 - l;
    float ext = smoothstep(0.25, 0.0, d) + smoothstep(0.75, 1.0, d);
    float fade = 0.5 - 0.5 * cos(6.2831853 * audioPhrasePos);
    float dens = clamp(d * (1.0 - fade * (0.35 + 0.6 * ext)), 0.0, 1.0);
    float w = (1.0 + 3.0 * clamp(sizeP, 0.0, 1.0)) * resolution.y / 270.0;
    float roll = noise2(vec2(fc.y / (6.0 * w), 3.0 + 0.05 * sceneTime)) - 0.5;
    float roll2 = noise2(vec2(fc.y / (1.7 * w), 9.0 - 0.07 * sceneTime)) - 0.5;
    float amp = 0.1 + 0.12 * clamp(audioSwell, 0.0, 1.0);
    dens *= 1.0 + amp * (roll + 0.5 * roll2);
    float yel = 0.5 + 0.5 * sin(1.4 * p.x - 0.7 * p.y + 0.05 * sceneTime);
    vec3 paper = mix(vec3(0.94, 0.93, 0.86), vec3(0.93, 0.86, 0.66), 0.25 + 0.5 * yel);
    vec3 ink = mix(vec3(0.08, 0.07, 0.1), c * 0.35, 0.35);
    vec3 col = mix(paper, ink, smoothstep(0.0, 1.0, dens) * 0.96);
    finish(col * 1.05);
}
