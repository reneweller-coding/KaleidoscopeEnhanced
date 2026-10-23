//@doc
 * @brief CHAMELEON IRIDOPHORE LATTICE: chameleon skin: nanocrystals in cells whose spacing determines the colour; the photo sets the spacing, and the lattice stretches and contracts so that the colours glide through the spectrum.  Every hexagonal cell takes a colour from a spectral palette at the position
 * given by the photo's brightness plus the stretch of the lattice, and shimmers like a thin film.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell       -> the stretch of the lattice
 *   audioHarmAdvance -> the lattice glides through the spectrum with the key (integrated)
 *
 * Knobs: sizeP (the size of the cells), hueP.
//@params sizeP
//@audio audioSwell audioHarmAdvance
//@body
void main()
{
    vec2 p = screenP();
    float S = 0.05 + 0.05 * clamp(sizeP, 0.0, 1.0);
    vec2 q = p / S;
    vec2 r2 = vec2(1.0, 1.7320508);
    vec2 h = r2 * 0.5;
    vec2 a = mod(q, r2) - h;
    vec2 b = mod(q - h, r2) - h;
    vec2 gv = dot(a, a) < dot(b, b) ? a : b;
    vec2 id = q - gv;
    vec3 c = imgLod((id * S) * 0.85 + 0.5, 1.5);
    float l = luma(c);
    float st = 0.35 + 0.5 * clamp(audioSwell, 0.0, 1.0);
    float x = 0.6 * l + st * 0.5 * (0.5 + 0.5 * sin(0.8 * id.x + 0.6 * id.y + 0.1 * sceneTime)) + 0.03 * audioHarmAdvance;
    vec3 film = 0.5 + 0.5 * cos(6.2831853 * (vec3(0.0, 0.33, 0.67) + x * 1.4));
    float hd = max(abs(gv.x) * 0.8660254 + abs(gv.y) * 0.5, abs(gv.y)) * 2.0;
    float dome = 0.7 + 0.5 * sqrt(max(1.0 - hd * hd * 0.8, 0.0));
    float gl = pow(max(dot(normalize(vec3(gv * 1.5, 1.0)), normalize(vec3(-0.4, 0.5, 0.8))), 0.0), 12.0);
    vec3 col = mix(mix(vec3(luma(c)), film, 0.65), c * 1.15, 0.45) * dome + gl * 0.3;
    finish(col * smoothstep(1.0, 0.86, hd) * 1.2 + (1.0 - smoothstep(1.0, 0.86, hd)) * 0.02);
}
