//@doc
 * @brief TAYLOR COLUMN DYE CURTAINS: dye injected into a rotating tank of water: in the rotating fluid it cannot spread
 * along the axis, so it stands in tall vertical curtains -- Taylor columns -- that wind round the tank as it turns,
 * fine streaks running up and down them, the far curtains glimpsed behind the near.  The tank is seen from the side;
 * each curtain is a sheet on a cylinder round the axis, spanning an arc of angle that turns with the tank and twists a
 * little with height; a pixel finds where each sheet's front and back would project onto it and blends them far to
 * near.  The dyes are two or three tones from the photo's colour family; each onset makes the dye glow up.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance -> the tank turns (integrated: with the music's tempo and drive)
 *   audioOnset   -> the dye glows up (light)
 *   audioSwell   -> the curtains' density
 *
 * Knobs: curtainP (how many curtains), twistP (how much they twist with height), hueP.
//@params curtainP twistP
//@audio audioOnset audioSwell
//@body
void main()
{
    vec2 p = screenP();
    float fh = famHue();
    float N = floor(6.0 + 3.0 * clamp(curtainP, 0.0, 1.0));
    float twist = 0.3 + 0.8 * clamp(twistP, 0.0, 1.0);
    float rot = 0.1 * sceneTime + 0.4 * audioAdvance;
    float dens = 0.5 + 0.5 * clamp(audioSwell, 0.0, 1.0);
    float flash = clamp(audioOnset, 0.0, 1.0);
    vec3 col = famCol(fh, 0.45) * 0.03 * (1.0 - 0.5 * abs(p.x));
    // two passes: the back halves of the sheets first, then the fronts
    for (int side = 0; side < 2; ++side) {
        for (int i = 0; i < 9; ++i) {
            float fi = float(i);
            if (fi >= N) break;
            float hi = fract(sin(fi * 12.9898) * 43758.5453);
            float R = 0.35 + 0.45 * hi;
            float width = 0.35 + 0.4 * fract(hi * 7.3);
            float phi0 = 6.2831853 * fract(hi * 3.1) + rot * (0.8 + 0.4 * (1.0 - hi)) + twist * p.y;
            if (abs(p.x) >= R) continue;
            float a = asin(p.x / R);
            float phi = side == 0 ? 3.14159265 - a : a;                  // where the sheet would project here
            float da = abs(mod(phi - phi0 + 3.14159265, 6.2831853) - 3.14159265);
            float on = smoothstep(width, width * 0.6, da);
            float streak = 0.55 + 0.45 * noise2(vec2(phi * R * 40.0, p.y * 3.0 + 2.0 * fi));
            float ends = smoothstep(0.5, 0.35, abs(p.y));
            vec3 dye = famCol(fract(fh + 0.08 * (mod(fi, 3.0) - 1.0)), 0.4 + 0.3 * hi);
            float a0 = on * streak * ends * dens * (side == 0 ? 0.35 : 0.65);
            col = mix(col, dye * (0.5 + 0.6 * flash + 0.3 * streak), a0 * 0.8);
        }
    }
    finish(famExpose(col, 1.55, 1.00, 0.00, fh));
}
