//@doc
 * @brief CANTOR DUST CURTAINS: curtains of light made of Cantor dust -- of every band the middle part is taken out,
 * of what remains again, down to fine threads -- several layers of them, each at its own scale and slant, sliding
 * against each other; where they cross, moire patterns of light come and go.  A point's distance to the dust is
 * found by following its digits: as long as it falls into a kept part the part is stretched to the whole; where it
 * falls into a gap, the distance to the gap's edge is the answer.  One colour family from the photo, a shade per
 * layer.
 *
 * Audio Reactivity (structure, not only light):
 *   audioHarmAdvance -> the share taken out of every band glides with the chord changes: the threads part or close
 *   audioAdvance     -> the layers slide against each other (integrated): the moire runs
 *   audioSwell       -> the curtains' veils brighten
 *
 * Knobs: layerP (how many layers), threadP (the threads' fineness), hueP.
//@params layerP threadP
//@audio audioHarmAdvance audioSwell
//@body
/**  The distance to the Cantor dust in one period (taking out the middle share g of every band), in the same units.
 *
 * @param x  The coordinate (periodic, period 1). (in)
 * @param g  The share taken out. (in)
 * @param L  How many levels. (in)
 *
 * @return
 *   The distance to the nearest kept part of level L (0 inside).
 **/
float cantorDist(float x, float g, int L)
{
    x = fract(x);
    float s = 1.0, k = 0.5 * (1.0 - g);
    for (int i = 0; i < 8; ++i) {
        if (i >= L) break;
        if (x < k) {
            x /= k;
        } else if (x > 1.0 - k) {
            x = (x - (1.0 - k)) / k;
        } else {
            return min(x - k, 1.0 - k - x) * s;
        }
        s *= k;
    }
    return 0.0;
}

void main()
{
    vec2 p = screenP();
    float fh = famHue();
    float h = max(audioHarmAdvance, 0.0);
    float g = 0.33 + 0.12 * sin(0.8 * h) + 0.05 * sin(0.37 * h + 1.0);
    float layers = 3.0 + 3.0 * clamp(layerP, 0.0, 1.0);
    int L = 3 + int(2.0 * clamp(threadP, 0.0, 1.0) + 0.5);
    float veil = 0.6 + 0.6 * clamp(audioSwell, 0.0, 1.0);
    float slide = 0.03 * audioAdvance + 0.004 * sceneTime;
    vec3 col = vec3(0.0);
    for (int i = 0; i < 6; ++i) {
        float on = clamp(layers - float(i), 0.0, 1.0);
        if (on <= 0.0) break;
        float fi = float(i);
        float per = 1.6 * pow(0.78, fi);                         // the layer's period on screen
        float slant = 0.18 * sin(1.7 * fi + 0.3) + 0.04 * sin(0.02 * sceneTime + fi);
        vec2 q = rot2(slant) * p;
        float x = q.x / per + slide * (fi - 2.5) + 0.37 * fi;
        float d = cantorDist(x, g, L) * per;
        float px = 1.0 / resolution.y;
        float thread = exp(-pow(d / (1.6 * px), 2.0));
        float halo = exp(-d / (40.0 * px)) * 0.18;
        // the curtain hangs: brighter low, fading up, with a slow fold of light along it
        float hang = 0.55 + 0.45 * sin(2.3 * q.y + 0.6 * fi + 0.05 * sceneTime);
        col += famLight(fh, fi / 5.0, 0.3 * thread) * (thread + halo) * hang * veil * on * 0.4;
    }
    col += famCol(fh, 0.5) * 0.012;
    finish(col);
}
