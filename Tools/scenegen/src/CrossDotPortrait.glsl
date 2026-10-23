//@doc
 * @brief CROSS DOT PORTRAIT: a halftone portrait made of two photos: the size of every dot comes from the tone of the first photo, its colour from the second -- a screen that draws one picture in the hand of the other, on a dark
 * ground; the screen is turned at an angle that creeps round with the phase of the music, and the dots swell with the music's swell.
 *
 * Audio Reactivity (structure, not only light):
 *   audioPhase      -> the screen turns (integrated)
 *   audioSwell      -> the size of the dots
 *
 * Knobs: gridP (the fineness of the screen), hueP.
//@params gridP
//@audio audioSwell
//@body
void main()
{
    vec2 p = screenP();
    float t = 0.02 * sceneTime + 0.12 * audioPhase;
    float N = 40.0 + 50.0 * clamp(gridP, 0.0, 1.0);
    mat2 R = rot2(0.5 + 0.3 * sin(t));
    vec2 q = R * p * N;
    vec2 cell = floor(q);
    vec2 f = fract(q) - 0.5;
    vec2 cp = transpose(R) * ((cell + 0.5) / N);
    float L = luma(imgLod(cp * 0.8 + 0.5, 1.8));
    vec3 cb = imgB(cp * 0.8 + 0.5, 1.8);
    cb = clamp(mix(vec3(luma(cb)), cb, 1.5), 0.0, 1.0) * 1.2;
    float r = (0.18 + 0.4 * sqrt(clamp(L, 0.0, 1.0))) * (0.8 + 0.35 * clamp(audioSwell, 0.0, 1.0));
    float dt = smoothstep(r, r - 0.12, length(f));
    finish(vec3(0.03) + cb * dt);
}
