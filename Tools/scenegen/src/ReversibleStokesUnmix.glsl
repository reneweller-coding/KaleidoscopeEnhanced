//@doc
 * @brief REVERSIBLE STOKES UNMIX: G. I. Taylor's famous demonstration -- dye in a viscous fluid between two
 * cylinders is sheared into a thin spiral by turning the inner cylinder, so it looks hopelessly mixed; then the
 * cylinder is turned back the same number of turns and the dye un-mixes, exactly, because Stokes flow is
 * reversible.  Here the fluid is the photo, with blobs of a second cut of it as dye; the shear follows the
 * Couette profile, strongest at the inner cylinder.  Over a phrase it winds and unwinds: whole on the one.
 *
 * Audio Reactivity (structure, not only light):
 *   audioPhrasePos  -> the cylinder's turn: out to the phrase's middle, back to its one (continuous, exact)
 *   audioDrop       -> after a drop the next phrase winds more turns
 *   audioSwell      -> the dye blobs swell
 *   audioKick       -> the inner cylinder's rim flashes (light)
 *
 * Knobs: turnsP (how many turns at the middle), innerP (the inner cylinder's size), dyeP (how many dye blobs), hueP.
//@params turnsP innerP dyeP
//@audio audioSwell audioKick audioPhrasePos audioDrop
//@body
void main()
{
    vec2 p = screenP();
    float r = length(p), a = atan(p.y, p.x);
    float ri = 0.04 + 0.08 * clamp(innerP, 0.0, 1.0), ro = 1.15;
    float prog = audioPhrasePos > 0.001 ? audioPhrasePos : fract(sceneTime / 20.0);
    float turns = (1.5 + 4.0 * clamp(turnsP, 0.0, 1.0)) * (1.0 + 0.6 * clamp(audioDrop, 0.0, 1.0));
    float phi = 6.2831853 * turns * sin(3.14159265 * prog);     // out and back: zero on the phrase's one
    // the Couette profile: the angular displacement falls off as 1/r^2 from the inner to the outer cylinder
    float w = clamp((1.0 / (r * r) - 1.0 / (ro * ro)) / (1.0 / (ri * ri) - 1.0 / (ro * ro)), 0.0, 1.0);
    float a0 = a - phi * w;                                     // where this fluid was before the turn
    vec2 q = r * vec2(cos(a0), sin(a0));
    vec2 uv = q * 0.8 + 0.5;
    vec3 photo = imgLod(uv, 0.3 + 2.5 * smoothstep(1.0, 12.0, abs(phi) * w * r * 6.0 / 6.2831853));
    // the dye: soft blobs of a second cut of the photo, fixed in the unwound fluid
    float dye = 0.0;
    int nb = 3 + int(5.0 * clamp(dyeP, 0.0, 1.0));
    for (int i = 0; i < 8; ++i) {
        if (i >= nb) break;
        vec2 c = (vec2(hash11(float(i) * 3.1 + 0.4), hash11(float(i) * 5.7 + 0.2)) - 0.5) * vec2(1.5, 0.9);
        float rad = (0.06 + 0.05 * hash11(float(i) * 1.3)) * (1.0 + 0.4 * clamp(audioSwell, 0.0, 1.0));
        dye = max(dye, smoothstep(rad, rad * 0.6, length(q - c)));
    }
    vec3 second = imgLod(vec2(1.0 - uv.y, uv.x) * 1.2, 0.5);
    vec3 tone = imgPalette(0.6 + 0.03 * audioPhase);
    vec3 col = mix(photo, mix(second, second * tone * 1.8, 0.5) * 1.2, dye * 0.85);
    // the cylinders: the inner one dark with a lit rim
    float inner = smoothstep(ri, ri - 0.006, r);
    col = mix(col, vec3(0.02), inner);
    col += mix(tone, vec3(1.0), 0.5) * exp(-pow((r - ri) * 120.0, 2.0)) * (0.3 + 0.7 * clamp(audioKick, 0.0, 1.0));
    finish(col);
}
