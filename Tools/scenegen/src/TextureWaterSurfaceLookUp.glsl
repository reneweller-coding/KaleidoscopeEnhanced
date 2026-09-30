//@doc
 * @brief TEXTURE WATER SURFACE LOOK UP: lying on the bottom of a pool and
 * looking straight up -- the whole sky (the photograph) is squeezed into
 * a bright circle overhead, Snell's window, its rim fringed with rainbow
 * colours; the waves on the surface ripple and bend the picture inside
 * it, and outside the window the surface turns into a dark mirror
 * reflecting the depths; dancing light nets and shafts hang in the water.
 * The circle is centred on the screen; the water continues beyond the
 * frame; mirrorable.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the waves travel (integrated, jump-free)
 *   audioSpread     -> wave height
 *   audioBass       -> the light nets brighten (light)
 *   audioMode       -> the water: deep blue in minor, green-turquoise in major
 *   audioRoughness  -> small ripples
 *   audioSwell      -> the window widens a little (slow)
 *
 * Knobs: windowP (window size), waveP (wave scale), rimP (rainbow rim), hueP.
//@params windowP waveP rimP
//@audio audioSpread audioBass audioMode audioRoughness audioSwell
//@body
void main()
{
    vec2 p = screenP();
    float bass = clamp(audioBass, 0.0, 1.0);
    float swell = clamp(audioSwell, 0.0, 1.0);
    float mode = clamp(audioMode, 0.0, 1.0);
    float rough = clamp(audioRoughness, 0.0, 1.0);
    float T = 0.3 * sceneTime + 2.0 * audioAdvance;
    // Wave normal from two travelling noise fields.
    float ws = 1.5 + 2.5 * clamp(waveP, 0.0, 1.0);
    vec2 q = p * ws;
    float e = 0.01;
    float h0 = fbm3(q + vec2(T * 0.3, T * 0.2)) + 0.5 * fbm3(q * 2.3 - vec2(T * 0.4, -T * 0.25)) + rough * 0.2 * noise2(q * 9.0 + T);
    float hx = fbm3(q + vec2(e, 0.0) + vec2(T * 0.3, T * 0.2)) + 0.5 * fbm3((q + vec2(e, 0.0)) * 2.3 - vec2(T * 0.4, -T * 0.25)) + rough * 0.2 * noise2((q + vec2(e, 0.0)) * 9.0 + T);
    float hy = fbm3(q + vec2(0.0, e) + vec2(T * 0.3, T * 0.2)) + 0.5 * fbm3((q + vec2(0.0, e)) * 2.3 - vec2(T * 0.4, -T * 0.25)) + rough * 0.2 * noise2((q + vec2(0.0, e)) * 9.0 + T);
    vec2 slope = vec2(hx - h0, hy - h0) / e * (0.03 + 0.05 * clamp(audioSpread, 0.0, 1.0));
    // View angle from vertical: the screen radius maps to the angle.
    float W = (0.3 + 0.15 * clamp(windowP, 0.0, 1.0)) * (1.0 + 0.1 * swell);   // window radius on screen
    vec2 pv = p + slope * 0.5;
    float r = length(pv);
    float th = r / W * 0.848;                                   // 0.848 rad = the critical angle (48.6 deg)
    vec3 col;
    vec3 water = mix(vec3(0.02, 0.08, 0.2), vec3(0.03, 0.2, 0.2), mode);
    if (th < 0.848) {
        // Inside the window: refract to the air; the sky angle spans 0..90 deg.
        float ta = asin(clamp(1.333 * sin(th), 0.0, 1.0));
        float rr = tan(min(ta, 1.45)) * 0.18;
        vec2 dir = r > 1e-5 ? pv / r : vec2(0.0);
        vec2 uv = dir * rr + 0.5 + vec2(0.003, 0.002) * sceneTime;
        float lod = clamp(log2(1.0 + rr * 8.0), 0.0, 4.0);      // the horizon squeezes: blur it
        vec3 sky = imgLod(uv, 0.5 + lod);
        // Rainbow rim: the red and blue windows differ slightly.
        float edge = smoothstep(0.75, 0.848, th);
        vec3 rim = hsv2rgb(vec3(fract(th * 6.0 + hueP * 0.159), 0.8, 1.0));
        col = sky * (1.0 - 0.6 * edge) + rim * edge * 0.25 * clamp(rimP + 0.2, 0.0, 1.2);
        col = mix(col, col * mix(vec3(0.8, 0.95, 1.1), vec3(0.9, 1.05, 1.0), mode), 0.4);
    } else {
        // Total internal reflection: the surface mirrors the depths.
        float d = th - 0.848;
        vec2 uvR = p * 0.3 + 0.5 + slope * 2.0;
        vec3 deep = imgLod(uvR, 4.0) * 0.12;
        col = water * (0.6 + 0.4 * exp(-d * 2.0)) + deep * water * 3.0;
        col += vec3(0.4, 0.6, 0.7) * exp(-d * 30.0) * 0.3;      // bright just outside the rim
    }
    // Light nets (caustics) dancing in the water between us and the surface.
    float cz = fbm3(q * 1.7 + vec2(T * 0.5, 0.0));
    float net = pow(1.0 - abs(cz * 2.0 - 1.0), 6.0);
    col += mix(vec3(0.5, 0.8, 1.0), vec3(0.6, 1.0, 0.8), mode) * net * (0.05 + 0.2 * bass);
    finish(col);
}
