//@doc
 * @brief GRANULAR OSCILLONS: a vibrated layer of round grains -- shaken hard enough, the layer answers at half the
 * drive frequency with patterns from its stability diagram: localised oscillons that hop up and down alone, then
 * stripes, squares and hexagons as the drive grows.  Every grain is a round, jittered bead coloured by the photo
 * beneath it; its height is the pattern's, lit from the side, so the crests and troughs flip on every second beat.
 *
 * Audio Reactivity (structure, not only light):
 *   audioBass       -> the drive amplitude: the pattern climbs the diagram from oscillons to stripes, squares and
 *                      hexagons (crossfaded)
 *   audioBarPhase   -> the layer's motion at half the beat (two up-and-downs a bar, continuous)
 *   audioSwell      -> the wavelength breathes
 *   audioPhase      -> the pattern's orientation turns (integrated)
 *   audioKick       -> the crests flash (light)
 *
 * Knobs: grainP (grain size), waveP (the pattern's wavelength in grains), driveP (the base drive), hueP.
//@params grainP waveP driveP
//@audio audioBass audioSwell audioKick audioBarPhase
//@body
/**  The pattern's height at a point for a drive amplitude: oscillons, stripes, squares and hexagons in turn.
 *
 * @param x      The point (screen units). (in)
 * @param k      The wavenumber. (in)
 * @param drive  The drive amplitude, 0..1. (in)
 *
 * @return
 *   The pattern's height, about -1..1.
 **/
float pattern(vec2 x, float k, float drive)
{
    float ang = 0.1 * audioPhase + 0.01 * sceneTime;
    vec2 e1 = vec2(cos(ang), sin(ang)), e2 = vec2(-e1.y, e1.x);
    vec2 e3 = vec2(cos(ang + 2.0944), sin(ang + 2.0944)), e4 = vec2(cos(ang - 2.0944), sin(ang - 2.0944));
    float stripes = cos(k * dot(x, e1));
    float squares = 0.5 * (cos(k * dot(x, e1)) + cos(k * dot(x, e2)));
    float hexes = (cos(k * dot(x, e1)) + cos(k * dot(x, e3)) + cos(k * dot(x, e4))) / 1.5;
    // oscillons: a few lone bumps wandering slowly over the layer
    float osc = 0.0;
    for (int i = 0; i < 6; ++i) {
        float fi = float(i);
        vec2 c = vec2(sin(0.031 * sceneTime + fi * 2.1) * 0.8, cos(0.027 * sceneTime + fi * 1.7) * 0.45);
        float r = length(x - c);
        osc += cos(k * r) * exp(-r * r * k * k / 30.0);
    }
    float w1 = smoothstep(0.15, 0.35, drive), w2 = smoothstep(0.4, 0.6, drive), w3 = smoothstep(0.65, 0.85, drive);
    return mix(mix(mix(osc, stripes, w1), squares, w2), hexes, w3);
}

void main()
{
    vec2 p = screenP();
    float gs = 0.013 + 0.012 * clamp(grainP, 0.0, 1.0);         // grain spacing (screen units)
    float k = 6.2831853 / (gs * (5.0 + 5.0 * clamp(waveP, 0.0, 1.0)) * (1.0 + 0.15 * clamp(audioSwell, 0.0, 1.0)));
    float drive = clamp(0.25 + 0.5 * clamp(driveP, 0.0, 1.0) + 0.5 * (clamp(audioBass, 0.0, 1.0) - 0.4), 0.0, 1.0);
    float sub = sin(6.2831853 * 2.0 * audioBarPhase);           // the answer at half the beat
    // the nearest grain: jittered centres on a grid, 3 x 3 cells searched
    vec2 g = p / gs;
    vec2 cell = floor(g);
    float best = 1e9;
    vec2 cen = vec2(0.0);
    for (int j = -1; j <= 1; ++j)
        for (int i = -1; i <= 1; ++i) {
            vec2 c = cell + vec2(i, j);
            vec2 o = c + 0.5 + 0.35 * (hash22(c) - 0.5);
            float d = length(g - o);
            if (d < best) { best = d; cen = o; }
        }
    vec2 x = cen * gs;
    float hgt = pattern(x, k, drive) * sub;
    // the grain: a bead with a rounded top, lifted by the pattern, lit from the upper left
    float rad = 0.46 + 0.04 * hgt;
    float bead = smoothstep(rad, rad - 0.08, best);
    vec2 dir = (g - cen) / max(rad, 1e-3);
    float dome = sqrt(max(1.0 - dot(dir, dir), 0.0));
    vec3 nrm = normalize(vec3(dir, dome + 0.2));
    vec3 photo = imgLod(x * 0.8 + 0.5, 1.0);
    float light = 0.45 + 0.55 * max(dot(nrm, normalize(vec3(-0.5, 0.6, 0.8))), 0.0);
    vec3 tone = imgPalette(0.3 + 0.2 * hgt + 0.03 * audioPhase);
    vec3 col = mix(photo, photo * tone * 1.6, 0.25) * light * (0.25 + 0.75 * (0.5 + 0.5 * hgt)) * bead * 1.3;
    col += mix(tone, vec3(1.0), 0.5) * bead * smoothstep(0.5, 1.0, hgt) * pow(dome, 4.0)
           * (0.3 + 0.6 * clamp(audioKick, 0.0, 1.0));
    col += photo * 0.06 * (1.0 - bead);                        // the gaps between the grains
    finish(col);
}
