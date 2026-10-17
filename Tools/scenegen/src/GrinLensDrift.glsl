//@doc
 * @brief GRIN LENS DRIFT: gradient-index lenses drifting over the photo -- discs of glass whose refractive index
 * falls from the centre to the rim.  A Maxwell fish-eye images every point on its antipode, so inside it the photo
 * is turned inside out and upside down; a Luneburg lens gathers the picture toward its far rim.  Several of them
 * float across the frame, overlapping; their rims glint.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell      -> the lenses' strength (how far they bend the picture)
 *   audioPhase      -> their drift (integrated)
 *   audioKick       -> the rims glint (light)
 *
 * Knobs: lensesP (how many lenses), sizeP (their size), kindP (fish-eye or Luneburg), hueP.
//@params lensesP sizeP kindP
//@audio audioSwell audioKick
//@body
void main()
{
    vec2 p = screenP();
    vec2 q = p;
    int n = 2 + int(4.0 * clamp(lensesP, 0.0, 1.0));
    float R = 0.18 + 0.2 * clamp(sizeP, 0.0, 1.0);
    float str = 0.5 + 0.5 * clamp(audioSwell, 0.0, 1.0);
    float rimLight = 0.0;
    for (int i = 0; i < 6; ++i) {
        if (i >= n) break;
        float fi = float(i);
        vec2 c = vec2(0.8 * sin(0.02 * sceneTime + 0.01 * audioPhase + fi * 2.1), 0.45 * cos(0.017 * sceneTime + fi * 1.3));
        vec2 d = q - c;
        float r = length(d) / R;
        if (r < 1.0) {
            vec2 u = d / R;
            // the fish-eye: a point maps toward its antipode (an inversion through the rim); the Luneburg lens
            // gathers toward the far rim along the view direction
            vec2 fish = -u / max(dot(u, u), 0.05) * 0.5 + u * 0.5;
            vec2 lune = u + vec2(0.0, 1.0 - sqrt(max(1.0 - dot(u, u), 0.0))) * sign(u.y + 1e-4);
            vec2 m = mix(fish, lune, clamp(kindP, 0.0, 1.0));
            q = c + mix(u, m, str * smoothstep(1.0, 0.85, r)) * R;
        }
        rimLight = max(rimLight, exp(-pow((r - 1.0) * 40.0, 2.0)));
    }
    vec3 col = imgLod(q * 0.7 + 0.5, 0.4);
    vec3 tone = imgPalette(0.4 + 0.03 * audioPhase);
    col += mix(tone, vec3(1.0), 0.6) * rimLight * 0.4 * (0.5 + clamp(audioKick, 0.0, 1.0));
    finish(col);
}
