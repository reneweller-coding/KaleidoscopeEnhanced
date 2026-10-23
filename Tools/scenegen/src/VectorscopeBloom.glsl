//@doc
 * @brief VECTORSCOPE BLOOM: a vectorscope: every hue of the photo is an angle and every saturation a radius, and the density of the photo's colours glows as a bloom of light that is drawn anew for every photo -- a photo of two
 * colours makes two lobes, a grey one a point in the middle.  Each point of the bloom wears the colour it stands for (the colour of that chroma at middle brightness).  The chroma histogram is counted in a small field of the scene's
 * own, a few times a second.  The bloom turns slowly with the phase of the music and its radius follows the swell.
 *
 * Audio Reactivity (structure, not only light):
 *   audioPhase      -> the bloom turns (integrated)
 *   audioSwell      -> the radius of the bloom
 *
 * Knobs: glowP (how far the glow reaches), hueP.
//@params glowP
//@audio audioSwell
//@state 48 48 5 32
//@body
/**  The state pass: the density of the photo's colours in the chroma plane (blue difference across, red difference up).
 *
 * @return
 *   x the density, smoothed against the last step, 0, 0, 1.
 **/
vec4 stateStep()
{
    ivec2 c = stCell();
    float cnt = 0.0;
    for (int i = 0; i < 28; ++i) {
        for (int j = 0; j < 28; ++j) {
            vec3 s = imgLod(vec2((float(i) + 0.5) / 28.0, (float(j) + 0.5) / 28.0), 3.0);
            float cb = -0.1687 * s.r - 0.3313 * s.g + 0.5 * s.b;
            float cr = 0.5 * s.r - 0.4187 * s.g - 0.0813 * s.b;
            ivec2 b = ivec2(floor((vec2(cb, cr) / 0.6 + 0.5) * 48.0));
            cnt += (b.x == c.x && b.y == c.y) ? 1.0 : 0.0;
        }
    }
    float now = cnt / 784.0;
    float old = stateFrame < 0.5 ? now : texelFetch(texState, c, 0).x;
    return vec4(mix(old, now, 0.35), 0.0, 0.0, 1.0);
}
void main()
{
    if (statePass == 1) { fragColor = stateStep(); return; }
    vec2 p = screenP();
    float sc = 0.7 * (0.85 + 0.3 * clamp(audioSwell, 0.0, 1.0)) * (1.0 + 0.08 * sin(0.5 * sceneTime));
    vec2 q = rot2(0.1 * audioPhase + 0.05 * sceneTime) * p * 0.6 / sc / 0.9;
    float rd = 0.8 + 2.0 * clamp(glowP, 0.0, 1.0);
    float d = 0.0;
    for (int k = 0; k < 8; ++k) {
        float a = 0.785398 * float(k);
        d += stLin((q / 0.6 + 0.5) * 48.0 + rd * vec2(cos(a), sin(a))).x * 0.1;
    }
    d += stLin((q / 0.6 + 0.5) * 48.0).x * 0.2;
    float inb = smoothstep(0.55, 0.45, max(abs(q.x), abs(q.y)) / 0.6 + 0.0);
    float cb = q.x, cr = q.y;
    float y = 0.62;
    vec3 cc = vec3(y + 1.402 * cr, y - 0.344 * cb - 0.714 * cr, y + 1.772 * cb);
    vec3 col = imgLod(p * 0.8 + 0.5, 5.0) * 0.1;
    col += clamp(cc, 0.0, 1.0) * pow(clamp(d * 90.0, 0.0, 6.0), 0.5) * inb * 0.9;
    float r = length(q) / 0.6;
    col += 0.06 * (smoothstep(0.012, 0.0, abs(r - 0.33)) + smoothstep(0.012, 0.0, abs(r - 0.66)) + smoothstep(0.012, 0.0, abs(r - 1.0)));
    finish(col);
}
