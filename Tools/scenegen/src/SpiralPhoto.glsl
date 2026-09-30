//@doc
 * @brief SPIRAL PHOTO: the photograph drawn with one single spiral line --
 * a groove winds out from the centre like a record, and its thickness
 * swells where the picture is dark and thins where it is light, so the
 * image appears out of the line itself; the spiral turns and flows
 * slowly outward, the photo drifts beneath, and the line lies as ink on
 * paper, tinted by the photo's colours.  Endless,
 * mirrorable.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the line flows outward (integrated, jump-free)
 *   audioPhase      -> the spiral turns (integrated)
 *   audioSpread     -> the line's range of thickness (contrast)
 *   audioKick       -> the line brightens (light)
 *   audioMode       -> the paper: cool grey in minor, warm cream in major
 *   audioSwell      -> the colour of the photo in the line (slow)
 *
 * Knobs: pitchP (turn spacing), zoomP (photo scale), wobbleP (the line wavers), hueP.
//@params pitchP zoomP wobbleP
//@audio audioPhase audioSpread audioKick audioMode audioSwell
//@body
void main()
{
    vec2 p = screenP();
    float kick = clamp(audioKick, 0.0, 1.0);
    float swell = clamp(audioSwell, 0.0, 1.0);
    float mode = smoothstep(0.2, 0.8, clamp(audioMode, 0.0, 1.0));
    float r = length(p);
    float a = atan(p.y, p.x) + 0.02 * sceneTime + 0.2 * audioPhase;
    float N = 40.0 + 60.0 * (1.0 - clamp(pitchP, 0.0, 1.0));   // turns per unit radius
    float wob = 0.15 * clamp(wobbleP, 0.0, 1.0) * sin(a * 7.0 + r * 20.0 + 0.3 * sceneTime);
    float s = r * N - a / 6.2831853 - (0.4 * sceneTime + 3.0 * audioAdvance) + wob;
    float f = abs(fract(s) - 0.5) * 2.0;                        // 0 on the line's centre
    // Pixel footprint without the atan-cut spike.
    float px = fwidth(r) * N + length(fwidth(vec2(cos(a), sin(a)))) / 6.2831853 + 1e-4;
    px *= 2.0;
    float z = 0.5 + 0.5 * clamp(zoomP, 0.0, 1.0);
    vec2 uv = p * z + 0.5 + vec2(0.004, 0.003) * sceneTime;
    vec3 ph = imgLod(uv, 1.2);
    float dark = 1.0 - luma(ph);
    float contrast = 0.6 + 0.6 * clamp(audioSpread, 0.0, 1.0);
    float w = clamp(0.08 + 0.85 * pow(dark, 1.0 / contrast), 0.05, 0.95);   // line thickness (fraction of pitch)
    float line = smoothstep(w + px, w - px, f);
    // Fade to the average tone where the turns get finer than pixels (centre).
    float fine = smoothstep(0.35, 0.8, px);
    line = mix(line, w, fine);
    vec3 lc = glowColour(ph, p, hueP * 0.159);
    lc = mix(vec3(1.0), lc, 0.3 + 0.6 * swell);
    vec3 paper = vec3(0.94, 0.92, 0.87) * (0.97 + 0.03 * noise2(p * 400.0));
    vec3 ink = mix(vec3(0.05, 0.05, 0.08), lc * 0.4, 0.5 * swell);
    vec3 onPaper = mix(paper, ink, line * (0.9 + 0.1 * kick));
    // Paper tint follows the mode (cool grey in minor, warm cream in major).
    onPaper *= mix(vec3(0.9, 0.95, 1.05), vec3(1.04, 1.0, 0.94), mode);
    finish(onPaper);
}
