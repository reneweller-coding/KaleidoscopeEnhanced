//@doc
 * @brief CAHN-HILLIARD QUENCH: spinodal decomposition -- a mixture quenched below its critical point separates into
 * two phases by the Cahn-Hilliard equation, c_t = lap(c^3 - c - k lap c): first a fine labyrinth, then ever coarser
 * domains that round off and merge.  The two phases are two cuts of the photo; their interface is a bright seam.  A
 * change of harmony quenches anew: noise is faded back in and the labyrinth starts again at its finest.  An endless,
 * periodic field.
 *
 * Audio Reactivity (structure, not only light):
 *   audioHarmChange -> a new quench: the mixture is stirred back toward noise and separates again (structure)
 *   audioSectionId  -> each section shifts the mixing ratio (more of one phase: islands instead of labyrinths)
 *   audioPhase      -> the palette turns through the photo (integrated)
 *   audioKick       -> the seams flash (light)
 *
 * Knobs: ratioP (the base mixing ratio), scaleP (domain size on screen), seamP (how bright the seams are), hueP.
//@params ratioP scaleP seamP
//@audio audioKick audioHarmChange audioSectionId
//@state 320 180 600
//@body
/**  The mixing ratio this section aims for (the mean of c).
 *
 * @return
 *   The target mean, -0.45..0.45.
 **/
float ratioNow()
{
    float k = max(audioSectionId, 0.0);
    return clamp((clamp(ratioP, 0.0, 1.0) - 0.5) * 0.6 + 0.3 * sin(2.4 * k), -0.45, 0.45);
}
/**  The chemical potential's local part, c^3 - c, at a cell.
 *
 * @param ip  The cell. (in)
 *
 * @return
 *   c^3 - c.
 **/
float fAt(ivec2 ip) { float c = stAt(ip).r; return c * c * c - c; }

/**  One explicit step of the Cahn-Hilliard equation for this cell (the state pass): the Laplacian of the local
 * potential and the biharmonic (13-point) of c.
 *
 * @return
 *   c, 0, 0, 1.
 **/
vec4 stateStep()
{
    ivec2 ip = stCell();
    if (stateFrame < 0.5) return vec4(ratioNow() + 0.2 * (stRand(0) - 0.5), 0.0, 0.0, 1.0);
    float dt = 0.02, kappa = 1.0;
    float c = stAt(ip).r;
    float lapF = fAt(ip + ivec2(1, 0)) + fAt(ip - ivec2(1, 0)) + fAt(ip + ivec2(0, 1)) + fAt(ip - ivec2(0, 1))
                 - 4.0 * (c * c * c - c);
    float s4 = stAt(ip + ivec2(1, 0)).r + stAt(ip - ivec2(1, 0)).r + stAt(ip + ivec2(0, 1)).r + stAt(ip - ivec2(0, 1)).r;
    float sd = stAt(ip + ivec2(1, 1)).r + stAt(ip - ivec2(1, 1)).r + stAt(ip + ivec2(1, -1)).r + stAt(ip + ivec2(-1, 1)).r;
    float sf = stAt(ip + ivec2(2, 0)).r + stAt(ip - ivec2(2, 0)).r + stAt(ip + ivec2(0, 2)).r + stAt(ip - ivec2(0, 2)).r;
    float bih = 20.0 * c - 8.0 * s4 + 2.0 * sd + sf;
    float c2 = c + dt * (lapF - kappa * bih);
    c2 += 0.0004 * (ratioNow() - c);                            // a slow pull toward the section's ratio
    // a change of harmony: a new quench (the field stirred back toward the mixture), once per 200 steps at most
    if (mod(stateFrame, 200.0) < 1.0 && clamp(audioHarmChange, 0.0, 1.0) > 0.5)
        c2 = mix(c2, ratioNow() + 0.3 * (stRand(1) - 0.5), 0.85);
    return vec4(clamp(c2, -1.5, 1.5), 0.0, 0.0, 1.0);
}

void main()
{
    if (statePass == 1) { fragColor = stateStep(); return; }
    vec2 p = screenP();
    float zoom = 0.35 + 0.45 * clamp(scaleP, 0.0, 1.0);
    vec2 cc = stView(p, zoom);
    float c = stLin(cc).r;
    vec2 g = vec2(stLin(cc + vec2(1.0, 0.0)).r - stLin(cc - vec2(1.0, 0.0)).r,
                  stLin(cc + vec2(0.0, 1.0)).r - stLin(cc - vec2(0.0, 1.0)).r) * 0.5;
    vec2 uv = p * 0.7 + 0.5 + 0.005 * sceneTime * vec2(1.0, 0.6);
    vec3 a = imgLod(uv, 0.6);
    vec3 b = imgLod(vec2(1.0 - uv.y, uv.x) * 1.1 + 0.3, 0.6);     // the other phase: another cut, turned
    vec3 tA = imgPalette(0.1 + 0.03 * audioPhase), tB = imgPalette(0.6 + 0.03 * audioPhase);
    float w = smoothstep(-0.35, 0.35, c);
    vec3 col = mix(mix(b, b * tB * 1.6, 0.3) * 0.7, mix(a, a * tA * 1.6, 0.3), w);
    float seam = exp(-c * c * 12.0) * min(length(g) * 3.0, 1.0);
    col += mix(mix(tA, tB, 0.5), vec3(1.0), 0.5) * seam * (0.3 + 0.7 * clamp(seamP, 0.0, 1.0))
           * (0.7 + 0.6 * clamp(audioKick, 0.0, 1.0));
    finish(col);
}
