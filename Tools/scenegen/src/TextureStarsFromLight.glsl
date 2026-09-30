//@doc
 * @brief TEXTURE STARS FROM LIGHT: the photograph turned into a night sky --
 * each bright spot of the picture becomes a star, bigger and brighter the
 * brighter the spot, coloured like real stars from blue-white to orange by
 * the photo's hue, with diffraction spikes on the brightest; faint ones
 * form milky clouds where the photo is soft, and the whole firmament
 * turns slowly around a distant pole.  Endless, mirrorable.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the sky turns (integrated, jump-free)
 *   audioSpread     -> how many stars appear
 *   audioHigh       -> the stars twinkle (light)
 *   audioKick       -> the spikes flare (light)
 *   audioMode       -> the sky: blue-black in minor, warm dusk in major
 *   audioSwell      -> the milky glow (slow)
 *
 * Knobs: densityP (star density), spikeP (diffraction spikes), milkyP, hueP.
//@params densityP spikeP milkyP
//@audio audioSpread audioHigh audioKick audioMode audioSwell
//@body
void main()
{
    vec2 p = screenP();
    float kick = clamp(audioKick, 0.0, 1.0);
    float hi = clamp(audioHigh * 1.5, 0.0, 1.0);
    float swell = clamp(audioSwell, 0.0, 1.0);
    float mode = clamp(audioMode, 0.0, 1.0);
    // The firmament turns around a pole off-screen.
    vec2 pole = vec2(0.9, 1.2);
    float rotA = 0.01 * sceneTime + 0.08 * audioAdvance;
    vec2 q = pole + rot2(rotA) * (p - pole);
    vec2 uv = q * 0.5 + 0.5;
    vec3 sky = mix(vec3(0.005, 0.01, 0.03), vec3(0.04, 0.02, 0.04), mode);
    // Milky clouds where the photo is bright but soft.
    vec3 soft = imgLod(uv, 4.0);
    vec3 col = sky + soft * (0.03 + 0.15 * clamp(milkyP, 0.0, 1.0) * (0.5 + swell)) * vec3(0.8, 0.85, 1.0);
    // Stars: jittered cells; brightness from the photo at the star's place.
    float dens = 0.35 + 0.6 * clamp(audioSpread, 0.0, 1.0) * (0.5 + 0.5 * clamp(densityP, 0.0, 1.0));
    for (int L = 0; L < 3; ++L) {
        float fl = float(L);
        float S = 25.0 + 30.0 * fl;
        vec2 g = q * S + fl * 13.0;
        vec2 gi = floor(g);
        for (int j = -1; j <= 1; ++j) for (int i = -1; i <= 1; ++i) {
            vec2 id = gi + vec2(i, j);
            vec2 c = id + 0.2 + 0.6 * hash22(id + fl);
            vec2 cuv = (c - fl * 13.0) / S * 0.5 + 0.5;
            vec3 ph = imgLod(cuv, 2.0);
            float b = luma(ph) - luma(imgLod(cuv, 5.0)) * 0.6;
            b = smoothstep(0.1, 0.6, b + hash21(id + 3.0) * 0.25);
            if (hash21(id + 7.0 + fl) > dens * (0.3 + b)) continue;
            vec2 d = g - c;
            float r = length(d);
            float mag = b * (1.0 - 0.3 * fl);
            float tw = 1.0 + 0.4 * sin(sceneTime * (3.0 + 5.0 * hash21(id)) + hash21(id + 1.0) * 30.0) * hi;
            // Colour: from the photo's hue, mapped onto star colours.
            float t = fract(hue_of(ph) + hueP * 0.159);
            vec3 sc = mix(vec3(0.7, 0.8, 1.0), vec3(1.0, 0.75, 0.45), 0.5 + 0.5 * cos(t * 6.2831853));
            float core = exp(-r * r / (0.002 + 0.02 * mag * mag)) * (0.4 + 1.2 * mag);
            float halo = exp(-r * (6.0 - 3.0 * mag)) * 0.15 * mag;
            // Diffraction spikes on the brightest.
            float sp = clamp(spikeP, 0.0, 1.0) * smoothstep(0.6, 0.9, mag);
            float spikes = (exp(-abs(d.x) * 60.0) + exp(-abs(d.y) * 60.0)) * exp(-r * 3.0) * sp * (0.4 + 0.8 * kick);
            col += sc * (core + halo + spikes) * tw;
        }
    }
    finish(col);
}
