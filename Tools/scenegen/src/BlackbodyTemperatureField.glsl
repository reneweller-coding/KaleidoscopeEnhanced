//@doc
 * @brief BLACKBODY TEMPERATURE FIELD: a turbulent field of heat shown in the colours of a glowing body -- dull red where
 * it is coolest, through orange and yellow to blue-white where it is hottest -- swirling and flaring; the photo gives
 * the field's ground pattern of warmth, the music its heat and its turbulence.  The temperature is the photo's broad
 * lightness plus warped turbulence, raised by the swell; its colour follows the stations of a glowing body's colours
 * -- dark red, red, orange, yellow, white, blue-white -- deepened into a saturated glow ramp (true blackbody colours
 * are pale from about 3500 kelvin on and read as sepia), and its brightness grows with the temperature.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell     -> the heat: the whole field runs hotter
 *   audioRoughness -> the turbulence: the rougher the sound, the more the heat swirls (softened by the swell)
 *   audioAdvance   -> the turbulence flows (integrated)
 *
 * Knobs: heatP (the base heat), scaleP (the turbulence's scale).
//@params heatP scaleP
//@audio audioSwell audioRoughness
//@body
/**  The glow ramp: a glowing body's colour stations, saturated.
 *
 * @param x  The heat, 0 cold .. 1 hottest. (in)
 *
 * @return
 *   The colour.
 **/
vec3 glowRamp(float x)
{
    vec3 c = mix(vec3(0.0), vec3(0.5, 0.02, 0.0), smoothstep(0.0, 0.2, x));
    c = mix(c, vec3(1.0, 0.22, 0.02), smoothstep(0.2, 0.4, x));
    c = mix(c, vec3(1.0, 0.62, 0.08), smoothstep(0.4, 0.6, x));
    c = mix(c, vec3(1.0, 0.95, 0.55), smoothstep(0.6, 0.8, x));
    return mix(c, vec3(0.75, 0.85, 1.0), smoothstep(0.8, 1.0, x));
}

void main()
{
    vec2 p = screenP();
    float sw = clamp(audioSwell, 0.0, 1.0);
    float sc = 1.5 + 1.5 * clamp(scaleP, 0.0, 1.0);
    float turb = 0.15 + 0.35 * mix(sw, clamp(audioRoughness, 0.0, 1.0), 0.5);
    float run = 0.04 * sceneTime + 0.16 * audioAdvance;
    float base = luma(imgLod(p * 0.5 + 0.5, 4.5));
    vec2 w = p * sc + turb * 2.0 * (vec2(fbm(p * sc * 0.7 + vec2(run, 0.0)), fbm(p * sc * 0.7 + vec2(3.7, -run))) - 0.5);
    float f = fbm(w + vec2(0.3 * run, -0.5 * run));
    float heat = clamp(0.6 * base + 0.9 * f - 0.3 + 0.35 * sw + 0.2 * clamp(heatP, 0.0, 1.0), 0.0, 1.0);
    vec3 col = glowRamp(heat) * (0.4 + 0.9 * heat);
    finish(col);
}
