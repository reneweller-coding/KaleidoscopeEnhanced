//@doc
 * @brief ORSZAG-TANG PLASMA: the look of the Orszag-Tang vortex of magnetohydrodynamics -- magnetic field lines
 * crowded together by the flow into thin current sheets, which tear into chains of plasmoids, little magnetic
 * islands that drift along the sheets.  The field lines are drawn as fine glowing contours; the photo streams along
 * them (smeared along the field), and the current sheets blaze.  A periodic field: it wraps without seams.
 *
 * Audio Reactivity (structure, not only light):
 *   audioRoughness  -> the resistivity: rough music thickens the sheets and breeds more plasmoids
 *   audioAdvance    -> the flow that bends the field moves on (integrated)
 *   audioKick       -> the sheets flare where they tear (light, local)
 *   audioPhase      -> the palette turns (integrated)
 *
 * Knobs: linesP (field-line density), sheetP (how bright the sheets are), streamP (how far the photo streams), hueP.
//@params linesP sheetP streamP
//@audio audioKick audioRoughness
//@body
/**  The magnetic potential A: the Orszag-Tang field, bent by a slowly moving flow, with plasmoid chains.
 *
 * @param x  The point (the period is 2 pi). (in)
 *
 * @return
 *   A at the point.
 **/
float potential(vec2 x)
{
    float t = 0.05 * sceneTime + 0.01 * audioAdvance;
    vec2 w = x + 0.55 * vec2(sin(x.y + t) + 0.3 * sin(2.0 * x.y - 1.3 * t), sin(x.x - 0.8 * t) + 0.3 * sin(2.0 * x.x + t));
    float A = 0.5 * cos(2.0 * w.x) + cos(w.y);
    float isl = 0.12 + 0.12 * clamp(audioRoughness, 0.0, 1.0);
    A += isl * cos(6.0 * w.x + 2.0 * t) * cos(3.0 * w.y - t);
    return A;
}

void main()
{
    vec2 p = screenP();
    vec2 x = p * 6.2831853 * 0.75 + vec2(1.0, 0.5);
    float e = 0.004;
    float A = potential(x);
    float ax = potential(x + vec2(e, 0.0)), ay = potential(x + vec2(0.0, e));
    float bx = potential(x - vec2(e, 0.0)), by = potential(x - vec2(0.0, e));
    vec2 g = vec2(ax - bx, ay - by) / (2.0 * e);
    float J = -(ax + bx + ay + by - 4.0 * A) / (e * e);         // the current: minus the Laplacian of A
    vec2 B = vec2(g.y, -g.x);                                   // the field runs along the contours of A
    vec2 dir = B / max(length(B), 1e-3);
    // the photo smeared along the field lines
    vec3 photo = vec3(0.0);
    float sl = 0.0015 + 0.005 * clamp(streamP, 0.0, 1.0);
    vec2 uv = p * 0.75 + 0.5;
    for (int i = -3; i <= 3; ++i) photo += imgLod(uv + dir * float(i) * sl, 0.3);
    photo /= 7.0;
    // the field lines: contours of A
    float dens = 8.0 + 14.0 * clamp(linesP, 0.0, 1.0);
    float fl = abs(fract(A * dens) - 0.5) / max(length(g) * dens * 0.004, 1e-3);
    float line = 1.0 - smoothstep(0.5, 1.5, fl);
    float sheet = smoothstep(4.0, 14.0, abs(J)) * (0.3 + 0.7 * clamp(sheetP, 0.0, 1.0));
    vec3 tone = imgPalette(0.1 + 0.05 * A + 0.03 * audioPhase);
    // the plasma: dark between the lines, the photo lit along them, the sheets blazing
    vec3 col = photo * (0.3 + 0.9 * line);
    col += mix(tone, vec3(1.0), 0.4) * line * 0.25;
    col = mix(col, mix(tone, vec3(1.0, 0.85, 0.7), 0.5) * 1.6, sheet * (0.6 + 0.4 * clamp(audioKick, 0.0, 1.0)));
    finish(col);
}
