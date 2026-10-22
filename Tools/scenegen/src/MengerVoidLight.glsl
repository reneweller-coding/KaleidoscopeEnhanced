//@doc
 * @brief MENGER VOID LIGHT: an endless Menger sponge in which only the holes glow -- the walls stay dark, the tunnels
 * carved into them shine from within, the deeper ones paler -- and the eye flies down the widest tunnel's axis
 * while the side tunnels open past it in every direction.  The sponge is a crossed-out cube at every scale: at each
 * level the point is folded into a cell of a third the size, and the three crossing bars of empty space are cut.
 * The level that cut the wall the ray meets, and how near the ray passed other walls, set the light.  One colour
 * family from the photo.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance -> the flight down the tunnel (integrated)
 *   audioSwell   -> the holes widen
 *   audioKick    -> the tunnel walls flash (light)
 *
 * Knobs: holeP (the holes' base size), glowP (the tunnels' inner glow), hueP.
//@params holeP glowP
//@audio audioSwell audioKick
//@body
/**  The endless Menger sponge's distance (no outer cube), and which level cut the nearest wall.
 *
 * @param p     The point. (in)
 * @param hole  The holes' size factor (3: the classic sponge). (in)
 * @param lvl   Returns the level whose cut is nearest. (out)
 *
 * @return
 *   The distance estimate (negative inside the material).
 **/
float menger(vec3 p, float hole, out float lvl)
{
    float d = -1e9, s = 1.0;
    lvl = 0.0;
    for (int m = 0; m < 5; ++m) {
        vec3 a = mod(p * s, 2.0) - 1.0;
        s *= 3.0;
        vec3 r = abs(1.0 - hole * abs(a));
        float da = max(r.x, r.y), db = max(r.y, r.z), dc = max(r.z, r.x);
        float c = (min(da, min(db, dc)) - 1.0) / s;
        if (c > d) { d = c; lvl = float(m); }
    }
    return d;
}

void main()
{
    vec2 p = screenP();
    float fh = famHue();
    float hole = 2.9 + 0.25 * clamp(holeP, 0.0, 1.0) + 0.2 * clamp(audioSwell, 0.0, 1.0);   // holes 1 - 2/hole wide
    float glowK = 0.5 + 0.8 * clamp(glowP, 0.0, 1.0);
    float kick = clamp(audioKick, 0.0, 1.0);
    float fly = 0.12 * sceneTime + 0.5 * audioAdvance;
    vec3 ro = vec3(0.04 * sin(0.3 * fly), 0.04 * cos(0.23 * fly), fly);   // down the widest tunnel (x = y = 0)
    vec3 rd = normalize(vec3(p, 1.0));
    rd.xz = rot2(0.35 * sin(0.021 * sceneTime)) * rd.xz;
    rd.yz = rot2(0.25 * sin(0.017 * sceneTime + 1.0)) * rd.yz;
    rd.xy = rot2(0.02 * sceneTime) * rd.xy;
    vec3 col = vec3(0.0);
    float t = 0.01, lvl = 0.0;
    bool hit = false;
    for (int i = 0; i < 120; ++i) {
        vec3 x = ro + rd * t;
        float d = menger(x, hole, lvl);
        float g = exp(-60.0 * max(d, 0.0));
        float fade = exp(-0.45 * t);
        col += famLight(fh, 0.2 + 0.18 * lvl, 0.2 * g) * g * fade * glowK * 0.03 * (0.2 + 0.6 * lvl);
        if (d < 0.0006 * t) { hit = true; break; }
        t += d * 0.9;
        if (t > 6.0) break;
    }
    if (hit) {
        // the wall itself: dark, but lit at its edge by the hole it borders
        float fade = exp(-0.45 * t);
        col += famLight(fh, 0.2 + 0.18 * lvl, 0.3) * (0.03 + 0.25 * kick) * fade * (0.3 + 0.3 * lvl);
    }
    col += famCol(fh, 0.5) * 0.012;
    finish(col);
}
