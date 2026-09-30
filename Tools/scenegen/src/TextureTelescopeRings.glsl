//@doc
 * @brief TEXTURE TELESCOPE RINGS: looking into an endless telescope of
 * nested rings -- band after band of the photograph, each ring a
 * separately turning barrel stepping down into the next, with knurled
 * metal edges, engraved scale ticks and a bevelled step that catches the
 * light; the rings slide toward us as if the telescope were being drawn
 * out forever, each turning at its own speed and direction.  Endless,
 * mirrorable.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the rings slide out (integrated, jump-free)
 *   audioPhase      -> the rings turn (integrated)
 *   audioSpread     -> ring width
 *   audioKick       -> the bevel edges flash (light)
 *   audioMode       -> metal: steel in minor, brass in major
 *   audioSwell      -> the glow in the eyepiece (slow)
 *
 * Knobs: tickP (scale ticks), knurlP (knurling), photoP (photo on the rings), hueP.
//@params tickP knurlP photoP
//@audio audioPhase audioSpread audioKick audioMode audioSwell
//@body
void main()
{
    vec2 p = screenP();
    float kick = clamp(audioKick, 0.0, 1.0);
    float swell = clamp(audioSwell, 0.0, 1.0);
    float r = max(length(p), 1e-4);
    float a = atan(p.y, p.x);
    float lr = log(r);
    float w = 0.25 + 0.2 * clamp(audioSpread, 0.0, 1.0);        // ring width in log radius
    float slide = 0.06 * sceneTime + 0.4 * audioAdvance;
    float u = lr / w + slide;
    float ri = floor(u);                                        // ring identity (space; carries with the slide)
    float fu = fract(u);                                        // 0 inner edge .. 1 outer edge
    // Each ring turns at its own speed.
    float h = hash11(ri * 0.731);
    float spd = (h - 0.5) * 0.4;
    float ang = a + spd * sceneTime + (h - 0.5) * 2.0 * audioPhase + h * 6.28;
    vec2 cs = vec2(cos(ang), sin(ang));
    float fwA = length(fwidth(vec2(cos(a), sin(a))));
    // Photo band on the ring: around (angle) x across (fu).
    vec2 uv = vec2(ang / 3.14159265, fu * 0.35 + ri * 0.21);
    float fw = max(fwA / 3.14159265, fwidth(u) * 0.35) * 1024.0;
    vec3 ph = imgLod(uv, clamp(log2(max(fw, 1.0)), 0.0, 9.0));
    float mode = clamp(audioMode, 0.0, 1.0);
    vec3 metal = mix(vec3(0.55, 0.58, 0.62), vec3(0.8, 0.62, 0.32), mode);
    vec3 face = mix(metal * (0.4 + 0.6 * luma(ph)), ph * 1.1, clamp(photoP, 0.0, 1.0));
    // Profile across the ring: bevel at the outer step, knurling at the inner rim.
    float bevel = smoothstep(0.82, 0.9, fu);
    float knurlZone = smoothstep(0.18, 0.1, fu);
    float kn = 0.5 + 0.5 * sin(ang * (60.0 + 60.0 * clamp(knurlP, 0.0, 1.0)) + fu * 20.0);
    vec3 col = face * (0.55 + 0.45 * smoothstep(0.0, 0.5, fu));
    col = mix(col, metal * (0.3 + 0.7 * kn), knurlZone * 0.8);
    // Bevel lit by a light from the upper left.
    float lit = 0.5 + 0.5 * dot(cs, normalize(vec2(-0.6, 0.8)));
    col = mix(col, metal * (0.2 + 1.1 * lit), bevel);
    vec3 gc = glowColour(imgLod(vec2(0.5), 6.0), vec2(ri * 0.2, 0.0), hueP * 0.159);
    float pxU = fwidth(u) + 1e-4;
    float edge = exp(-(1.0 - fu) / (pxU * 2.0));
    col += mix(gc, vec3(1.0), 0.5) * edge * lit * (0.3 + 1.0 * kick);
    // Scale ticks engraved on the face.
    float nt = 2.0 * floor(18.0 + 18.0 * clamp(tickP, 0.0, 1.0));
    float ta = abs(fract(ang * nt / 6.2831853) - 0.5);
    float tpx = fwA * nt / 6.2831853 + 1e-4;
    float tick = smoothstep(tpx * 1.5, 0.0, ta - 0.02) * smoothstep(0.65, 0.6, fu) * smoothstep(0.3, 0.35, fu);
    float bigTick = step(0.5, abs(fract(ang * nt / 6.2831853 / 5.0 + 0.1) - 0.5) * 2.0 - 0.8);
    col = mix(col, col * 0.2, tick * (0.5 + 0.5 * bigTick) * 0.8);
    // Shadow of the next (outer) ring's step onto this one.
    col *= 0.6 + 0.4 * smoothstep(0.0, 0.12, fu);
    // Depth darkening and the eyepiece glow.
    col *= smoothstep(-4.0, -1.5, lr);
    col += gc * exp(-r * 12.0) * (0.5 + 1.0 * swell);
    finish(col);
}
