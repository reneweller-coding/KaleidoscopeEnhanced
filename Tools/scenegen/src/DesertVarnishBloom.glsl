//@doc
 * @brief DESERT VARNISH BLOOM: desert varnish: a dark manganese crust that grows on rock for thousands of years, with cracks and clearings; the photo sets the pattern of the crust, and it spreads as a front.  The crust is where a slowly rising level passes a noise field made brighter by the photo's dark places;
 * thin cracks are cut into it, and the clearings show the rock in the photo's colours.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell   -> the growth of the crust (the level) (a slow signal)
 *   audioSpread  -> the density of the cracks (smoothed)
 *
 * Knobs: sizeP (the scale of the crust), hueP.
//@params sizeP
//@audio audioSwell audioSpread
//@body
void main()
{
    vec2 p = screenP();
    float sc = 2.0 + 3.0 * (1.0 - clamp(sizeP, 0.0, 1.0));
    vec3 c = imgLod(p * 0.85 + 0.5, 1.0);
    float n = fbm(p * sc + vec2(0.0, 0.02 * sceneTime)) + 0.25 * fbm(p * sc * 3.0);
    float field = n - 0.35 * (luma(c) - 0.5);
    float lvl = 0.35 + 0.35 * (0.5 + 0.5 * sin(0.03 * sceneTime)) + 0.2 * clamp(audioSwell, 0.0, 1.0);
    float crust = smoothstep(lvl + 0.04, lvl - 0.04, field);
    float ck = fbm(p * (30.0 + 40.0 * clamp(audioSpread, 0.0, 1.0)));
    float crack = 1.0 - smoothstep(0.0, 0.025, abs(ck - 0.5) - 0.0);
    vec3 rock = c * 1.15;
    vec3 varnish = mix(vec3(0.08, 0.05, 0.04), c * 0.25, 0.4) * (0.8 + 0.4 * noise2(p * 200.0));
    float sheen = pow(0.5 + 0.5 * sin(40.0 * field), 6.0) * 0.12;
    vec3 col = mix(rock, varnish + sheen, crust * (1.0 - crack * 0.85));
    finish(col * 1.1);
}
