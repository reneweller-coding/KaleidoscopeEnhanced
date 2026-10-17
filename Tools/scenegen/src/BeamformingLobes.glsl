//@doc
 * @brief BEAMFORMING LOBES: a phased array -- a row of sources, each delayed a little more than its neighbour, so
 * their waves add up into beams: a main lobe and its side lobes swing across the interference field as the delay
 * changes.  Two arrays, mirrored top and bottom, steer their fans toward each other; the lobes carry the photo's
 * colours, the nulls between them stay dark.
 *
 * Audio Reactivity (structure, not only light):
 *   audioCentroid   -> the steering angle: bright music swings the beams one way, dark music the other (smoothed)
 *   audioSpread     -> the number of lobes (the array's spacing)
 *   audioPhase      -> the waves travel out (integrated)
 *   audioKick       -> the main lobe flashes (light)
 *
 * Knobs: elementsP (sources in the array), waveP (the wavelength), photoP (photo share), hueP.
//@params elementsP waveP photoP
//@audio audioKick audioCentroid audioSpread
//@body
void main()
{
    vec2 p = screenP();
    vec2 q = vec2(p.x, 0.5 - abs(p.y));                         // two arrays, at the top and bottom edges
    int n = 5 + int(10.0 * clamp(elementsP, 0.0, 1.0));
    float lam = 0.03 + 0.04 * clamp(waveP, 0.0, 1.0);
    float k = 6.2831853 / lam;
    float spacing = lam * (0.5 + 1.5 * clamp(audioSpread, 0.0, 1.0));
    float steer = 0.8 * (clamp(audioCentroid, 0.0, 1.0) - 0.5) + 0.4 * sin(0.05 * sceneTime);
    float delta = k * spacing * sin(steer);                     // the phase step between neighbours
    float wt = 0.6 * audioPhase + 2.0 * sceneTime;
    vec2 s = vec2(0.0);
    for (int i = 0; i < 15; ++i) {
        if (i >= n) break;
        float xi = (float(i) - 0.5 * float(n - 1)) * spacing;
        float r = length(q - vec2(xi, 0.0));
        float ph = k * r - wt - delta * float(i);
        s += vec2(cos(ph), sin(ph)) / sqrt(max(r, 0.02));
    }
    float I = dot(s, s) / float(n);
    float lit = 1.0 - exp(-I * 0.25);
    float wave = 0.5 + 0.5 * cos(atan(s.y, s.x));                // the travelling crests inside the lobes
    vec2 uv = p * 0.7 + 0.5;
    vec3 photo = imgLod(uv, 0.6);
    vec3 tone = imgPalette(0.2 + 0.3 * lit + 0.03 * audioPhase);
    vec3 col = mix(tone * 1.2, photo * 1.4, 0.35 + 0.5 * clamp(photoP, 0.0, 1.0)) * lit * (0.6 + 0.4 * wave) + photo * 0.05;
    col += mix(tone, vec3(1.0), 0.6) * smoothstep(0.8, 1.0, lit) * 0.3 * (0.5 + clamp(audioKick, 0.0, 1.0));
    finish(col);
}
