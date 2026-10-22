//@doc
 * @brief UV LEAF VEIN GLOW: a leaf under ultraviolet light, filling the picture: the chlorophyll in its tissue glows red,
 * and the vein network -- midrib, slanting side veins, the fine net between them and, as the phrase goes on, the
 * finest net of all -- carries pulses of light outward from the leaf's base in time with the music.  The side veins
 * are slanted lines leaving the midrib; the net is the borders of a jittered Voronoi pattern at two scales; the pulses
 * run with the distance from the base along midrib and side vein.  The red is pulled a little toward the photo's hue.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance   -> the pulses run out along the veins (integrated: with the music's drive)
 *   audioPhrasePos -> the finest net grows in over each phrase and fades again
 *   audioSwell     -> the tissue's glow
 *
 * Knobs: veinP (the side veins' spacing), netP (the net's size), hueP.
//@params veinP netP
//@audio audioPhrasePos audioSwell
//@body
/**  The borders of a jittered Voronoi pattern: how close a place lies to the nearest border.
 *
 * @param x  The place (in cells). (in)
 *
 * @return
 *   The gap between the nearest and the second nearest site.
 **/
float netGap(vec2 x)
{
    vec2 gi = floor(x);
    float d1 = 9.0, d2 = 9.0;
    for (int k = 0; k < 9; ++k) {
        vec2 cell = gi + vec2(float(k % 3) - 1.0, float(k / 3) - 1.0);
        float dd = length(x - cell - 0.15 - 0.7 * hash22(cell));
        if (dd < d1) { d2 = d1; d1 = dd; } else if (dd < d2) d2 = dd;
    }
    return d2 - d1;
}

void main()
{
    vec2 p = screenP();
    float fh = famHue();
    float sp = 0.12 + 0.08 * clamp(veinP, 0.0, 1.0);
    float net = 0.045 + 0.03 * clamp(netP, 0.0, 1.0);
    float run = 0.3 * sceneTime + 1.2 * audioAdvance;
    float grow = 0.5 - 0.5 * cos(6.2831853 * clamp(audioPhrasePos, 0.0, 1.0));
    float rh = fract(0.2 * (fract(fh + 0.5) - 0.5) + 1.0);          // red, pulled a little toward the photo's hue
    vec2 q = rot2(0.45) * p + vec2(0.9, 0.0);                        // the leaf's base lies off the left edge
    float v = q.y - 0.08 * sin(1.2 * q.x);                           // across the gently curved midrib
    float av = abs(v);
    // the side veins: slanted lines leaving the midrib
    float s = q.x - av * 1.1;
    float ks = floor(s / sp + 0.5);
    float dSide = abs(s - ks * sp) * 0.67;
    float side = exp(-pow(dSide / (0.0025 + 0.004 * exp(-av * 4.0)), 2.0)) * smoothstep(0.05, 0.0, -s);
    float mid = exp(-pow(av / 0.006, 2.0));
    float n3 = exp(-pow(netGap(q / net) / 0.06, 2.0));
    float n4 = exp(-pow(netGap(q / (net * 0.38) + 7.0) / 0.08, 2.0)) * grow;
    // the pulses: running out from the base along the midrib and then along the side veins
    float path = q.x + av * 1.3;
    float pulse = 0.35 + 0.65 * pow(0.5 + 0.5 * cos(6.2831853 * (path * 2.5 - 0.3 * run)), 3.0);
    float veins = max(max(mid, side), max(0.6 * n3, 0.4 * n4));
    vec3 red = hsv2rgb(vec3(rh, 0.85, 1.0));
    float tissue = (0.25 + 0.35 * fbm(6.0 * q)) * (0.6 + 0.6 * clamp(audioSwell, 0.0, 1.0));
    vec3 col = red * tissue * (1.0 - 0.6 * veins);
    col += mix(red, vec3(1.0, 0.85, 0.8), 0.4) * veins * pulse * 0.9;
    finish(col);
}
