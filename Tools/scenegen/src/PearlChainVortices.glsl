//@doc
 * @brief PEARL CHAIN VORTICES: chains of glowing pearls winding round each other like vortex filaments -- several
 * chains twisting about a common axis that runs through the depth, each pearl a round soft light, the twist
 * tightening and loosening along the chains -- while the whole braid turns slowly.  A pearl's place is its chain's
 * helix at its depth plus a slow wave of the filament; the near pearls are large and soft.  The pearls' light is
 * shades of one colour family from the photo.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance -> the winding runs along the chains (integrated): the braid turns
 *   audioLevel   -> how many chains glow (the last fades in by its share)
 *   audioSwell   -> the pearls' glow
 *
 * Knobs: pearlP (how close the pearls sit), twistP (how tight the twist is), hueP.
//@params pearlP twistP
//@audio audioLevel audioSwell
//@body
void main()
{
    vec2 p = screenP();
    float fh = famHue();
    float chains = 2.0 + 3.0 * clamp(audioLevel, 0.0, 1.0);
    float step_ = 0.16 - 0.06 * clamp(pearlP, 0.0, 1.0);
    float twist = 1.2 + 1.2 * clamp(twistP, 0.0, 1.0);
    float run = 0.2 * sceneTime + 0.8 * audioAdvance;
    float glow = 0.7 + 0.6 * clamp(audioSwell, 0.0, 1.0);
    vec3 col = famCol(fh, 0.45) * 0.012;
    for (int c = 0; c < 5; ++c) {
        float fc = float(c);
        float on = clamp(chains - fc, 0.0, 1.0);
        if (on <= 0.0) break;
        for (int i = 0; i < 40; ++i) {
            float z = 0.6 + float(i) * step_;
            if (z > 6.0) break;
            float a = twist * z + run + 6.2831853 * fc / 5.0;
            float R = 0.22 + 0.08 * sin(0.7 * z + fc);
            vec3 x = vec3(R * cos(a) + 0.15 * sin(0.4 * z + 0.3 * run), R * sin(a) + 0.1 * cos(0.5 * z), z);
            vec2 sp = x.xy / x.z * 1.3;
            float size = 0.004 + 0.02 / x.z;
            float d = length(p - sp);
            float g = smoothstep(size, size * 0.65, d) + 0.25 * exp(-d / (size * 2.0));
            col += famLight(fh, fc / 4.0, 0.4) * g * on * glow * (1.2 / x.z) * smoothstep(0.6, 0.9, z);
        }
    }
    finish(famExpose(col, 2.20, 0.80, 0.03, fh));
}
