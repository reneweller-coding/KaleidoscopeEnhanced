//@doc
 * @brief WATER DROP CURTAIN REFRACT: a curtain of drops running down a pane: each drop bends the photo upside down and draws a trail of clear glass behind it; the rest of the pane
 * is a misted ground that shows the photo only blurred, and the trails free it to sharp sight.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSpread     -> the number of drops
 *   audioAdvance    -> the fall (integrated)
 *   audioSwell      -> the drops' size
 *
 * Knobs: dropsP (the base number of drops), hueP.
//@params dropsP
//@audio audioSwell audioSpread
//@body
void main()
{
    vec2 p = screenP();
    vec2 uv = p * 0.8 + 0.5;
    float run = 0.03 * sceneTime + 0.5 * audioAdvance;
    float nd = 8.0 + 10.0 * clamp(dropsP, 0.0, 1.0) + 8.0 * clamp(audioSpread, 0.0, 1.0);
    float clear = 0.0;
    vec2 bend = vec2(0.0);
    float inDrop = 0.0;
    for (int k = 0; k < 26; ++k) {
        float fk = float(k);
        float w = clamp(nd - fk, 0.0, 1.0);
        float x0 = (hash11(fk * 3.7) - 0.5) * 1.7;
        float sp = 0.4 + 0.6 * hash11(fk * 5.3);
        float y0 = 0.6 - fract(run * sp + hash11(fk * 9.1)) * 1.4;
        float rad = (0.018 + 0.02 * hash11(fk * 1.7)) * (0.7 + 0.8 * clamp(audioSwell, 0.0, 1.0));
        vec2 d = p - vec2(x0 + 0.02 * sin(6.0 * y0 + fk), y0);
        float r = length(vec2(d.x, d.y * 0.8));
        float trail = smoothstep(rad * 0.9, rad * 0.5, abs(d.x)) * smoothstep(0.0, 0.05, d.y) * smoothstep(0.55, 0.0, d.y);
        clear = max(clear, w * trail);
        if (r < rad * 1.2) { bend -= w * d * 2.0 * smoothstep(rad * 1.2, rad * 0.6, r); inDrop = max(inDrop, w * smoothstep(rad * 1.2, rad * 0.9, r)); }
    }
    float lod = 0.4 + 3.2 * (1.0 - clamp(clear, 0.0, 1.0));
    vec3 col = imgLod(uv + bend * 0.8 * 0.8, mix(lod, 0.5, inDrop));
    col = mix(col * 0.92, col * 1.05, clear);
    col += 0.1 * inDrop;
    finish(col);
}
