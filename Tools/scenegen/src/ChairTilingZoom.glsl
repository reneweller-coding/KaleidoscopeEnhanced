//@doc
 * @brief CHAIR TILING ZOOM: the chair tiling: an L of three squares divides into four smaller L's of half the size, which divide again without end,
 * and the picture zooms into the corner where the pattern is the same at every scale; each chair carries the photo turned the way the chair is, so the photo
 * lies at skew angles in every cell.  The zoom never jumps: after one halving the picture is the same.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the zoom (integrated; one halving per cycle)
 *   audioPhase      -> the photo's own turn in the chairs (integrated)
 *   audioSwell      -> the depth of the division that shows
 *
 * Knobs: depthP (how deep the division shows), hueP.
//@params depthP
//@audio audioSwell
//@body
/**  The sub-chair that holds a cell of the chair divided into four, with its box corner, its missing cell and its turn.
 *
 * @param cell  The cell (0..3 each) of the doubled chair. (in)
 * @param box   The sub-chair's box corner. (out)
 * @param miss  The sub-chair's missing corner (0 lower left, 1 lower right, 2 upper left, 3 upper right). (out)
 *
 * @return
 *   True if the cell belongs to a sub-chair.
 **/
bool chairSub(ivec2 cell, out vec2 box, out int miss)
{
    box = vec2(0.0);
    miss = 3;
    if (cell == ivec2(0, 0) || cell == ivec2(1, 0) || cell == ivec2(0, 1)) { box = vec2(0.0, 0.0); miss = 3; return true; }
    if (cell == ivec2(0, 2) || cell == ivec2(0, 3) || cell == ivec2(1, 3)) { box = vec2(0.0, 2.0); miss = 1; return true; }
    if (cell == ivec2(1, 1) || cell == ivec2(2, 1) || cell == ivec2(1, 2)) { box = vec2(1.0, 1.0); miss = 3; return true; }
    if (cell == ivec2(2, 0) || cell == ivec2(3, 0) || cell == ivec2(3, 1)) { box = vec2(2.0, 0.0); miss = 2; return true; }
    return false;
}
void main()
{
    vec2 p = screenP();
    float run = 0.012 * sceneTime + 0.03 * audioAdvance;
    float f = fract(run);
    vec2 v = vec2((p.x / 1.7778 + 0.5) * 1.78, (0.5 - p.y) * 0.98);
    vec2 q = v * exp2(-f);
    int rot = 0;
    float path = 0.0;
    float used = 0.0;
    float depth = 2.0 + 1.2 * clamp(depthP, 0.0, 1.0) + 0.6 * clamp(audioSwell, 0.0, 1.0);
    for (int i = 0; i < 9; ++i) {
        if (float(i) >= depth) break;
        vec2 P = q * 2.0;
        vec2 box;
        int miss;
        if (!chairSub(ivec2(floor(P)), box, miss)) break;
        vec2 l = P - box - 1.0;
        if (miss == 2) { l = vec2(l.y, -l.x); rot += 1; }
        else if (miss == 1) { l = vec2(-l.y, l.x); rot += 3; }
        else if (miss == 0) { l = -l; rot += 2; }
        q = l + 1.0;
        path = path * 1.7 + float(miss) + 1.0;
        used += 1.0;
    }
    float ang = 1.5707963 * float(rot) + 0.1 * (sceneTime * 0.3 + 3.0 * audioPhase);
    vec2 uv = rot2(ang) * (q - 1.0) * 0.5 * 0.9 + 0.5;
    vec3 col = imgLod(uv, max(used - 1.0, 0.0) + 0.3) * (0.85 + 0.25 * hash21(vec2(mod(path, 877.0), 2.0)));
    finish(col * 1.05);
}
