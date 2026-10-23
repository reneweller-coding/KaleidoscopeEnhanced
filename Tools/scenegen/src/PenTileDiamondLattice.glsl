//@doc
 * @brief PEN TILE DIAMOND LATTICE: an organic light-emitting display with staggered pixels: red and blue share diamonds in a checkerboard, green sits in small dots between them; the scale glides from the picture to the pixel structure and back, and the
 * two lattices (diamonds and dots) slide into each other.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance -> the lattices slide (integrated)
 *   audioSwell   -> the brightness of the sub pixels against the black
 *
 * Knobs: sizeP (the biggest pixel), hueP.
//@params sizeP
//@audio audioSwell audioAdvance
//@body
void main()
{
    vec2 fc = gl_FragCoord.xy - 0.5 * resolution;
    float big = 14.0 + 20.0 * clamp(sizeP, 0.0, 1.0);
    float Pb = exp(mix(log(5.0), log(big), 0.5 + 0.5 * sin(0.05 * sceneTime + 0.03 * audioAdvance)));
    float P = Pb * resolution.y / 270.0;
    vec2 r = rot2(0.7853982) * (fc + P * 0.6 * vec2(sin(0.02 * audioAdvance), cos(0.017 * audioAdvance))) / P;
    vec2 ci = floor(r);
    vec2 f = fract(r) - 0.5;
    float chk = mod(ci.x + ci.y, 2.0);
    float dia = 1.0 - smoothstep(0.30, 0.42, abs(f.x) + abs(f.y));
    vec2 gf = fract(r + 0.5) - 0.5;
    float gdot = 1.0 - smoothstep(0.12, 0.2, length(gf));
    vec2 cp = rot2(-0.7853982) * ((ci + 0.5) * P);
    vec2 gp = rot2(-0.7853982) * ((floor(r + 0.5)) * P);
    vec3 ca = imgLod(cp / resolution.y * 0.8 + 0.5, log2(Pb) - 0.5);
    vec3 cg = imgLod(gp / resolution.y * 0.8 + 0.5, log2(Pb) - 0.5);
    float gain = 1.5 + 0.5 * clamp(audioSwell, 0.0, 1.0);
    vec3 col = vec3(0.0);
    col += (chk < 0.5 ? vec3(1.0, 0.12, 0.05) * ca.r : vec3(0.1, 0.2, 1.0) * ca.b) * dia;
    col += vec3(0.1, 1.0, 0.2) * cg.g * gdot;
    col += 0.16 * imgLod(fc / resolution.y * 0.8 + 0.5, log2(Pb));
    finish(col * gain);
}
