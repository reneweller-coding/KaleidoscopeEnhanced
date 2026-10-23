//@doc
 * @brief CONTINUOUS LINE SCRIBBLE DENSITY: a scribble line that fills the photo without lifting the pencil: the line makes loops whose density corresponds to brightness, and the loops run over the surface.  Every cell holds a rose curve whose number of petals and size grow with the darkness, drawn as one closed line;
 * the cells are joined by the eye into one continuous scribble.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell   -> the size of the loops
 *   audioAdvance -> the loops turn along the line (integrated)
 *
 * Knobs: sizeP (the size of the cells), hueP.
//@params sizeP
//@audio audioSwell audioAdvance
//@body
void main()
{
    vec2 p = screenP();
    float S = 0.09 + 0.07 * clamp(sizeP, 0.0, 1.0);
    vec2 g = p / S;
    vec2 ci = floor(g);
    vec2 f = fract(g) - 0.5;
    vec3 c = imgLod((ci + 0.5) * S * 0.85 + 0.5, 1.6);
    float dark = clamp(1.0 - luma(c) * 1.05, 0.0, 1.0);
    float r = length(f);
    float th = atan(f.y, f.x) + (0.02 * audioAdvance + 0.04 * sceneTime) * (hash21(ci) > 0.5 ? 1.0 : -1.0);
    float kk = 2.0 + floor(dark * 6.0 + 0.5);
    float R = (0.3 + 0.2 * dark) * (0.8 + 0.4 * clamp(audioSwell, 0.0, 1.0));
    float rose = R * abs(cos(kk * 0.5 * th + 6.28 * hash21(ci + 3.0)));
    float d = abs(r - rose);
    float w = 0.03 + 0.02 * dark;
    float line = 1.0 - smoothstep(w * 0.6, w, d);
    float R2 = R * 0.62;
    float rose2 = R2 * abs(cos((kk + 1.0) * 0.5 * (th + 1.0) + 2.0));
    float line2 = (1.0 - smoothstep(w * 0.6, w, abs(r - rose2))) * smoothstep(0.35, 0.6, dark);
    float ink = max(line, line2);
    vec3 paper = vec3(0.95, 0.93, 0.88);
    vec3 pen = mix(vec3(0.05, 0.05, 0.08), imgLod((ci + 0.5) * S * 0.85 + 0.5, 1.0) * 0.4, 0.3);
    finish(mix(paper, pen, ink));
}
