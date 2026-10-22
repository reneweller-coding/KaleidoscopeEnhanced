//@doc
 * @brief KALEIDO TUNNEL BRANCHING: a kaleidoscope tunnel that forks: ahead of the eye the tunnel splits into two
 * branches, each with its own vanishing point, and the eye takes one of them -- its vanishing point glides to the
 * middle of the view while the other slides off to the side -- and soon the next fork opens.  The walls are drawn
 * in the tunnel's own coordinates: depth 1/r and angle round the nearer branch's axis, blended smoothly between the
 * two branches by how near each one's axis is; the walls carry the photo folded into rings of mirrored tiles.  The
 * photo's own colours, calmed toward one colour family; the far end fades into a glow.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSectionId/Age -> every new section chooses the other branch (the turn takes eight seconds)
 *   audioAdvance       -> the travel (integrated)
 *   audioSwell         -> the tiles' seams glow
 *
 * Knobs: tileP (how many tiles round the tunnel), spreadP (how far apart the branches are), hueP.  Distinct from
 * TextureForkingTunnel, which has no fold.
//@params tileP spreadP
//@audio audioSectionId audioSectionPrev audioSectionAge audioSwell
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

/**  One tunnel's wall seen round a vanishing point.
 *
 * @param d       The point relative to the vanishing point. (in)
 * @param travel  The travel (depth). (in)
 * @param tiles   The tiles round the tunnel. (in)
 * @param fh      The colour family. (in)
 * @param seam    Returns the distance to the tiles' seams. (out)
 *
 * @return
 *   The light.
 **/
vec3 tunnelWall(vec2 d, float travel, float tiles, float fh, out float seam)
{
    float r = max(length(d), 1e-4);
    float z = 0.35 / r + travel;                                 // depth along the tunnel
    float a = atan(d.y, d.x) / 6.2831853 * tiles;
    vec2 cell = vec2(a, z * 2.0);
    vec2 f = abs(fract(cell * 0.5) * 2.0 - 1.0);               // mirrored tiles: no seam round the tunnel
    seam = min(min(f.x, 1.0 - f.x), min(f.y, 1.0 - f.y));
    vec3 c = tone(imgLod(f * 0.8 + 0.1, 0.7), fh);
    return c * smoothstep(0.02, 0.25, r);                        // the far end fades
}

void main()
{
    vec2 p = screenP();
    float fh = famHue();
    float tiles = 2.0 * floor(4.0 + 4.0 * clamp(tileP, 0.0, 1.0));
    float spread = 0.25 + 0.2 * clamp(spreadP, 0.0, 1.0);
    float travel = 0.1 * sceneTime + 0.45 * audioAdvance;
    // the chosen branch: left or right by the section, turning over eight seconds
    float sA = mod(max(audioSectionPrev, 0.0), 2.0) * 2.0 - 1.0, sB = mod(max(audioSectionId, 0.0), 2.0) * 2.0 - 1.0;
    float choice = mix(sA, sB, smoothstep(0.0, 8.0, audioSectionAge));
    // the two branches' vanishing points: the chosen one drifts to the middle, the other aside
    vec2 v1 = vec2(-spread * (1.0 + choice), 0.05 * sin(0.1 * sceneTime));
    vec2 v2 = vec2(spread * (1.0 - choice), -0.05 * sin(0.1 * sceneTime));
    float s1, s2;
    vec3 c1 = tunnelWall(p - v1, travel, tiles, fh, s1);
    vec3 c2 = tunnelWall(p - v2, travel + 0.5, tiles, fh, s2);
    // blend by which branch's axis is nearer (smoothly): the wall between them is shared
    float w = smoothstep(-0.12, 0.12, length(p - v1) - length(p - v2));
    vec3 col = mix(c1, c2, w);
    float seam = mix(s1, s2, w);
    col += famLight(fh, 0.6, 0.5) * exp(-seam / 0.02) * (0.08 + 0.3 * clamp(audioSwell, 0.0, 1.0));
    // the two far ends glow
    col += famLight(fh, 0.6, 0.7) * 0.25 * (exp(-length(p - v1) * 14.0) + exp(-length(p - v2) * 14.0));
    finish(col);
}
