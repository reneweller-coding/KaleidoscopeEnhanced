//@doc
 * @brief POLARIZATION ROTATOR FIELD: the photo seen as an optically active sample between crossed polarisers -- each
 * place turns the plane of polarisation by an amount that grows with its thickness, more for blue than for red,
 * so the colours that pass the analyser wander through the picture in bands as the polariser turns: the sugar-
 * solution rainbows of the physics lab, laid over the photo's own forms.
 *
 * Audio Reactivity (structure, not only light):
 *   audioPhase      -> the polariser turns (integrated): the colour bands sweep
 *   audioSwell      -> the activity: thicker, more colourful bands in loud passages
 *   audioKick       -> the brightest bands flash (light)
 *
 * Knobs: activityP (the base rotation per thickness), bandsP (how many bands across the picture), photoP (how much
 * of the photo's own colour shows), hueP.
//@params activityP bandsP photoP
//@audio audioSwell audioKick
//@body
void main()
{
    vec2 p = screenP();
    vec2 uv = p * 0.7 + 0.5;
    vec3 photo = imgLod(uv, 0.5);
    // thickness: the photo's soft brightness plus a slow, wide undulation
    float th = luma(imgLod(uv, 2.5)) + 0.25 * sin(3.0 * p.x + 0.04 * sceneTime) * sin(2.3 * p.y - 0.03 * sceneTime);
    float act = (1.2 + 3.0 * clamp(activityP, 0.0, 1.0)) * (0.7 + 0.6 * clamp(audioSwell, 0.0, 1.0));
    float bands = 1.0 + 3.0 * clamp(bandsP, 0.0, 1.0);
    float pol = 0.1 * audioPhase + 0.05 * sceneTime;
    // optical rotation grows as 1 / lambda^2: red, green and blue turn by different angles
    vec3 rho = act * bands * th * vec3(1.0, 1.45, 2.1) + pol;
    vec3 pass = sin(rho) * sin(rho);                            // crossed polarisers: sin^2 of the rotation
    pass = mix(pass, vec3(dot(pass, vec3(0.333))), 0.45);       // the colours of a real sample are not pure primaries
    vec3 col = mix(pass * 0.8, pass * photo * 2.4, 0.5 + 0.45 * clamp(photoP, 0.0, 1.0));
    col += pass * smoothstep(0.85, 1.0, max(pass.r, max(pass.g, pass.b))) * 0.15 * (0.4 + clamp(audioKick, 0.0, 1.0));
    finish(col);
}
