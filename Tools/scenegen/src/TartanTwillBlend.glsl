//@doc
 * @brief TARTAN TWILL BLEND: tartan: striped warp and weft threads in twill, whose crossings give the mixed colours; the photo is the source of the stripe colours, and the twill structure runs diagonally over the surface.  The warp threads take their colours from one line of the photo, the weft threads from
 * another, runs of several threads share a colour, and at every crossing the twill decides which thread lies on top.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell       -> the widths of the stripes
 *   audioAdvance     -> the twill steps along (integrated; the two steps are cross-faded)
 *
 * Knobs: sizeP (the thread thickness), hueP.
//@params sizeP
//@audio audioSwell audioAdvance
//@body
vec3 thread(float idx, float horizontal, float run, float seed)
{
    float k = floor(idx / run);
    float u = fract(0.137 * k + seed);
    vec2 uv = horizontal > 0.5 ? vec2(u * 0.8 + 0.1, 0.5 + 0.2 * sin(k)) : vec2(0.5 + 0.2 * sin(2.0 * k), u * 0.8 + 0.1);
    vec3 c = imgLod(uv, 2.3);
    return mix(vec3(luma(c)), c, 1.3) * 0.9;
}
void main()
{
    vec2 fc = gl_FragCoord.xy;
    float px = resolution.y / 270.0;
    float T = (2.5 + 3.0 * clamp(sizeP, 0.0, 1.0)) * px;
    vec2 g = fc / T;
    vec2 ci = floor(g);
    vec2 f = fract(g) - 0.5;
    float run = 3.0 + floor(6.0 * clamp(audioSwell, 0.0, 1.0));
    float sh = 0.03 * audioAdvance + 0.04 * sceneTime;
    float s0 = floor(sh);
    float fs = smoothstep(0.0, 1.0, fract(sh));
    vec3 warp = thread(ci.x, 1.0, run, 0.31);
    vec3 weft = thread(ci.y, 0.0, run, 0.73);
    float up0 = mod(ci.x - ci.y + s0, 4.0) < 2.0 ? 1.0 : 0.0;
    float up1 = mod(ci.x - ci.y + s0 + 1.0, 4.0) < 2.0 ? 1.0 : 0.0;
    float up = mix(up0, up1, fs);
    float shade = up > 0.5 ? (0.6 + 0.5 * cos(f.y * 3.1416)) : (0.6 + 0.5 * cos(f.x * 3.1416));
    vec3 col = mix(weft * (0.6 + 0.5 * cos(f.x * 3.1416)), warp * (0.6 + 0.5 * cos(f.y * 3.1416)), up);
    finish(col * 1.2);
}
