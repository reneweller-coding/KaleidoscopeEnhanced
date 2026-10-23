//@doc
 * @brief ROCHE TIDAL STRETCH: the Roche limit: a body that comes too close to a planet is torn into strands; the photo is stretched along the tidal lines and frays as it comes nearer.  The planet is a dark disc at the side; round it the photo's distance from the planet is stretched by a factor that grows towards
 * the disc, and fine radial strands mark the tearing.  The approach is periodic with the phrase.
 *
 * Audio Reactivity (structure, not only light):
 *   audioPhrasePos -> the approach: nearer and farther over the phrase (periodic)
 *   audioAdvance   -> the direction turns slowly (integrated)
 *
 * Knobs: sizeP (the size of the planet), hueP.
//@params sizeP
//@audio audioAdvance audioPhrasePos
//@body
void main()
{
    vec2 p = screenP();
    float asp = resolution.x / resolution.y;
    float ang = 0.012 * audioAdvance + 0.01 * sceneTime;
    vec2 pl = 0.38 * asp * 0.5 * vec2(-cos(ang), -sin(ang)) * 1.2;
    float Rp = 0.12 + 0.1 * clamp(sizeP, 0.0, 1.0);
    vec2 d = p - pl;
    float r = length(d) + 1e-4;
    float nearness = 0.5 - 0.5 * cos(6.2831853 * audioPhrasePos);
    float A = 0.15 + 0.7 * nearness;
    float rs = r + A * Rp * 3.0 * exp(-(r - Rp) / (Rp * 1.5)) * smoothstep(Rp * 0.9, Rp * 1.2, r);
    vec2 uvp = pl + d / r * rs;
    float a = atan(d.y, d.x);
    float strand = noise2(vec2(a * 45.0, r * 3.0)) * 0.6 + noise2(vec2(a * 110.0, r * 6.0)) * 0.4;
    vec3 c = imgLod(uvp * 0.85 + 0.5, 0.6 + 2.0 * nearness * exp(-(r - Rp) * 5.0));
    float frayed = smoothstep(0.35, 0.65, strand);
    float tear = nearness * exp(-(r - Rp) / (Rp * 2.0));
    c *= mix(1.0, 0.45 + 0.9 * frayed, clamp(tear * 1.4, 0.0, 1.0));
    float disc = 1.0 - smoothstep(Rp * 0.97, Rp * 1.0, r);
    float limb = exp(-pow((r - Rp) / (Rp * 0.12), 2.0)) * 0.35;
    vec3 col = c * (1.0 - disc) + vec3(0.01, 0.01, 0.02) * disc + vec3(1.0, 0.8, 0.5) * limb;
    finish(col * 1.1);
}
