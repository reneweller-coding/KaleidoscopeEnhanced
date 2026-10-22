//@doc
 * @brief SPHEROMAK TWIST: a stream of spheromaks -- rings of plasma whose field lines wind round them like twisted yarn
 * -- drifts toward the eye along a gently winding path, ring after ring like smoke rings made of light, and the view
 * passes through them; the field lines twist round as they come, and the rings brighten one after another over each
 * phrase.  A ring is a torus facing the eye; its field line winds q times round the tube while it goes once round the
 * ring, its poloidal start turning with the music; the curve is projected by depth and drawn as ninety-six segments,
 * brighter on the near side of the tube.  The light is shades of one colour family from the photo.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance   -> the flight through the rings and the field lines' twist (integrated)
 *   audioPhrasePos -> the rings brighten one after another, far to near, over each phrase
 *   audioSwell     -> the rings' glow
 *
 * Knobs: spaceP (the rings' spacing), twistP (how many times the field line winds), hueP.
//@params spaceP twistP
//@audio audioPhrasePos audioSwell
//@body
void main()
{
    vec2 p = screenP();
    float fh = famHue();
    float sp = 0.8 + 0.5 * clamp(spaceP, 0.0, 1.0);
    float q = 3.0 + floor(3.0 * clamp(twistP, 0.0, 1.0));
    float fly = 0.25 * sceneTime + 1.0 * audioAdvance;
    float tw = 0.3 * sceneTime + 1.2 * audioAdvance;
    float glow = 0.6 + 0.6 * clamp(audioSwell, 0.0, 1.0);
    vec2 cam = 0.25 * vec2(sin(0.21 * fly), cos(0.17 * fly));
    vec3 col = famCol(fh, 0.45) * 0.015;
    float k0 = floor(fly / sp) + 1.0;
    for (int j = 0; j < 6; ++j) {
        float k = k0 + float(j);
        float dz = k * sp - fly;
        vec2 c = 0.25 * vec2(sin(0.21 * k * sp), cos(0.17 * k * sp)) - cam;
        const float RR = 0.45, ar = 0.12;
        float best = 9.0, front = 0.0;
        vec2 prev = vec2(0.0);
        for (int s = 0; s <= 96; ++s) {
            float phi = 6.2831853 * float(s) / 96.0;
            float th = q * phi + tw + 1.7 * k;
            vec3 x = vec3(c + (RR + ar * cos(th)) * vec2(cos(phi), sin(phi)), dz + ar * sin(th));
            vec2 spt = x.xy / max(x.z, 0.05);
            if (s > 0) {
                vec2 ab = spt - prev, ap = p - prev;
                float d = length(ap - ab * clamp(dot(ap, ab) / max(dot(ab, ab), 1e-8), 0.0, 1.0));
                if (d < best) { best = d; front = 0.5 - 0.5 * sin(th); }
            }
            prev = spt;
        }
        float w = 0.002 + 0.004 / max(dz, 0.3);
        float fade = smoothstep(0.1, 0.7, dz) * smoothstep(6.0 * sp, 5.0 * sp, dz);
        float wave = 0.4 + 0.6 * pow(0.5 + 0.5 * cos(6.2831853 * (audioPhrasePos + 0.15 * k)), 3.0);   // (by the ring's own number)
        float g = exp(-pow(best / w, 2.0)) + 0.25 * exp(-best / (5.0 * w));
        col += famLight(fh, 0.3 + 0.4 * fract(0.37 * k), 0.45) * g * (0.35 + 0.65 * front) * fade * wave * glow;
    }
    finish(col);
}
