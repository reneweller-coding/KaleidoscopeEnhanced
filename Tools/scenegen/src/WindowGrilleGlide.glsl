//@doc
 * @brief WINDOW GRILLE GLIDE: the shadow of a window grille with rosettes glides over the photo: a lattice of bars with a rosette -- a ring of petals with an open heart -- at every crossing, so that at the crossings points of light
 * remain in the shade; the shadow glides in a direction that turns slowly with the phase of the music, over the photo as the sun moves over the floor.  Light warm, shade cool, the edges softening as the shade moves away.
 *
 * Audio Reactivity (structure, not only light):
 *   audioPhase      -> the direction in which the shadow glides (integrated)
 *   audioSwell      -> the density of the shade
 *
 * Knobs: gridP (the size of the grille), hueP.
//@params gridP
//@audio audioSwell
//@body
/**  The photo lit by a warm light and shaded by a soft shadow.
 *
 * @param c    The photo's colour. (in)
 * @param sh   The shadow, 0 lit .. 1 in shade. (in)
 * @param den  How dark the shade is, 0..1. (in)
 *
 * @return
 *   The colour.
 **/
vec3 lightAndShade(vec3 c, float sh, float den)
{
    vec3 lit = c * vec3(1.12, 1.03, 0.88) * 1.1;
    vec3 shade = c * vec3(0.55, 0.66, 0.82) * (1.0 - 0.6 * den);
    return mix(lit, shade, clamp(sh, 0.0, 1.0));
}
void main()
{
    vec2 p = screenP();
    float gl = 0.1 * audioPhase + 0.02 * sceneTime;
    vec2 q = p + 0.35 * vec2(cos(gl), sin(0.7 * gl));
    float s = 0.42 - 0.2 * clamp(gridP, 0.0, 1.0);
    vec2 f = (q / s - floor(q / s + 0.5));
    float bars = max(smoothstep(0.045, 0.02, abs(f.x)), smoothstep(0.045, 0.02, abs(f.y)));
    float r = length(f), a = atan(f.y, f.x);
    float petal = 0.2 + 0.05 * cos(8.0 * a);
    float rose = smoothstep(0.05, 0.02, abs(r - petal) - 0.025);
    float heart = smoothstep(0.1, 0.12, r);
    float sh = max(bars * heart, rose);
    vec3 c = imgLod(p * 0.8 + 0.5, 0.7);
    finish(lightAndShade(c, sh, 0.5 + 0.5 * clamp(audioSwell, 0.0, 1.0)));
}
