//@doc
 * @brief ELECTRON BEAM HELICES: electron beams in a magnetic field, as in a fine-beam tube: many glowing beams in a dark
 * room, each winding along its own direction as a helix, some nearly closed circles, some long screws; the stronger
 * the field, the tighter they wind.  A beam is a helix round its axis in space, radius v_perp / B and turning by the
 * gyration, seen in perspective and drawn as ninety-six segments, brighter where it runs near the eye; the helices'
 * phase runs on, so they seem to screw along.  The light is shades of one colour family from the photo.
 *
 * Audio Reactivity (structure, not only light):
 *   audioBass    -> the field's strength: the helices wind tighter (softened by the swell)
 *   audioAdvance -> the helices screw along (integrated)
 *   audioSwell   -> the beams' glow
 *
 * Knobs: beamP (how many beams), pitchP (how long the screws are), hueP.
//@params beamP pitchP
//@audio audioBass audioSwell
//@body
void main()
{
    vec2 p = screenP();
    float fh = famHue();
    float N = floor(4.0 + 3.0 * clamp(beamP, 0.0, 1.0));
    float pitch = 0.05 + 0.12 * clamp(pitchP, 0.0, 1.0);
    float sw = clamp(audioSwell, 0.0, 1.0);
    float B = 0.8 + 0.6 * mix(sw, clamp(audioBass, 0.0, 1.0), 0.4);
    float run = 0.3 * sceneTime + 1.2 * audioAdvance;
    vec3 col = famCol(fh, 0.45) * 0.015;
    for (int i = 0; i < 7; ++i) {
        float fi = float(i);
        if (fi >= N) break;
        float h1 = fract(sin(fi * 12.9898) * 43758.5453), h2 = fract(sin(fi * 78.233) * 43758.5453);
        float h3 = fract(sin(fi * 37.719) * 43758.5453);
        vec3 ax = normalize(vec3(cos(6.2831853 * h1), 0.6 * (h2 - 0.5), 0.8 * sin(6.2831853 * h1)));
        vec3 u1 = normalize(cross(ax, vec3(0.2, 1.0, 0.3))), u2 = cross(ax, u1);
        vec3 a0 = vec3(1.6 * (h2 - 0.5), 0.8 * (h3 - 0.5), 2.0 + 0.8 * h1) - ax * 0.9;
        float rad = (0.14 + 0.14 * h3) / B;
        float best = 9.0, near = 0.0;
        vec2 prev = vec2(0.0);
        for (int k = 0; k <= 96; ++k) {
            float t = float(k) / 96.0;
            float ph = 6.2831853 * t * (1.8 / (pitch * (0.6 + 0.8 * h2))) * 0.15 - run * (1.0 + 0.3 * h1);
            vec3 x = a0 + ax * 1.8 * t + rad * (cos(ph) * u1 + sin(ph) * u2);
            vec2 sp = x.xy / max(x.z, 0.3);
            if (k > 0) {
                vec2 ab = sp - prev, ap = p - prev;
                float d = length(ap - ab * clamp(dot(ap, ab) / max(dot(ab, ab), 1e-8), 0.0, 1.0));
                if (d < best) { best = d; near = 1.0 / max(x.z, 0.3); }
            }
            prev = sp;
        }
        float w = 0.0012 + 0.0018 * near;
        float g = exp(-pow(best / w, 2.0)) + 0.25 * exp(-best / (6.0 * w));
        col += famLight(fh, 0.3 + 0.4 * h3, 0.45) * g * near * 1.4 * (0.6 + 0.6 * sw);
    }
    finish(col);
}
