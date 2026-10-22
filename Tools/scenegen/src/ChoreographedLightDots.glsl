//@doc
 * @brief CHOREOGRAPHED LIGHT DOTS: a crowd of light dots on simple orbits of their own, whose phases line up at the
 * start of every phrase into a figure -- a circle, a spiral, a knot -- that holds for a moment and then scatters
 * across the frame, only to gather again as the next phrase begins.  Each dot has its figure place and its own free
 * orbit; its position blends from the figure (at the phrase's start and end) to the orbit (in the phrase's middle),
 * so the figure is there exactly on the phrase's one.  The dots are round; their light is shades of one colour family
 * from the photo.
 *
 * Audio Reactivity (structure, not only light):
 *   audioPhrasePos     -> the gathering: the figure forms at the phrase's start and scatters toward its middle
 *   audioSectionId/Age -> every new section brings another figure (the places glide over six seconds)
 *   audioAdvance       -> the free orbits turn (integrated)
 *
 * Knobs: dotP (how many dots), scatterP (how far they scatter), hueP.
//@params dotP scatterP
//@audio audioPhrasePos audioSectionId audioSectionPrev audioSectionAge
//@body
/**  A dot's place in a figure.
 *
 * @param u     The dot's place along the figure (0..1). (in)
 * @param kind  0 circle, 1 spiral, 2 trefoil knot. (in)
 *
 * @return
 *   The place.
 **/
vec2 figurePlace(float u, float kind)
{
    float t = 6.2831853 * u;
    if (kind < 0.5) return 0.44 * vec2(cos(t), sin(t));
    if (kind < 1.5) { float r = 0.06 + 0.42 * u; return r * vec2(1.3 * cos(3.0 * t), sin(3.0 * t)); }
    return 0.15 * vec2(1.2 * (sin(t) + 2.0 * sin(2.0 * t)), cos(t) - 2.0 * cos(2.0 * t));
}

void main()
{
    vec2 p = screenP();
    float fh = famHue();
    float N = floor(140.0 + 100.0 * clamp(dotP, 0.0, 1.0));
    float spread = 0.8 + 0.2 * clamp(scatterP, 0.0, 1.0);
    float scatter = 0.5 - 0.5 * cos(6.2831853 * audioPhrasePos);   // 0 at the phrase's start and end
    float m = smoothstep(0.0, 6.0, audioSectionAge);
    float kA = mod(max(audioSectionPrev, 0.0), 3.0), kB = mod(max(audioSectionId, 0.0), 3.0);
    float run = 0.1 * sceneTime + 0.4 * audioAdvance;
    vec3 col = famCol(fh, 0.45) * 0.012;
    for (int i = 0; i < 240; ++i) {
        float fi = float(i);
        if (fi >= N) break;
        float h1 = fract(sin(fi * 12.9898) * 43758.5453), h2 = fract(sin(fi * 78.233) * 43758.5453);
        vec2 fig = mix(figurePlace(fi / N, kA), figurePlace(fi / N, kB), m);
        // the free place: wandering round an elliptic disc that fills the screen (sqrt radius: evenly spread)
        float fa = run * (0.3 + 0.5 * h1) * (h2 < 0.5 ? 1.0 : -1.0) + 6.2831853 * h2;
        float fr = sqrt(fract(h1 * 5.3)) * (0.85 + 0.15 * sin(0.7 * run + 6.0 * h2));
        vec2 free = spread * vec2(0.95, 0.55) * fr * vec2(cos(fa), sin(fa));
        vec2 at = mix(fig, free, scatter);
        float size = 0.005 + 0.003 * h1;
        float d = length(p - at);
        float g = smoothstep(size, size * 0.6, d) + 0.25 * exp(-d / (size * 2.5));
        col += famLight(fh, fi / N, 0.5 * (1.0 - scatter)) * g * (0.8 + 0.6 * (1.0 - scatter));
    }
    finish(famExpose(col, 2.67, 0.90, 0.00, fh));
}
