//@doc
 * @brief TEXTURE CHATOYANCE: tiger's eye -- a polished slab of fibrous stone
 * whose silky bands of golden brown and deep blue flash bright and dark
 * as the light moves, each band's fibres running in its own direction, so
 * the stripes seem to roll like a cat's eye as the stone is turned; the
 * bands follow the photograph's structure, its colours shifting the stone
 * between tiger's eye, hawk's eye and red cat's eye.  Endless, mirrorable.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the light rolls across (integrated, jump-free)
 *   audioSpread     -> the band width
 *   audioKick       -> the flash brightens (light)
 *   audioMode       -> the stone: blue hawk's eye in minor, golden tiger's eye in major
 *   audioRoughness  -> fibre crispness
 *   audioSwell      -> the polish (slow)
 *
 * Knobs: bandP (band count), fibreP (fibre fineness), photoP (photo influence), hueP.
//@params bandP fibreP photoP
//@audio audioSpread audioKick audioMode audioRoughness audioSwell
//@body
void main()
{
    vec2 p = screenP();
    float kick = clamp(audioKick, 0.0, 1.0);
    float swell = clamp(audioSwell, 0.0, 1.0);
    float mode = clamp(audioMode, 0.0, 1.0);
    float rough = clamp(audioRoughness, 0.0, 1.0);
    vec2 uv = p * 0.6 + 0.5;
    float ph = luma(imgK(uv, 4.0));
    // Band field: wavy parallel bands, bent by the photo.
    float nb = 5.0 + 8.0 * clamp(bandP, 0.0, 1.0);
    float bw = 1.0 - 0.4 * clamp(audioSpread, 0.0, 1.0);
    float bf = (p.y + 0.15 * sin(p.x * 2.0) + 0.3 * clamp(photoP, 0.0, 1.0) * (ph - 0.5) + 0.1 * fbm3(p * 2.0)) * nb * bw;
    float band = floor(bf);
    float fb = fract(bf);
    // Each band's fibres run at their own angle (chatoyance needs parallel fibres).
    float fa = (hash11(band * 0.37) - 0.5) * 1.6;
    vec2 fdir = vec2(cos(fa), sin(fa));
    // The light: a direction rolling slowly; a band flashes where its fibres
    // stand across the light.
    float T = 0.1 * sceneTime + 0.6 * audioAdvance;
    vec2 ld = vec2(cos(T), sin(T * 0.7));
    float flash = pow(abs(dot(fdir, normalize(ld + 1e-4))), 4.0);
    // The eye rolls along the band.
    float eye = exp(-pow(dot(p, fdir) - sin(T * 0.8 + band) * 0.6, 2.0) * 3.0);
    float fibre = noise2(vec2(dot(p, vec2(-fdir.y, fdir.x)) * (200.0 + 300.0 * clamp(fibreP, 0.0, 1.0)), dot(p, fdir) * 4.0));
    fibre = mix(0.8, 0.6 + 0.8 * fibre, 0.3 + 0.5 * rough);
    vec3 gold = vec3(0.75, 0.48, 0.12), brown = vec3(0.25, 0.12, 0.04);
    vec3 blue = vec3(0.25, 0.4, 0.6), dblue = vec3(0.05, 0.08, 0.14);
    vec3 hi = mix(blue, gold, mode), lo = mix(dblue, brown, mode);
    vec3 pc = glowColour(imgK(uv, 5.0), p, hueP * 0.159);
    hi = mix(hi, pc * 0.8, 0.2 * clamp(photoP, 0.0, 1.0));
    float bright = clamp(0.25 + 0.9 * flash * (0.4 + 0.8 * eye), 0.0, 1.3) * (1.0 + 0.6 * kick);
    vec3 col = mix(lo, hi, bright) * fibre;
    // Band borders: thin dark seams.
    float px = fwidth(bf) + 1e-4;
    col *= 1.0 - 0.5 * exp(-min(fb, 1.0 - fb) / (px * 1.5));
    // Polish: a soft reflection.
    col += vec3(1.0) * exp(-dot(p - vec2(0.4 * sin(T * 0.3), 0.2), p - vec2(0.4 * sin(T * 0.3), 0.2)) * 6.0) * (0.03 + 0.12 * swell);
    finish(col);
}
