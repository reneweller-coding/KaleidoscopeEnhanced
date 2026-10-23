//@doc
 * @brief RISSET RHYTHM ACCEL WEAVE: the Risset rhythm: a rhythm that always gets faster without ever being faster, because new slow layers fade in when the fast ones vanish; the picture is a weave of bands that run towards the edge, while new ones are brought from the inside.  Six layers
 * of rings run outwards at speeds that double from layer to layer, their weights are a bell over the speed, and the whole set of speeds slides up an octave in 50 seconds and starts over without a seam.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell   -> the height of the bell (the climax without any increase)
 *   audioAdvance -> the phase of the climb (integrated)
 *
 * Knobs: sizeP (the width of the bands), hueP.
//@params sizeP
//@audio audioSwell audioAdvance
//@body
void main()
{
    vec2 p = screenP();
    float r = length(p);
    float a = atan(p.y, p.x);
    float T = sceneTime + 4.0 * audioAdvance;
    float beta = 0.02;
    float f = fract(beta * T);
    float freq = 5.0 + 6.0 * (1.0 - clamp(sizeP, 0.0, 1.0));
    float acc = 0.0;
    float ws = 0.0;
    for (int k = 0; k < 8; ++k) {
        float fk = float(k);
        float lr = fk + f;
        float w = exp(-pow((lr - 3.6) / 1.7, 2.0));
        float ph = 2.16 * exp2(lr);
        float ring = 0.5 + 0.5 * cos(6.2831853 * (r * freq * (0.8 + 0.07 * lr) - ph) + 2.0 * sin(3.0 * a + lr));
        acc += w * ring;
        ws += w;
    }
    float mask = acc / max(ws, 1e-3);
    mask = smoothstep(0.15, 0.85, mask);
    vec3 c = imgLod(p * 0.85 + 0.5, 0.5);
    float lift = 0.9 + 0.5 * clamp(audioSwell, 0.0, 1.0);
    finish(c * (0.12 + 1.0 * mask) * lift);
}
