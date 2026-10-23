//@doc
 * @brief DOUBLING MAP BINARY SHIFT: the doubling map x -> 2x mod 1: the bit stream of the coordinates shifts to the left, and in every step the photo is folded onto itself; the picture shows the intermediate stages as fine stripes that gather into Cantor-like patterns.  The folding is the continuous tent
 * version of the doubling, applied to both axes a gliding number of times, and the stages are cross-faded, so no step is a jump.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance -> the number of foldings wanders (integrated)
 *   audioSwell   -> the coupling: how much of the first stages stays in the picture
 *
 * Knobs: sizeP (the zoom into the photo), hueP.
//@params sizeP
//@audio audioSwell audioAdvance
//@body
void main()
{
    vec2 p = screenP();
    float zoom = 0.6 + 0.5 * clamp(sizeP, 0.0, 1.0);
    vec2 u = p * zoom * vec2(1.0, 1.0) + 0.5;
    float nf = 1.0 + 4.5 * (0.5 + 0.5 * sin(0.03 * audioAdvance + 0.04 * sceneTime));
    float cp = 0.3 + 0.6 * clamp(audioSwell, 0.0, 1.0);
    vec2 x = fract(u * 0.5 + 0.25) * 0.999 + 0.0005;
    x = clamp(x, 0.0, 1.0);
    vec3 sum = vec3(0.0);
    float ws = 0.0;
    for (int n = 0; n < 7; ++n) {
        float w = clamp(nf - float(n), 0.0, 1.0);
        vec3 c = imgLod(x * 0.9 + 0.05, 0.4 + 0.2 * float(n));
        float sw = (n == int(floor(nf))) ? 1.0 : cp;
        sum += c * w * sw;
        ws += w * sw;
        x = vec2(1.0) - abs(2.0 * x - vec2(1.0));
        x += 0.002 * vec2(sin(0.2 * sceneTime + float(n)), cos(0.17 * sceneTime));
        x = clamp(x, 0.0, 1.0);
    }
    vec3 col = sum / max(ws, 1e-3);
    float bit = floor(2.0 * x.x);
    col *= 0.9 + 0.1 * bit;
    finish(col * 1.1);
}
