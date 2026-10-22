//@doc
 * @brief FILAMENT COIL MACRO: incandescent filaments in macro: spirals of light, coiled coils -- a fine helix
 * wound round a coarser helix -- running through the depth, glowing white-hot at their hearts and coloured at
 * their edges, out of focus where they come near.  Each coil is a 3D curve (the coarse helix along a gently bending
 * path, the fine helix round it), sampled and projected in perspective; its glow widens and softens with nearness,
 * as a macro lens blurs.  The glow is a shade of the photo's colour family, turning white where it is brightest.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell   -> the glow breathes: the coils run hotter
 *   audioOnset   -> one coil flares up
 *   audioAdvance -> the view drifts along the coils (integrated)
 *
 * Knobs: coilP (the fine coil's density), focusP (where the focus lies), hueP.
//@params coilP focusP
//@audio audioSwell audioOnset
//@body
void main()
{
    vec2 p = screenP();
    float fh = famHue();
    float turns = 30.0 + 30.0 * clamp(coilP, 0.0, 1.0);
    float focus = 1.6 + 1.4 * clamp(focusP, 0.0, 1.0);
    float heat = 0.6 + 0.6 * clamp(audioSwell, 0.0, 1.0);
    float flare = clamp(audioOnset, 0.0, 1.0);
    float drift = 0.04 * sceneTime + 0.18 * audioAdvance;
    vec3 col = vec3(0.0);
    for (int c = 0; c < 5; ++c) {
        float fc = float(c);
        float best = 1e9, bestZ = 2.0;
        vec2 prev = vec2(0.0);
        bool have = false;
        for (int i = 0; i <= 200; ++i) {
            float s = float(i) / 200.0;
            // the coarse helix runs through the depth along a bending path
            float z = 0.6 + 4.0 * s;
            float a = 6.2831853 * 4.0 * s + drift * 2.0 + 2.1 * fc;
            vec3 axis = vec3(0.7 * sin(0.9 * z + 1.7 * fc + drift) + 0.5 * (fc - 2.0) / 2.0, 0.45 * cos(0.7 * z + fc), z);
            vec3 coarse = axis + 0.18 * vec3(cos(a), sin(a), 0.0);
            // the fine helix round it
            float b = 6.2831853 * turns * s;
            vec3 x = coarse + 0.035 * vec3(cos(b) * cos(a), cos(b) * sin(a), sin(b));
            vec2 sp = x.xy / x.z;
            if (have) {
                vec2 e = sp - prev;
                float d = length(p - prev - e * clamp(dot(p - prev, e) / max(dot(e, e), 1e-8), 0.0, 1.0));
                if (d < best) { best = d; bestZ = x.z; }
            }
            prev = sp;
            have = true;
        }
        // the macro lens: the glow widens out of focus
        float blur = 0.002 + 0.012 * abs(bestZ - focus) / bestZ;
        float g = exp(-pow(best / blur, 2.0)) * (0.004 / blur) + 0.1 * exp(-best / (4.0 * blur));
        float which = pow(0.5 + 0.5 * cos(6.2831853 * (0.1 * sceneTime - fc / 5.0)), 4.0);   // the coil the flare favours
        float hot = (1.0 + 2.0 * flare * which) * heat;
        col += famLight(fh, 0.05 + 0.1 * fc, 0.6 * smoothstep(0.3, 1.0, g)) * g * hot * 0.8;
    }
    finish(col);
}
