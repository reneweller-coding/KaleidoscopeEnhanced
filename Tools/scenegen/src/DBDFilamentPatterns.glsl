//@doc
 * @brief DBD FILAMENT PATTERNS: a dielectric barrier discharge seen through its glass: thousands of tiny glowing
 * filaments that arrange themselves -- into a hexagonal array at one voltage, into winding stripes at another, and into
 * rotating spirals when the section turns -- flickering softly, violet.  The filaments sit on a hexagonal lattice; each
 * shows where the active pattern allows it: everywhere for the array, along the crests of a slowly drifting stripe
 * field for the stripes, along logarithmic spiral arms for the spirals; the patterns cross-fade.  Each filament's
 * flicker rides slow noise.  The violet is pulled a little toward the photo's hue.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell         -> the voltage: the array melts into stripes as the music swells
 *   audioSectionId/Age -> every other section the filaments gather into spirals (cross-faded over six seconds)
 *   audioAdvance       -> the stripes drift and the spirals turn (integrated)
 *
 * Knobs: cellP (the filaments' spacing), glowP (how far their glow spreads), hueP.
//@params cellP glowP
//@audio audioSwell audioSectionId audioSectionPrev audioSectionAge
//@body
void main()
{
    vec2 p = screenP();
    float fh = famHue();
    float vh = fract(0.78 + 0.3 * (fract(fh - 0.78 + 0.5) - 0.5));
    float S = 0.022 + 0.014 * clamp(cellP, 0.0, 1.0);
    float spread = 0.6 + 0.8 * clamp(glowP, 0.0, 1.0);
    float volt = smoothstep(0.3, 0.7, clamp(audioSwell, 0.0, 1.0));
    float m = smoothstep(0.0, 6.0, audioSectionAge);
    float spir = mix(mod(max(audioSectionPrev, 0.0), 2.0), mod(max(audioSectionId, 0.0), 2.0), m);
    float run = 0.05 * sceneTime + 0.2 * audioAdvance;
    vec2 g = p / S;
    const vec2 R = vec2(1.0, 1.7320508);
    vec2 qa = mod(g, R) - 0.5 * R, qb = mod(g - 0.5 * R, R) - 0.5 * R;
    vec2 q = dot(qa, qa) < dot(qb, qb) ? qa : qb;
    vec2 c = (g - q) * S;                                             // the filament's place
    float hf = hash21(floor((g - q) * 2.0 + 0.5));
    // where the patterns allow a filament
    float stripes = smoothstep(0.55, 0.85, 0.5 + 0.5 * sin(14.0 * (c.y + 0.25 * fbm(2.0 * c + vec2(0.1 * run, 0.0))) + 2.0 * fbm(1.3 * c - 0.05 * run)));
    float rc = max(length(c), 1e-3);
    float arms = smoothstep(0.5, 0.85, 0.5 + 0.5 * cos(3.0 * atan(c.y, c.x) + 9.0 * log(rc) - 2.0 * run));
    float allow = mix(mix(1.0, stripes, volt), arms, spir);
    float flick = 0.65 + 0.35 * noise2(vec2(hf * 50.0, 0.6 * sceneTime + 2.0 * run));
    float d = length(q) * S;
    float fil = exp(-pow(d / (0.0028 + 0.0012 * hf), 2.0)) + 0.4 * exp(-d / (0.005 * spread));
    vec3 col = famCol(vh, 0.45) * 0.02 + famLight(vh, 0.3 + 0.4 * hf, 0.45) * fil * allow * flick * 1.8;
    finish(famExpose(col, 6.53, 0.80, 0.03, fh));
}
