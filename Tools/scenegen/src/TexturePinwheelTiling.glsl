//@doc
 * @brief TEXTURE PINWHEEL TILING: the photograph cut into a rotating
 * pinwheel pattern -- square blocks, each divided into four triangles
 * spinning around its centre, every triangle holding the same piece of
 * the picture rotated a quarter turn (p4 symmetry, no mirrors), so the
 * pattern whirls; neighbouring blocks turn in opposite directions, their
 * windmill blades meshing like gears.  Endless, mirrorable.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the blades turn (integrated, jump-free)
 *   audioSpread     -> the blade curvature (straight to swirled)
 *   audioKick       -> the blade edges flash (light)
 *   audioMode       -> alternate blades tinted cool (minor) or warm (major)
 *   audioPhase      -> the whole field slowly rotates (integrated)
 *   audioSwell      -> the photo window wanders further (slow)
 *
 * Knobs: blockP (block size), twirlP (twirl inside the blocks), photoZoomP, hueP.
//@params blockP twirlP photoZoomP
//@audio audioSpread audioKick audioMode audioPhase audioSwell
//@body
void main()
{
    vec2 p = screenP();
    float kick = clamp(audioKick, 0.0, 1.0);
    float swell = clamp(audioSwell, 0.0, 1.0);
    float mode = clamp(audioMode, 0.0, 1.0);
    float bs = 0.18 + 0.2 * clamp(blockP, 0.0, 1.0);
    vec2 q = rot2(0.01 * sceneTime + 0.1 * audioPhase) * p / bs;
    vec2 bi = floor(q);
    vec2 l = fract(q) - 0.5;
    float dir = mod(bi.x + bi.y, 2.0) < 0.5 ? 1.0 : -1.0;
    float T = 0.1 * sceneTime + 0.6 * audioAdvance;
    float r = length(l);
    // Twirl: more rotation toward the centre, vanishing at the block edge (continuous across blocks).
    float edgeFade = smoothstep(0.5, 0.2, max(abs(l.x), abs(l.y)));
    float tw = dir * (T + (0.5 + 2.0 * clamp(twirlP, 0.0, 1.0)) * (1.0 - r * 2.0)) * edgeFade;
    vec2 lr = rot2(tw) * l;
    // Quarter-turn symmetry: fold into one quadrant by rotation (not mirroring).
    float ang = atan(lr.y, lr.x);
    float qd = floor((ang + 3.14159265) / 1.5707963);
    vec2 f = rot2(-(qd * 1.5707963 - 3.14159265 + 0.7853982)) * lr;
    // Blade curvature.
    f.y += (0.1 + 0.5 * clamp(audioSpread, 0.0, 1.0)) * f.x * f.x * dir;
    float z = 0.4 + 0.5 * clamp(photoZoomP, 0.0, 1.0);
    vec2 win = vec2(0.5) + (0.2 + 0.15 * swell) * vec2(sin(0.013 * sceneTime), cos(0.011 * sceneTime));
    vec3 ph = imgLod(win + f * z + bi * 0.03, 0.6);
    // Alternate blades tinted.
    float odd = mod(qd, 2.0);
    vec3 tint = mix(vec3(0.75, 0.9, 1.15), vec3(1.15, 0.9, 0.7), mode);
    vec3 col = ph * mix(vec3(1.0), tint, odd * 0.5);
    // Blade edges: where the quadrant changes.
    float aw = abs(fract((ang + 3.14159265) / 1.5707963 + 0.5) - 0.5) * 1.5707963 * r;
    float px = fwidth(q.x) * 1.2;
    vec3 gc = glowColour(ph, bi * 0.1, hueP * 0.159);
    col += mix(gc, vec3(1.0), 0.4) * smoothstep(px * 2.0, 0.0, aw) * smoothstep(0.02, 0.08, r) * (0.3 + 0.9 * kick);
    col *= 0.85 + 0.15 * smoothstep(0.5, 0.45, max(abs(l.x), abs(l.y)));
    finish(col);
}
