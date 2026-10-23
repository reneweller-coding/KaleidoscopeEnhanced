//@doc
 * @brief DOWNBEAT WAVE OF ONES: a grid of flowers, each unfolding by its place in the bar: the one blooms first, in the corner where the bar begins, and two, three and four follow as a wave over the diagonal of the picture;
 * the petals are the photo, the heart of each flower the photo's brightest colour there, and between the flowers the dark.  The bloom runs once through every bar and the flowers close again behind the wave.
 *
 * Audio Reactivity (structure, not only light):
 *   audioBarPhase   -> the bloom runs over the diagonal once a bar
 *   audioSwell      -> how large the flowers open
 *
 * Knobs: gridP (the size of the cells), hueP.
//@params gridP
//@audio audioSwell
//@body
void main()
{
    vec2 p = screenP();
    float asp = resolution.x / resolution.y;
    float sz = 0.22 - 0.1 * clamp(gridP, 0.0, 1.0);
    vec2 g = p / sz;
    vec2 cell = floor(g);
    vec2 f = fract(g) - 0.5;
    vec2 cp = (cell + 0.5) * sz;
    float diag = clamp((cp.x / asp + 0.5) * 0.5 + (0.5 - cp.y) * 0.5, 0.0, 1.0);
    float bloom = rhyBump(rhyBar(), diag * 0.75, 1.0, 0.32);
    float size = 0.16 + 0.78 * bloom * (0.6 + 0.5 * clamp(audioSwell, 0.0, 1.0));
    float r = length(f), a = atan(f.y, f.x);
    float petals = 0.74 + 0.26 * cos(5.0 * a + 2.0 * bloom);
    float flower = smoothstep(0.03, 0.0, r - 0.5 * size * petals);
    vec2 uv = p * 0.8 + 0.5;
    vec3 c = imgLod(uv, 0.7);
    vec3 heart = imgLod(cp * 0.8 + 0.5, 2.5) * 1.6;
    vec3 col = mix(imgLod(uv, 3.0) * 0.2, c * (0.75 + 0.5 * bloom), flower);
    col = mix(col, heart, smoothstep(0.1 * size + 0.01, 0.06 * size, r) * flower);
    finish(col * 1.1);
}
