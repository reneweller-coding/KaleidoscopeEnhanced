//@doc
 * @brief CIRCLE PATTERN FLOW: a square grid of touching circles carried through a conformal map -- a power z^a that
 * opens and closes like a fan, wrapped in a logarithmic spiral -- so the circles stay circles (very nearly) while
 * they grow, shrink and curve into spirals: a discrete conformal map, as in Thurston's circle packings.  Each circle
 * holds the photo, mapped conformally too; the gaps between them glow.
 *
 * Audio Reactivity (structure, not only light):
 *   audioHarmAdvance -> each change of harmony opens or closes the fan a step (the power a glides; no zoom on the beat)
 *   audioAdvance    -> the circles stream along the spiral (integrated)
 *   audioKick       -> the gaps flash (light)
 *
 * Knobs: gridP (circles across), spiralP (how much the pattern spirals), photoP (photo share), hueP.
//@params gridP spiralP photoP
//@audio audioKick audioHarmAdvance
//@body
void main()
{
    vec2 p = screenP();
    // the inverse conformal map: the log plane (log r, theta), scaled by the power a; the grid there has a whole
    // number of cells round the circle and a whole number of shear steps per turn, so the spiral has no seam
    float r = max(length(p), 1e-4), th = atan(p.y, p.x);
    float a = 0.7 + 0.6 * abs(fract(max(audioHarmAdvance, 0.0) / 6.0) * 2.0 - 1.0) + 0.1 * sin(0.03 * sceneTime);
    float n = 1.5 + 2.0 * clamp(gridP, 0.0, 1.0);
    float nc = floor(6.2831853 * n + 0.5);                      // cells round the circle (fixed: no jumps)
    float k = floor(3.99 * clamp(spiralP, 0.0, 1.0));          // shear steps per turn: the spiral's arms
    float v = th / 6.2831853;
    vec2 g = vec2(log(r) / a * n - k * v - 0.15 * sceneTime - 0.02 * audioAdvance, v * nc);
    vec2 cell = floor(g), f = fract(g) - 0.5;
    float d = length(f);
    float inside = smoothstep(0.5, 0.47, d);
    float hh = hash21(vec2(mod(cell.x, 9.0), mod(cell.y, nc)));
    vec2 uv = f * 0.5 + 0.5 + vec2(hh, fract(hh * 5.7)) * 0.3;
    vec3 photo = imgLod(uv * 0.7 + 0.15, 0.5);
    vec3 tone = imgPalette(hh + 0.03 * audioPhase);
    vec3 col = mix(tone * 1.2, photo * 1.2, 0.4 + 0.5 * clamp(photoP, 0.0, 1.0)) * inside * (0.75 + 0.35 * hh);
    float gap = (1.0 - inside) * smoothstep(0.75, 0.5, d);
    col += mix(tone, vec3(1.0), 0.5) * gap * (0.25 + 0.6 * clamp(audioKick, 0.0, 1.0));
    col *= smoothstep(0.0, 0.03, r);
    finish(col);
}
