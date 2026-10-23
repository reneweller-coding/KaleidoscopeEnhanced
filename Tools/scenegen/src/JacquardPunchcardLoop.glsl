//@doc
 * @brief JACQUARD PUNCHCARD LOOP: the photo as a punched card, running through the picture like the drum of a music box: every row of holes is
 * a strip of the photo cut to hole and no hole, and behind the card the photo itself shines through the holes in its own colours.  The card
 * scrolls, the holes widen as the music swells.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the card's speed (integrated)
 *   audioSwell      -> the holes' size
 *
 * Knobs: holesP (how many holes), thresholdP (which brightness is punched), hueP.
//@params holesP thresholdP
//@audio audioSwell
//@body
void main()
{
    vec2 p = screenP();
    vec2 uv = p * 0.8 + 0.5;
    float run = 0.05 * sceneTime + 0.6 * audioAdvance;
    float N = 22.0 + 30.0 * clamp(holesP, 0.0, 1.0);
    vec2 q = vec2(p.x * N, (p.y + run) * N);
    vec2 cell = floor(q);
    vec2 f = fract(q) - 0.5;
    vec2 cp = (cell + 0.5) / N;
    vec2 cardUV = vec2(cp.x, cp.y - run) * 0.8 + 0.5;
    float L = luma(imgLod(cardUV, 2.0));
    float th = 0.4 + 0.25 * clamp(thresholdP, 0.0, 1.0);
    float hole = smoothstep(th - 0.05, th + 0.05, L);
    float rad = (0.22 + 0.2 * clamp(audioSwell, 0.0, 1.0)) * hole;
    float m = smoothstep(rad, rad * 0.7, length(f));
    vec3 card = vec3(0.78, 0.7, 0.52) * (0.5 + 0.7 * imgLod(uv, 4.0)) * (0.85 + 0.15 * hash21(cell));
    vec3 behind = imgLod(uv, 0.5) * 1.15;
    vec3 col = mix(card, behind, m * step(0.01, rad));
    col *= 1.0 - 0.25 * smoothstep(0.38, 0.5, max(abs(f.x), abs(f.y)));
    finish(col);
}
