//@doc
 * @brief TEXTURE THIN FILM SOAP: a vast soap film seen against the dark --
 * its thickness paints it in interference colours: bands of magenta,
 * gold, green and blue, thinning toward black at the top where the film
 * drains, while Marangoni swirls stir the colours into curling eddies and
 * plumes; the photograph shows faintly as a reflection in the film, a
 * soft window highlight glides over it.  Endless, mirrorable.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the swirls turn and the film drains (integrated)
 *   audioSpread     -> the film's thickness range (more colour orders)
 *   audioRoughness  -> the turbulence
 *   audioKick       -> the highlight flares (light)
 *   audioMode       -> the light: cool in minor, warm in major
 *   audioSwell      -> the reflection of the photo (slow)
 *
 * Knobs: swirlP, bandP (drainage banding), reflectP, hueP.
//@params swirlP bandP reflectP
//@audio audioSpread audioRoughness audioKick audioMode audioSwell
//@body
// Interference colour of a film of optical thickness d (nm), 7 wavelengths.
vec3 filmColour(float d)
{
    vec3 c = vec3(0.0), ws = vec3(0.0);
    for (int i = 0; i < 7; ++i) {
        float lam = 400.0 + 50.0 * float(i);
        float x = (lam - 400.0) / 300.0;
        vec3 w = clamp(vec3(1.5 - abs(x - 1.0) * 2.8, 1.5 - abs(x - 0.55) * 3.2, 1.5 - abs(x - 0.12) * 3.2), 0.0, 1.0);
        float I = 0.5 - 0.5 * cos(12.566 * 1.33 * d / lam);
        c += w * I;
        ws += w;
    }
    return c / ws * 1.2;               // each channel normalised: white at the mean
}

void main()
{
    vec2 p = screenP();
    float kick = clamp(audioKick, 0.0, 1.0);
    float swell = clamp(audioSwell, 0.0, 1.0);
    float rough = clamp(audioRoughness, 0.0, 1.0);
    float T = 0.03 * sceneTime + 0.2 * audioAdvance;
    // Swirls: a curl-like warp from two noise fields.
    float sw = 0.4 + 0.8 * clamp(swirlP, 0.0, 1.0);
    vec2 q = p * 1.4;
    vec2 w1 = vec2(fbm3(q + vec2(0.0, T)), fbm3(q + vec2(5.2, -T))) - 0.5;
    vec2 q2 = q + sw * rot2(1.5707963) * w1 * 1.5;
    vec2 w2 = vec2(fbm3(q2 * 1.7 + vec2(T * 1.3, 2.0)), fbm3(q2 * 1.7 + vec2(8.0, -T))) - 0.5;
    vec2 q3 = q2 + sw * rot2(-1.2) * w2 * (1.2 + 1.0 * rough);
    // Thickness: drains toward the top (in a mirrored, endless way: a slow
    // wave in y), plus the stirred structure.
    float band = 0.5 + 0.5 * sin(p.y * (1.5 + 2.0 * clamp(bandP, 0.0, 1.0)) + T * 2.0);
    float range = 450.0 + 500.0 * clamp(audioSpread, 0.0, 1.0);
    float stir = fbm(q3 * 1.3 + vec2(0.0, T * 0.5));
    float d = 40.0 + range * (0.1 + 0.35 * band + 0.9 * stir * stir);
    vec3 film = filmColour(d);
    // Black film where it is thinnest.
    film *= smoothstep(20.0, 160.0, d);
    float mode = clamp(audioMode, 0.0, 1.0);
    film *= mix(vec3(0.9, 0.97, 1.1), vec3(1.1, 0.98, 0.9), mode);
    film = max(mix(vec3(luma(film)), film, 1.5), 0.0);            // vivid like real soap
    film = mix(film, film.gbr, 0.5 - 0.5 * cos(hueP * 0.159 * 6.2831853)); // hue knob rotates the palette
    // The film against the dark, lit unevenly.
    float lightF = 0.35 + 0.45 * smoothstep(-0.2, 0.8, fbm3(p * 0.7 + 3.0));
    // Reflection of the photo, bent by the film's surface.
    vec2 uv = p * 0.6 + 0.5 + 0.03 * w2;
    vec3 refl = imgLod(uv, 2.0);
    vec3 col = film * lightF * (0.7 + 0.5 * luma(refl)) + refl * 0.08 * clamp(reflectP, 0.0, 1.0) * (0.3 + swell);
    // A soft window highlight gliding over the film.
    vec2 hc = vec2(0.5 * sin(0.03 * sceneTime), 0.25 * cos(0.021 * sceneTime));
    vec2 hd = abs(p - hc + 0.05 * w1) - vec2(0.16, 0.1);
    float win = smoothstep(0.12, -0.02, max(hd.x, hd.y));
    col += film * win * (0.35 + 0.8 * kick);
    finish(col);
}
