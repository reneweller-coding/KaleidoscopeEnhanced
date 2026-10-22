//@doc
 * @brief METAMERISM REVEAL: surfaces that match under one light and differ under another: the photo, painted in pigments
 * that look identical in daylight, hides a pattern that rises out of it as the light warms and sinks back as it cools
 * again with the chords.  Colour is modelled in six spectral bands: a surface's reflectance times the light, seen
 * through three sensor curves; the hidden pattern's pigment is the photo's plus a spectral difference with no effect
 * under the first light (the difference has the sensor-times-light rows projected out, by Gram-Schmidt), so under that
 * light the two are exact metamers, and under the second they part.  The photo's colours, calmed toward one family.
 *
 * Audio Reactivity (structure, not only light):
 *   audioHarmAdvance -> the light glides between daylight and warm light: the hidden pattern comes and goes
 *   audioAdvance     -> the hidden pattern drifts (integrated)
 *   audioSwell       -> the light's strength
 *
 * Knobs: patternP (the hidden pattern's scale), depthP (how strongly the pigments differ), hueP.
//@params patternP depthP
//@audio audioHarmAdvance audioSwell
//@body
/**  The photo's colour calmed toward the colour family.
 *
 * @param photo  The photo's colour. (in)
 * @param fh     The family's hue. (in)
 *
 * @return
 *   The colour.
 **/
vec3 tone(vec3 photo, float fh)
{
    float l = luma(photo);
    return mix(photo * 1.1, famCol(fh, 0.15 + 0.7 * l) * (0.25 + 1.2 * l), 0.45);
}

/**  A six-band vector's dot product (two halves of three bands).
 *
 * @param a0  The first vector's bands 0..2. (in)
 * @param a1  Its bands 3..5. (in)
 * @param b0  The second vector's bands 0..2. (in)
 * @param b1  Its bands 3..5. (in)
 *
 * @return
 *   The dot product.
 **/
float dot6(vec3 a0, vec3 a1, vec3 b0, vec3 b1)
{
    return dot(a0, b0) + dot(a1, b1);
}

/**  What the three sensors see of a reflectance under a light.
 *
 * @param r0  The reflectance's bands 0..2 (short waves). (in)
 * @param r1  Its bands 3..5 (long waves). (in)
 * @param l0  The light's bands 0..2. (in)
 * @param l1  Its bands 3..5. (in)
 *
 * @return
 *   The colour.
 **/
vec3 sense(vec3 r0, vec3 r1, vec3 l0, vec3 l1)
{
    vec3 s0 = r0 * l0, s1 = r1 * l1;
    return vec3(dot6(s0, s1, vec3(0.0, 0.0, 0.1), vec3(0.5, 1.0, 0.6)),
                dot6(s0, s1, vec3(0.0, 0.3, 0.9), vec3(0.8, 0.3, 0.05)),
                dot6(s0, s1, vec3(0.7, 1.0, 0.3), vec3(0.05, 0.0, 0.0)));
}

void main()
{
    vec2 p = screenP();
    float fh = famHue();
    float sc = 4.0 + 4.0 * clamp(patternP, 0.0, 1.0);
    float depth = 0.22 + 0.18 * clamp(depthP, 0.0, 1.0);
    float h = max(audioHarmAdvance, 0.0);
    float warm = 0.5 + 0.5 * sin(0.6 * h);
    float run = 0.02 * sceneTime + 0.08 * audioAdvance;
    // the lights: daylight (the metamers' light) and a warm light
    vec3 la0 = vec3(0.6, 0.8, 1.0), la1 = vec3(1.0, 0.9, 0.7);
    vec3 lb0 = vec3(0.15, 0.25, 0.45), lb1 = vec3(0.8, 1.0, 1.0);
    vec3 l0 = mix(la0, lb0, warm), l1 = mix(la1, lb1, warm);
    // the photo's pigment, spread over six bands
    vec3 c = tone(imgLod(p * 0.55 + 0.5, 1.5), fh);
    vec3 r0 = vec3(c.b, c.b, c.g) * 0.85 + 0.05, r1 = vec3(c.g, c.r, c.r) * 0.85 + 0.05;
    // the difference that daylight cannot see: a fixed spectral wiggle with the sensor-times-daylight rows removed
    vec3 d0 = vec3(1.0, -1.0, 1.0), d1 = vec3(-1.0, 1.0, -1.0);
    vec3 a0[3], a1[3];
    a0[0] = vec3(0.0, 0.0, 0.1) * la0; a1[0] = vec3(0.5, 1.0, 0.6) * la1;
    a0[1] = vec3(0.0, 0.3, 0.9) * la0; a1[1] = vec3(0.8, 0.3, 0.05) * la1;
    a0[2] = vec3(0.7, 1.0, 0.3) * la0; a1[2] = vec3(0.05, 0.0, 0.0) * la1;
    for (int i = 0; i < 3; ++i) {                                     // Gram-Schmidt: make the rows orthonormal
        for (int j = 0; j < 3; ++j) {
            if (j >= i) break;
            float k = dot6(a0[i], a1[i], a0[j], a1[j]);
            a0[i] -= k * a0[j];
            a1[i] -= k * a1[j];
        }
        float n = sqrt(max(dot6(a0[i], a1[i], a0[i], a1[i]), 1e-6));
        a0[i] /= n;
        a1[i] /= n;
    }
    for (int i = 0; i < 3; ++i) {
        float k = dot6(d0, d1, a0[i], a1[i]);
        d0 -= k * a0[i];
        d1 -= k * a1[i];
    }
    float dn = sqrt(max(dot6(d0, d1, d0, d1), 1e-6));
    d0 /= dn;
    d1 /= dn;
    // the hidden pattern: drifting rings and bars
    vec2 q = p * sc + vec2(run, 0.6 * run);
    float pat = smoothstep(0.1, 0.25, sin(q.x) * sin(q.y) + 0.4 * sin(length(p) * sc * 1.5 - 2.0 * run));
    vec3 s0 = r0 + d0 * depth * pat, s1 = r1 + d1 * depth * pat;
    vec3 white = sense(vec3(1.0), vec3(1.0), l0, l1);
    vec3 col = sense(s0, s1, l0, l1) / max(white, vec3(1e-3)) * (0.6 + 0.6 * clamp(audioSwell, 0.0, 1.0));
    finish(col);
}
