//@doc
 * @brief STAR NEST KALI FLIGHT: a flight through Kali's fractal -- every point folded again and again by
 * p <- |p| / (p.p) - c, and light gathered where the fold's magnitude barely changes from one step to the next --
 * an endless nebula of fine veins and knots of light, sampled in several depths so that it opens as the eye passes.
 * The colour is one family taken from the photo, deeper layers a neighbouring hue; the photo's own light shimmers
 * faintly through the veins.
 *
 * Audio Reactivity (structure, not only light):
 *   audioHarmAdvance -> each chord change shifts the fold constant c: the veins re-order, gliding
 *   audioAdvance     -> the flight (integrated)
 *   audioRolloff     -> the light's temperature: brighter music warmer and whiter cores
 *   audioSwell       -> how sharp the veins are drawn
 *
 * Knobs: densityP (how dense the veins), warpP (the fold's base), hueP.
//@params densityP warpP
//@audio audioHarmAdvance audioRolloff audioSwell
//@body
/**  Kali's field at a point: the folds' magnitudes, light where they change little.
 *
 * @param p      The point. (in)
 * @param c      The fold's constant. (in)
 * @param sharp  How sharply the veins are drawn. (in)
 *
 * @return
 *   The light, 0..~1.
 **/
float kaliField(vec3 p, vec3 c, float sharp)
{
    float accum = 0.0, prev = 0.0, tw = 0.0;
    for (int i = 0; i < 20; ++i) {
        float mag = dot(p, p);
        p = abs(p) / mag + c;
        float w = exp(-float(i) / 7.0);
        accum += w * exp(-sharp * pow(abs(mag - prev), 2.2));
        tw += w;
        prev = mag;
    }
    return max(0.0, 5.0 * accum / tw - 0.7);
}

void main()
{
    vec2 p = screenP();
    float fh = famHue();
    vec3 dir = normalize(vec3(p * 1.2, 1.0));
    dir.xz = rot2(0.3 * sin(0.019 * sceneTime)) * dir.xz;
    dir.xy = rot2(0.013 * sceneTime) * dir.xy;
    float fly = 0.01 * sceneTime + 0.025 * audioAdvance;
    vec3 from = vec3(0.35 * sin(0.07 * fly), 0.3 * cos(0.05 * fly), fly);
    float h = max(audioHarmAdvance, 0.0);
    vec3 c = vec3(-0.5, -0.4, -1.5) + 0.04 * vec3(sin(0.9 * h), sin(0.37 * h + 1.3), cos(0.61 * h))
             + vec3(0.06, 0.0, 0.08) * (clamp(warpP, 0.0, 1.0) - 0.5);
    float sharp = 6.0 + 2.0 * clamp(audioSwell, 0.0, 1.0) + 2.0 * clamp(densityP, 0.0, 1.0);
    float warm = clamp(audioRolloff, 0.0, 1.0);
    // exposure: four fixed probe rays tell how bright this stretch of the fractal is; sparse stretches are lifted
    float probe = 0.0;
    for (int j = 0; j < 4; ++j) {
        vec2 q = 0.45 * vec2(cos(1.5708 * float(j) + 0.4), sin(1.5708 * float(j) + 0.4));
        float f = kaliField(from + normalize(vec3(q * 1.2, 1.0)) * 0.32, c, sharp);
        probe += f * f * f;
    }
    float gain = clamp(pow(0.5 / max(0.25 * probe, 0.04), 0.6), 0.75, 2.5);
    vec3 v = vec3(0.0);
    float wsum = 0.0;
    for (int k = 0; k < 8; ++k) {
        float d = 0.04 + 0.14 * float(k);
        float f = kaliField(from + dir * d, c, sharp);
        float layer = float(k) / 7.0;
        float w = exp(-2.0 * layer);
        v += famLight(fh, layer, 0.05 + 0.45 * warm * f) * f * f * f * w;
        wsum += w;
    }
    v *= 0.55 / wsum;
    v = (v * v * 2.2 + v * 0.35) * gain;                          // contrast: dark gaps, bright veins
    v += famCol(fh, 0.5) * luma(imgLod(p * 0.25 + 0.5, 5.0)) * 0.05;
    finish(v);
}
