//@doc
 * @brief SKELETON OFFSET BANDS: the photo's shapes (segments cut by its brightness) offset inward again and again: bands that repeat like waves from
 * every shape, the way a skeleton of the picture grows rings; the photo in each band, its brightness stepped across the band like the shade of
 * a terrace.  The rings migrate outward and the band spacing follows the spectrum.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSpread     -> the spacing of the bands
 *   audioAdvance    -> the bands migrate (integrated)
 *   audioSwell      -> how much the bands shade the photo
 *
 * Knobs: bandsP (the base number of bands), reachP (the scale of the shapes), hueP.
//@params bandsP reachP
//@audio audioSpread audioSwell
//@body
void main()
{
    vec2 p = screenP();
    vec2 uv = p * 0.8 + 0.5;
    float t = sceneTime * 0.15 + 1.0 * audioAdvance;
    float lod = 3.0 + 2.5 * clamp(reachP, 0.0, 1.0);
    float L = luma(imgLod(uv, lod));
    float Lg = luma(imgLod(uv, lod + 1.5));
    float field = L * 0.6 + 0.4 * (L - Lg) * 3.0 + 0.5;
    float K = (6.0 + 8.0 * clamp(bandsP, 0.0, 1.0)) * (0.8 + 0.4 * clamp(audioSpread, 0.0, 1.0));
    float s = field * K - 0.3 * t;
    float fr = fract(s);
    float shade = 0.65 + 0.5 * smoothstep(0.0, 0.9, fr) * (0.6 + 0.8 * clamp(audioSwell, 0.0, 1.0));
    vec3 col = imgLod(uv + vec2(0.02 * sin(6.2831853 * s * 0.2), 0.0), 0.5) * shade;
    finish(col * 1.05);
}
