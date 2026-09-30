//@doc
 * @brief TEXTURE OIL SLICK SHEEN: a film of oil on a wet road at night --
 * rainbow interference colours swirl across the dark asphalt (the
 * photograph as the road's texture beneath), the thin film spreading and
 * twisting in slow eddies, thicker bands showing the richer second-order
 * colours, the film breaking into islands where it thins; a street light
 * glints on the wet surface.  Endless, mirrorable.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the film swirls (integrated, jump-free)
 *   audioSpread     -> the film's thickness range
 *   audioKick       -> the glint flares (light)
 *   audioMode       -> the road: cold blue night in minor, sodium orange in major
 *   audioRoughness  -> the film breaks into islands
 *   audioSwell      -> the wet sheen (slow)
 *
 * Knobs: swirlP, filmP (film coverage), roadP (road texture), hueP.
//@params swirlP filmP roadP
//@audio audioSpread audioKick audioMode audioRoughness audioSwell
//@body
vec3 filmC(float d)
{
    // Thin-film colours: three wavelengths.
    return 0.5 + 0.5 * cos(6.2831853 * d * vec3(1.0 / 0.65, 1.0 / 0.53, 1.0 / 0.45));
}

void main()
{
    vec2 p = screenP();
    float kick = clamp(audioKick, 0.0, 1.0);
    float swell = clamp(audioSwell, 0.0, 1.0);
    float mode = clamp(audioMode, 0.0, 1.0);
    float rough = clamp(audioRoughness, 0.0, 1.0);
    vec2 uv = p * 0.6 + 0.5;
    vec3 road = imgK(uv, 1.0);
    road = mix(vec3(luma(road)), road, 0.3) * (0.15 + 0.25 * clamp(roadP, 0.0, 1.0));
    road *= 0.8 + 0.4 * noise2(p * 250.0);
    vec3 lampC = mix(vec3(0.6, 0.75, 1.0), vec3(1.0, 0.6, 0.25), mode);
    // Swirling film thickness.
    float T = 0.03 * sceneTime + 0.2 * audioAdvance;
    float sw = 0.6 + 1.2 * clamp(swirlP, 0.0, 1.0);
    vec2 q = p * 1.5;
    vec2 w1 = vec2(fbm3(q + T), fbm3(q - T + 5.0)) - 0.5;
    vec2 w2 = vec2(fbm3(q * 1.7 + sw * w1 * 2.0 + 3.0), fbm3(q * 1.7 + sw * w1 * 2.0 + 8.0)) - 0.5;
    float th = fbm(q + sw * w2 * 2.0);
    float cover = smoothstep(0.35 - 0.2 * clamp(filmP, 0.0, 1.0) + 0.1 * rough, 0.5, th + 0.1 * (fbm3(p * 8.0) - 0.5) * rough);
    float d = 0.3 + (0.6 + 1.2 * clamp(audioSpread, 0.0, 1.0)) * th + hueP * 0.159 * 0.5;
    vec3 film = filmC(d);
    film = max(mix(vec3(luma(film)), film, 1.1), 0.0);
    // The film shows as reflected light: stronger where the road reflects the lamp.
    vec2 lp = vec2(0.5 * sin(0.013 * sceneTime), 0.5);
    float refl = 0.25 + 0.75 * exp(-length((p - lp) * vec2(1.0, 0.4)) * 1.2);
    vec3 col = road + film * cover * refl * (0.3 + 0.3 * swell);
    // Wet sheen and the lamp's glint streak.
    float glint = exp(-abs(p.x - lp.x) * 25.0) * exp(-abs(p.y - lp.y + 0.3) * 1.5);
    col += lampC * (glint * (0.3 + 1.0 * kick) + refl * 0.05 * swell);
    finish(col);
}
