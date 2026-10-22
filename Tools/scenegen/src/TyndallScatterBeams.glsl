//@doc
 * @brief TYNDALL SCATTER BEAMS: shafts of light in murky water, seen from the side: the fine particles scatter the short
 * wavelengths sideways and let the long ones through, so a beam seen across its path glows blue while a beam that
 * points toward the eye glows orange; the shafts wander, turning toward and away from the eye.  Each beam runs in space
 * from the surface down; its colour mixes blue and orange by how directly it travels toward the eye (the scattering
 * angle), and it fades with depth as the murk absorbs it; motes drift in the water.  The blue and orange are pulled a
 * little toward the photo's hue.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell   -> the murk: more scattering and faster fading
 *   audioAdvance -> the beams wander (integrated)
 *
 * Knobs: beamP (how many beams), widthP (their width), hueP.
//@params beamP widthP
//@audio audioSwell
//@body
void main()
{
    vec2 p = screenP();
    float fh = famHue();
    float N = floor(5.0 + 3.0 * clamp(beamP, 0.0, 1.0));
    float wb = 0.02 + 0.03 * clamp(widthP, 0.0, 1.0);
    float murk = 0.6 + 0.8 * clamp(audioSwell, 0.0, 1.0);
    float run = 0.03 * sceneTime + 0.12 * audioAdvance;
    float bh = fract(0.6 + 0.15 * (fract(fh - 0.6 + 0.5) - 0.5));
    float oh = fract(0.08 + 0.15 * (fract(fh - 0.08 + 0.5) - 0.5));
    vec3 blue = hsv2rgb(vec3(bh, 0.65, 1.0)), orange = hsv2rgb(vec3(oh, 0.7, 1.0));
    vec3 col = blue * 0.03 * (0.6 + 0.6 * fbm(2.0 * p + vec2(0.0, 0.2 * run)));
    for (int i = 0; i < 8; ++i) {
        float fi = float(i);
        if (fi >= N) break;
        float hi = fract(sin(fi * 12.9898) * 43758.5453);
        float sx = 1.6 * ((fi + 0.5) / N - 0.5) + 0.1 * sin(run + 6.0 * hi);
        float tiltX = 0.35 * sin(0.7 * run + 2.0 * fi);
        float toward = 0.9 * sin(0.5 * run + 6.0 * hi);                // the beam's z: toward (+) or away from the eye
        vec3 d = normalize(vec3(tiltX, -1.0, -toward));
        vec2 dir = normalize(d.xy);
        vec2 rel = p - vec2(sx, 0.55);
        float along = dot(rel, dir), across = abs(dot(rel, vec2(-dir.y, dir.x)));
        float w = wb * (1.0 + 0.6 * along);
        float beam = smoothstep(w, w * 0.3, across) * step(0.0, along);
        float fwd = clamp(-d.z, 0.0, 1.0);                             // how directly toward the eye
        vec3 c = mix(blue, orange, smoothstep(0.2, 0.9, fwd));
        float scat = mix(0.35, 1.0, fwd) * murk;
        col += c * beam * scat * exp(-along * 1.0 * murk) * 1.3;
    }
    float motes = smoothstep(0.82, 0.95, noise2(p * 90.0 + vec2(0.0, run * 3.0)));
    col += mix(blue, vec3(1.0), 0.5) * motes * 0.12;
    finish(col);
}
