//@doc
 * @brief TRILOBITE EYE LATTICE: trilobite eyes: a lattice of calcite lenses, each its own picture point, in a curved eye; the photo is reduced many times through the lenses and seen as a mosaic.  A hexagonal lens array lies on a dome (the cells shrink towards the rim), every lens shows the whole photo
 * upside down and small, and the dome turns slowly.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell   -> the vaulting of the eye
 *   audioAdvance -> the dome turns (integrated)
 *
 * Knobs: sizeP (the number of lenses), hueP.
//@params sizeP
//@audio audioSwell audioAdvance
//@body
void main()
{
    vec2 p = screenP();
    float vault = 0.5 + 0.5 * clamp(audioSwell, 0.0, 1.0);
    float R = 0.98;
    float r = length(p);
    vec2 d = p / R;
    float z = sqrt(max(1.0 - dot(d, d) * vault * 0.9, 0.0));
    vec2 sph = d / max(z, 0.25);
    vec2 rt = rot2(0.02 * audioAdvance + 0.02 * sceneTime) * sph;
    float S = (0.55 / (5.0 + 7.0 * clamp(sizeP, 0.0, 1.0)));
    vec2 q = rt / S * 0.5;
    vec2 r2 = vec2(1.0, 1.7320508);
    vec2 h = r2 * 0.5;
    vec2 a = mod(q, r2) - h;
    vec2 b = mod(q - h, r2) - h;
    vec2 gv = dot(a, a) < dot(b, b) ? a : b;
    float hd = max(abs(gv.x) * 0.8660254 + abs(gv.y) * 0.5, abs(gv.y)) * 2.0;
    vec2 uv = 0.5 - gv * 0.9 * vec2(1.0, 1.0);
    vec3 c = imgLod(uv * 0.9 + 0.05, 0.8);
    float inside = 1.0 - smoothstep(0.97, 1.02, r / R * 1.0 * (0.9 + 0.1 * z));
    float lens = smoothstep(1.0, 0.84, hd);
    vec3 col = c * (0.35 + 0.8 * z) * (0.4 + 0.6 * lens) * 1.25;
    col += vec3(1.0, 0.95, 0.8) * pow(max(dot(normalize(vec3(gv, 1.0)), normalize(vec3(-0.3, 0.4, 0.8))), 0.0), 20.0) * 0.25 * lens;
    vec3 bg = imgLod(p * 0.85 + 0.5, 2.5) * 0.14;
    finish(mix(bg, col, inside));
}
