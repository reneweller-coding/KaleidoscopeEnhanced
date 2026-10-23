//@doc
 * @brief XEROGRAPHY TONER CASCADE: xerography: charged toner grains jump to an electrostatic image and draw it as dust; the photo lies in the picture as a charge image, and clouds of toner drift across it and draw it grain by grain.  Where the cloud is dense
 * the picture is complete, where it is thin only a few grains stand; the grains stay in place and only come and go.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell   -> the amount of toner in the clouds
 *   audioAdvance -> the clouds drift (integrated)
 *
 * Knobs: sizeP (the grain size), hueP.
//@params sizeP
//@audio audioSwell audioAdvance
//@body
void main()
{
    vec2 p = screenP();
    vec2 fc = gl_FragCoord.xy;
    vec2 uv = p * 0.8 + 0.5;
    vec3 c = imgLod(uv, 0.8);
    float l = luma(c);
    float G = (1.8 + 2.6 * clamp(sizeP, 0.0, 1.0)) * resolution.y / 270.0;
    vec2 cell = floor(fc / G);
    vec2 f = fract(fc / G) - 0.5;
    float h = hash21(cell);
    float cl = fbm(p * 2.2 + vec2(0.015 * audioAdvance, -0.01 * audioAdvance) + 0.01 * sceneTime);
    float cloud = smoothstep(0.25, 0.75, cl) * (0.55 + 0.6 * clamp(audioSwell, 0.0, 1.0)) + 0.25;
    float cov = clamp((1.0 - l) * 1.3 * cloud, 0.0, 1.0);
    float on = smoothstep(h - 0.12, h + 0.12, cov);
    float rr = 0.28 + 0.2 * hash21(cell + 5.0);
    float disc = 1.0 - smoothstep(rr - 0.1, rr + 0.1, length(f));
    vec3 paper = vec3(0.95, 0.94, 0.9);
    vec3 toner = mix(vec3(0.05, 0.05, 0.07), c * 0.5, 0.3);
    finish(mix(paper, toner, on * disc));
}
