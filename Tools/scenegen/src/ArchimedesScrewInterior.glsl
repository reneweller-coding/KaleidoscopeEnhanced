//@doc
 * @brief ARCHIMEDES SCREW INTERIOR: inside an Archimedes screw, looking along its axis: the helical blades wind away
 * into the depth, turning with the music's drive, and light flows down the channels between them; the number of
 * blades changes with the sections.  Along a ray from the axis the angle stays the same, so the blades it meets lie a
 * fixed step apart in depth: the first one ahead is found with a single fract, and where it lies beyond the tube's wall
 * the wall shows instead.  A blade is shaded by its slope (steep near the axis, flat at the rim) with grooves round it,
 * and streaks of light flow along it.  Each section's blade count is cross-faded as light.  The blades are toned by the
 * photo, calmed toward one colour family.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance       -> the screw turns and the view moves along it (integrated)
 *   audioSectionId/Age -> the number of blades: two, three or four by the section (cross-faded over six seconds)
 *   audioSwell         -> the light flowing in the channels
 *
 * Knobs: pitchP (the blades' pitch), flowP (how bright the flow is), hueP.
//@params pitchP flowP
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

/**  A blade's light where a ray meets it.
 *
 * @param t      The depth where the ray meets the blade. (in)
 * @param r      The ray's distance from the screen's middle. (in)
 * @param a      The ray's angle. (in)
 * @param blade  The blade's number. (in)
 * @param ns     The number of blades. (in)
 * @param P      The blades' pitch. (in)
 * @param rot    The screw's turning. (in)
 * @param photo  The photo's tone for this angle. (in)
 * @param fh     The family's hue. (in)
 *
 * @return
 *   The light.
 **/
vec3 bladeLight(float t, float r, float a, float blade, float ns, float P, float rot, vec3 photo, float fh)
{
    const float R = 0.5;
    float flowRun = 0.6 * sceneTime + 2.0 * audioAdvance;
    float rho = r * t / R;                                            // 0 at the axis, 1 at the rim
    float slope = atan(P / (6.2831853 * max(rho * R, 0.02)));
    float shade = 0.3 + 0.6 * cos(slope);
    float groove = 0.85 + 0.15 * sin(rho * 40.0);
    float streak = pow(0.5 + 0.5 * sin(6.2831853 * (rho * 3.0 + mod(blade, ns) * 0.37) + 8.0 * (a - rot) - flowRun), 6.0);
    return (photo * shade * groove * 0.7 + famLight(fh, 0.6, 0.5) * streak * 0.6) * exp(-0.12 * t);
}

/**  The screw seen along a ray.
 *
 * @param p    The place on the screen. (in)
 * @param ns   The number of blades. (in)
 * @param P    The blades' pitch. (in)
 * @param rot  The screw's turning. (in)
 * @param fly  The view's place along the axis. (in)
 * @param fh   The family's hue. (in)
 *
 * @return
 *   The light.
 **/
vec3 screw(vec2 p, float ns, float P, float rot, float fly, float fh)
{
    const float R = 0.5;
    float r = max(length(p), 1e-4), a = atan(p.y, p.x);
    float zWall = R / r;
    float ph = ((a - rot) / 6.2831853 - fly / P) * ns;
    float t = P / ns * fract(ph);                                     // the first blade ahead (phase falls with depth)
    float blade = floor(ph);
    vec3 photo = tone(imgLod(vec2(0.5 + 0.3 * cos(a), 0.5 + 0.3 * sin(a)), 4.0), fh);
    // the tube's wall beyond the blades
    float rings = 0.8 + 0.2 * sin(6.2831853 * (zWall + fly) * 4.0);
    vec3 wall = photo * 0.35 * rings * exp(-0.12 * zWall);
    vec3 nearL = t < zWall ? bladeLight(t, r, a, blade, ns, P, rot, photo, fh) : wall;
    vec3 nextL = t + P / ns < zWall ? bladeLight(t + P / ns, r, a, blade - 1.0, ns, P, rot, photo, fh) : wall;
    // the blade passing the eye fades out over the one behind it, so its edge never cuts the picture
    return mix(nextL, nearL, smoothstep(0.0, 0.5 * P / ns, t));
}

void main()
{
    vec2 p = screenP();
    float fh = famHue();
    float P = 0.8 + 0.6 * clamp(pitchP, 0.0, 1.0);
    float rot = 0.04 * sceneTime + 0.6 * audioAdvance;
    float fly = 0.1 * sceneTime + 0.3 * audioAdvance;
    float m = smoothstep(0.0, 6.0, audioSectionAge);
    float nA = 2.0 + mod(max(audioSectionPrev, 0.0), 3.0), nB = 2.0 + mod(max(audioSectionId, 0.0), 3.0);
    vec3 col = m * screw(p, nB, P, rot, fly, fh);
    if (m < 0.999) col += (1.0 - m) * screw(p, nA, P, rot, fly, fh);
    float flow = (0.6 + 0.6 * clamp(audioSwell, 0.0, 1.0)) * (0.6 + 0.6 * clamp(flowP, 0.0, 1.0));
    col *= flow;
    col += famLight(fh, 0.6, 0.6) * exp(-length(p) * 9.0) * 0.4;
    finish(col);
}
