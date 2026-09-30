//@doc
 * @brief HEAT HAZE OVER FLAMES: the photograph seen through the shimmering
 * air above a row of flames -- along the bottom of each band low blue and
 * orange flames flicker, and above them the hot air ripples and wavers,
 * bending the picture behind in rising, wobbling streaks, the distortion
 * strongest just above the flames and calming higher up; the bands repeat
 * so the plane is endless.  Mirrorable.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the shimmer rises (integrated, jump-free)
 *   audioSpread     -> the shimmer strength
 *   audioBass       -> the flames flare (light)
 *   audioMode       -> the flames: blue gas in minor, orange wood fire in major
 *   audioRoughness  -> the turbulence of the rising air
 *   audioSwell      -> the glow on the picture (slow)
 *
 * Knobs: bandP (band height), flameP (flame height), photoP (photo sharpness), hueP.
//@params bandP flameP photoP
//@audio audioSpread audioBass audioMode audioRoughness audioSwell
//@body
void main()
{
    vec2 p = screenP();
    float bass = clamp(audioBass, 0.0, 1.0);
    float swell = clamp(audioSwell, 0.0, 1.0);
    float mode = clamp(audioMode, 0.0, 1.0);
    float rough = clamp(audioRoughness, 0.0, 1.0);
    float bh = 0.5 + 0.5 * clamp(bandP, 0.0, 1.0);
    float yb = p.y / bh + 0.5;
    float band = floor(yb);
    float fy = fract(yb);                                       // 0 at the flames .. 1 at the top of the band
    float T = 0.6 * sceneTime + 3.0 * audioAdvance;
    // Shimmer: rising turbulent refraction, strongest near the flames.
    float str = (0.004 + 0.012 * clamp(audioSpread, 0.0, 1.0)) * exp(-fy * 2.5);
    vec2 q = vec2(p.x * 8.0, fy * 6.0 - T);
    vec2 off = vec2(fbm3(q + band * 7.0) - 0.5, fbm3(q * 1.3 + 4.0 + band) - 0.5) * (1.0 + rough);
    off += 0.5 * vec2(noise2(q * 3.0) - 0.5, 0.0) * rough;
    vec2 uv = p * 0.5 + 0.5 + off * str * 20.0;
    vec3 ph = imgK(uv, 0.5 + 1.5 * (1.0 - clamp(photoP, 0.0, 1.0)));
    vec3 fireC = mix(vec3(0.2, 0.45, 1.0), vec3(1.0, 0.5, 0.12), mode);
    vec3 col = ph * (0.8 + (0.2 + 0.4 * swell) * exp(-fy * 3.0) * fireC);
    // Flames: flickering tongues along the band's bottom.
    float fh = (0.12 + 0.2 * clamp(flameP, 0.0, 1.0)) * (0.8 + 0.5 * bass);
    float tongue = 0.2 + 1.3 * pow(fbm3(vec2(p.x * 9.0 + band * 3.0, fy * 3.0 - T * 1.5)), 2.0) * (0.6 + 0.8 * noise2(vec2(p.x * 30.0, T * 2.0)));
    float flame = smoothstep(fh * tongue, fh * tongue * 0.3, fy * bh);
    vec3 fc = mix(fireC, vec3(1.0, 0.9, 0.6), smoothstep(0.5, 1.0, flame));
    col = mix(col, fc * (1.2 + 0.8 * bass), flame * 0.9);
    // Burner line.
    col *= 1.0 - 0.6 * smoothstep(0.012, 0.0, fy * bh) ;
    col = mix(col, col * glowColour(ph, p, hueP * 0.159) * 1.2, 0.05);
    finish(col);
}
