//@doc
 * @brief DICHROMAT SIMULATION SLIDE: simulation of colour deficiency: the photo glides between normal vision and the three forms (protanopia, deuteranopia, tritanopia); the surface shows the shifts as bands.  Four bands, each in the matrix of one kind of vision, slide through the picture; the borders between them are
 * soft and the bands change their order.
 *
 * Audio Reactivity (structure, not only light):
 *   audioHarmAdvance -> the form (the order of the bands) follows the key (integrated)
 *   audioAdvance     -> the bands slide (integrated)
 *
 * Knobs: sizeP (the number of bands), hueP.
//@params sizeP
//@audio audioAdvance audioHarmAdvance
//@body
void main()
{
    vec2 p = screenP();
    vec3 c = imgLod(p * 0.85 + 0.5, 0.6);
    mat3 P = mat3(0.567, 0.558, 0.0, 0.433, 0.442, 0.242, 0.0, 0.0, 0.758);
    mat3 D = mat3(0.625, 0.7, 0.0, 0.375, 0.3, 0.3, 0.0, 0.0, 0.7);
    mat3 T = mat3(0.95, 0.0, 0.0, 0.05, 0.433, 0.475, 0.0, 0.567, 0.525);
    vec3 n = c;
    vec3 pr = P * c;
    vec3 de = D * c;
    vec3 tr = T * c;
    float N = 3.0 + 3.0 * clamp(sizeP, 0.0, 1.0);
    float s = p.y * N + 0.03 * audioAdvance + 0.05 * sceneTime + 0.4 * sin(2.0 * p.x + 0.1 * audioHarmAdvance);
    float k = floor(s);
    float f = smoothstep(0.7, 1.0, fract(s));
    float o = 0.05 * audioHarmAdvance;
    float i0 = mod(k + floor(o), 4.0);
    float i1 = mod(k + 1.0 + floor(o), 4.0);
    vec3 a = i0 < 0.5 ? n : (i0 < 1.5 ? pr : (i0 < 2.5 ? de : tr));
    vec3 b = i1 < 0.5 ? n : (i1 < 1.5 ? pr : (i1 < 2.5 ? de : tr));
    float gap = smoothstep(0.0, 0.03, fract(s)) * (1.0 - smoothstep(0.97, 1.0, fract(s)));
    vec3 col = mix(a, b, f);
    finish(col * (0.8 + 0.2 * gap) * 1.1);
}
