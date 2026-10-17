//@doc
 * @brief LAGRANGIAN RIDGE TRANSPORT: the time-periodic double gyre -- two counter-rotating cells whose dividing line
 * sways back and forth.  Fluid near the line is caught by the stable and unstable manifolds and drawn out along
 * them; the photo carried by the flow folds into the Lagrangian coherent structures, ridge upon ridge like a
 * mountain range seen from above.  The gyres are mirrored across the screen, so the ridges run on without seams.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSpread     -> the sway's amplitude (wide, rich music: deeper folds)
 *   audioAdvance    -> the sway's phase moves on with the music (integrated)
 *   audioSwell      -> the gyres' strength
 *   audioKick       -> the ridges flash (light)
 *
 * Knobs: swayP (the base sway), periodP (the sway's period), freshP (how fast the photo returns), hueP.
//@params swayP periodP freshP
//@audio audioSwell audioKick audioSpread
//@state 384 216 120 32
//@body
/**  The double gyre's velocity (Shadden et al.) on [0, 2] x [0, 1], mirrored into a periodic field.
 *
 * @param x  The point (gyre units). (in)
 *
 * @return
 *   The velocity in gyre units per unit time.
 **/
vec2 gyre(vec2 x)
{
    float eps = (0.1 + 0.25 * clamp(swayP, 0.0, 1.0)) * (0.7 + 0.6 * clamp(audioSpread, 0.0, 1.0));
    float om = 6.2831853 / (6.0 + 10.0 * clamp(periodP, 0.0, 1.0));
    float s = eps * sin(om * sceneTime * 1.5 + 0.05 * audioAdvance);
    // fold the plane into the gyre box, keeping the reflections' signs
    vec2 m = mod(x, vec2(4.0, 2.0));
    vec2 sg = vec2(1.0);
    if (m.x > 2.0) { m.x = 4.0 - m.x; sg.x = -1.0; }
    if (m.y > 1.0) { m.y = 2.0 - m.y; sg.y = -1.0; }
    float f = s * m.x * m.x + (1.0 - 2.0 * s) * m.x;
    float df = 2.0 * s * m.x + (1.0 - 2.0 * s);
    vec2 v = 3.14159265 * vec2(-sin(3.14159265 * f) * cos(3.14159265 * m.y), cos(3.14159265 * f) * sin(3.14159265 * m.y) * df);
    return v * sg;
}

/**  One step of the photo carried by the double gyre for this cell (the state pass).
 *
 * @return
 *   The photo displacement (rg), 0, 1.
 **/
vec4 stateStep()
{
    if (stateFrame < 0.5) return vec4(0.0, 0.0, 0.0, 1.0);
    // the field holds exactly one period of the mirrored boxes (4 x 2 gyre units), so it wraps without a seam
    vec2 scale = vec2(4.0, 2.0) / stateRes;
    vec2 v = gyre((vec2(stCell()) + 0.5) * scale);
    float speed = 0.0015 + 0.003 * clamp(audioSwell, 0.0, 1.0);
    return stCarry(v * speed / scale, 0.0004 + 0.003 * clamp(freshP, 0.0, 1.0));
}

void main()
{
    if (statePass == 1) { fragColor = stateStep(); return; }
    vec2 p = screenP();
    vec2 cc = stView(p, 1.0);
    vec2 uv = stUV(cc);
    float lod = stLod(cc, resolution.y / stateRes.y);
    vec3 photo = imgLod(uv * 0.85 + 0.08, lod);
    // the ridges: where the map is stretched most, lit like crests
    float ridge = smoothstep(1.0, 3.5, lod);
    vec3 tone = imgPalette(0.25 + 0.03 * audioPhase);
    vec3 col = photo * (0.85 + 0.25 * ridge) + mix(tone, vec3(1.0), 0.5) * ridge * 0.18 * (0.5 + clamp(audioKick, 0.0, 1.0));
    finish(col);
}
