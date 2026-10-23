//@doc
 * @brief SCREENTONE BANDS: manga screentone: every brightness step gets another pattern -- dots, lines, cross-hatching, sand -- and the patterns run and turn, the steps wandering with a threshold: the
 * photo as an inked page tinted by its own colours.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell      -> the thresholds (the tones climb the steps)
 *   audioSectionId/Age -> a new section changes the patterns of the steps (the old ones fade out)
 *
 * Knobs: gridP (the screen's fineness), hueP.
//@params gridP
//@audio audioSwell audioSectionId audioSectionPrev audioSectionAge
//@body
void main()
{
    vec2 p = screenP();
    vec2 uv = p * 0.8 + 0.5;
    float t = 0.05 * sceneTime + 0.4 * audioPhase;
    float N = 40.0 + 50.0 * clamp(gridP, 0.0, 1.0);
    vec3 c = imgLod(uv, 1.0);
    float L = clamp(luma(c) + 0.2 * (clamp(audioSwell, 0.0, 1.0) - 0.5), 0.0, 0.999);
    float sec = mix(mod(max(audioSectionPrev, 0.0), 3.0), mod(max(audioSectionId, 0.0), 3.0), smoothstep(0.0, 6.0, audioSectionAge));
    vec2 q = rot2(0.5 + 0.2 * sin(t)) * p * N + vec2(0.3 * t, 0.0);
    vec2 f = fract(q) - 0.5;
    float tone = 0.0;
    float lvl = (1.0 - L) * 4.0;
    float dots = smoothstep(0.1, -0.1, length(f) - 0.5 * sqrt(clamp(lvl, 0.0, 1.0)));
    float lines = smoothstep(0.1, -0.1, abs(f.y) - 0.42 * clamp(lvl - 0.6, 0.0, 1.0));
    float crs = max(smoothstep(0.08, -0.08, abs(f.y) - 0.28 * clamp(lvl - 1.6, 0.0, 1.0)), smoothstep(0.08, -0.08, abs(f.x) - 0.28 * clamp(lvl - 1.6, 0.0, 1.0)));
    float sand = smoothstep(0.0, 0.1, clamp(lvl - 2.6, 0.0, 1.0) * 0.7 + 0.15 * (hash21(floor(q * 3.0)) - 0.5) + 0.2 * clamp(lvl - 3.3, 0.0, 1.0) - 0.15);
    float a = lvl < 1.0 ? dots : (lvl < 2.0 ? mix(dots, lines, lvl - 1.0) : (lvl < 3.0 ? mix(lines, crs, lvl - 2.0) : mix(crs, sand, lvl - 3.0)));
    a = mix(a, 1.0 - a, 0.0 * sec);
    vec3 ink = vec3(0.05) + 0.25 * c;
    vec3 col = mix(vec3(0.96) * (0.7 + 0.45 * c), ink, clamp(a * (0.85 + 0.15 * sin(sec)), 0.0, 1.0));
    finish(col * 1.05);
}
