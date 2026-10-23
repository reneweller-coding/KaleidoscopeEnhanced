//@doc
 * @brief FROTTAGE RUBBING RELIEF: frottage: a sheet over a structure, rubbed with a pencil; the photo is the relief under the sheet, and the stroke wanders across the surface.  Parallel pencil strokes run over the relief and mark it where it is high; the stroke direction and width change slowly, and a
 * wide soft band shows where the pencil is just passing.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance -> the direction of the strokes turns and the pencil wanders (integrated)
 *   audioSpread  -> the width of the pencil (smoothed)
 *
 * Knobs: sizeP (the stroke spacing), hueP.
//@params sizeP
//@audio audioSpread audioAdvance
//@body
void main()
{
    vec2 p = screenP();
    vec2 fc = gl_FragCoord.xy;
    float px = resolution.y / 270.0;
    float ang = 0.5 + 0.015 * audioAdvance + 0.02 * sceneTime;
    vec2 ax = vec2(cos(ang), sin(ang));
    float sp = 60.0 + 80.0 * (1.0 - clamp(sizeP, 0.0, 1.0));
    float s = dot(p, vec2(-ax.y, ax.x)) * sp + 0.8 * fbm(p * 6.0);
    float pen = 0.35 + 0.4 * clamp(audioSpread, 0.0, 1.0);
    float stroke = 1.0 - smoothstep(pen * 0.5, pen * 0.5 + 0.2, abs(fract(s) - 0.5));
    vec2 uv = p * 0.85 + 0.5;
    vec3 c = imgLod(uv, 0.8);
    float relief = luma(c) * 0.7 + 0.3 * (luma(imgLod(uv + vec2(0.004, 0.004), 1.0)) - luma(imgLod(uv - vec2(0.004, 0.004), 1.0))) * 6.0;
    float tooth = noise2(fc / px * 0.9) * 0.6 + noise2(fc / px * 2.3 + 3.0) * 0.4;
    float mark = smoothstep(0.35, 0.8, relief * 1.2 + (tooth - 0.5) * 0.7);
    float band = exp(-pow(dot(p, ax) - 0.45 * sin(0.04 * audioAdvance + 0.05 * sceneTime), 2.0) / 0.18);
    float ink = stroke * mark * (0.5 + 0.5 * band);
    vec3 paper = vec3(0.96, 0.94, 0.9) * (0.94 + 0.08 * tooth);
    vec3 pencil = mix(vec3(0.15, 0.15, 0.2), c * 0.5, 0.45);
    finish(mix(paper, pencil, ink * 0.95));
}
