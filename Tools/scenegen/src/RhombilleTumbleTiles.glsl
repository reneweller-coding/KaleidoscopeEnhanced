//@doc
 * @brief RHOMBILLE TUMBLE TILES: the rhombille tiling, the tumbling blocks: every hexagon of a honeycomb is cut into three rhombi, each of which shows the
 * photo turned by a third of a turn from its neighbour, and each rhombus tilts its picture slowly back and forth in its own phase;
 * the three faces are shaded a little (top, left, right) so that the blocks seem to tumble.
 *
 * Audio Reactivity (structure, not only light):
 *   audioPhase      -> the faces' tilts (integrated)
 *   audioSpread     -> the blocks' size (the spectrum's width)
 *   audioSwell      -> the shading's depth
 *
 * Knobs: sizeP (the blocks' size), tiltP (how far the pictures tilt), hueP.
//@params sizeP tiltP
//@audio audioSpread audioSwell
//@body
void main()
{
    vec2 p = screenP();
    float t = sceneTime * 0.2 + 1.5 * audioPhase;
    float N = (3.5 + 5.0 * (1.0 - clamp(sizeP, 0.0, 1.0))) * (0.95 + 0.1 * clamp(audioSpread, 0.0, 1.0));
    vec2 q = p * N;
    vec2 r = vec2(1.0, 1.7320508);
    vec2 h = r * 0.5;
    vec2 a = mod(q, r) - h;
    vec2 b = mod(q - h, r) - h;
    vec2 gv = dot(a, a) < dot(b, b) ? a : b;
    vec2 centre = q - gv;
    float ang = atan(gv.y, gv.x) + 3.14159265;
    float face = floor(ang / 2.0943951 + 0.5 * 0.0);
    face = clamp(face, 0.0, 2.0);
    float fi = face + 3.0 * hash21(floor(centre * 2.0));
    float tilt = (0.15 + 0.5 * clamp(tiltP, 0.0, 1.0)) * sin(t + 2.0 * fi);
    vec2 d = rot2(2.0943951 * face + tilt) * gv * 0.6;
    vec2 uv = (centre / N) * 0.5 * 0.8 + 0.5 + d / N * 3.0;
    float sh = 0.25 + 0.2 * clamp(audioSwell, 0.0, 1.0);
    float shade = face < 0.5 ? 1.0 : (face < 1.5 ? 1.0 - sh : 1.0 - 1.7 * sh);
    vec3 col = imgLod(uv, 0.5) * shade;
    float edge = smoothstep(0.0, 0.06, 0.5 - max(abs(gv.x * 0.866 + gv.y * 0.5), max(abs(gv.y), abs(gv.x * 0.866 - gv.y * 0.5))));
    finish(col * (0.85 + 0.2 * edge) * 1.1);
}
