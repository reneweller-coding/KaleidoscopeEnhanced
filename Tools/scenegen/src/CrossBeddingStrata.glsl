//@doc
 * @brief CROSS BEDDING STRATA: cross-bedding: diagonal laminae, each set of them cut off at the top by the surface of the next dune, so that one looks at a cut face of truncated sheaves; the sets lie one above the other with
 * wavy erosion surfaces between, each set with its own slope of laminae, the colours taken from the photo along every lamina.  The slope follows the phase of the music, the number of sets the spectral spread.
 *
 * Audio Reactivity (structure, not only light):
 *   audioPhase      -> the slope of the laminae (integrated, slow)
 *   audioSpread     -> the number of sets
 *
 * Knobs: laminaP (how fine the laminae are), hueP.
//@params laminaP
//@audio audioSpread
//@body
void main()
{
    vec2 p = screenP();
    float Ns = 3.0 + 4.0 * clamp(audioSpread, 0.0, 1.0);
    float yy = (0.5 - p.y);
    float surf = yy * Ns + 0.25 * sin(3.0 * p.x + 0.4 * sin(0.02 * sceneTime)) + 0.1 * sin(7.0 * p.x + 1.0);
    float k = floor(surf);
    float f = fract(surf);
    float ang = 0.4 + 0.5 * hash21(vec2(k, 2.0)) + 0.1 * sin(0.03 * audioPhase + k);
    vec2 n = vec2(-sin(ang), cos(ang));
    float N = 30.0 + 50.0 * clamp(laminaP, 0.0, 1.0);
    float lam = dot(p, n) * N;
    float lb = floor(lam);
    vec3 band = imgLod(vec2(fract(lb * 0.0137 + k * 0.31), 0.3 + 0.4 * fract(lb * 0.071)) * 0.8 + 0.1, 3.0);
    vec3 pc = imgLod(p * 0.8 + 0.5, 1.5);
    float lf = fract(lam);
    float lines = 0.7 + 0.3 * smoothstep(0.0, 0.2, lf) * smoothstep(1.0, 0.8, lf);
    float trunc = smoothstep(0.0, 0.05, f) * smoothstep(1.0, 0.97, f);
    finish(mix(band, pc, 0.5) * lines * (0.5 + 0.5 * trunc) * 1.15);
}
