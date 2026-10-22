//@doc
 * @brief CORRUGATED CHROME TUBE: a flight through a corrugated chrome pipe: long highlights ride round its ribs,
 * circling with the music's phase, the photo mirrored in the metal, and the ribs deepen with the bass.  The wall's
 * corrugation is a sine along the pipe; it tilts the wall's normal along the flight, and the view is reflected from it
 * -- the reflection shows the photo as the pipe's surroundings and catches the light strips that circle round, so the
 * highlights stretch along the ribs.  The ribs' depth is the bass (smoothed in a small field of the scene's own); it
 * changes only the shading, never the pipe's shape.  The chrome is tinted by one colour family from the photo.
 *
 * Audio Reactivity (structure, not only light):
 *   audioBass    -> the ribs deepen (smoothed; shading only)
 *   audioPhase   -> the highlights circle round the pipe (integrated)
 *   audioAdvance -> the flight (integrated)
 *   audioSwell   -> the highlights' strength
 *
 * Knobs: ribP (the ribs' spacing), lightP (how many light strips), hueP.
//@params ribP lightP
//@audio audioBass audioPhase audioSwell
//@state 1 1 60
//@body
/**  The state pass: the bass smoothed.
 *
 * @return
 *   x the smoothed bass, 0, 0, 1.
 **/
vec4 stateStep()
{
    float b = clamp(audioBass, 0.0, 1.0);
    float old = stateFrame < 0.5 ? b : texelFetch(texState, ivec2(0, 0), 0).r;
    return vec4(mix(old, b, 0.05), 0.0, 0.0, 1.0);
}

void main()
{
    if (statePass == 1) { fragColor = stateStep(); return; }
    vec2 p = screenP();
    float fh = famHue();
    const float R0 = 0.4;
    float r = max(length(p), 1e-3), a = atan(p.y, p.x);
    float z = R0 / r;
    float fly = 0.3 * sceneTime + 1.0 * audioAdvance;
    float lam = 0.12 + 0.1 * clamp(ribP, 0.0, 1.0);
    float bass = texelFetch(texState, ivec2(0, 0), 0).r;
    float amp = 0.25 + 0.55 * bass;                                   // the ribs' slope
    float Y = z + fly;
    float px = R0 / (r * r * resolution.y) / lam;
    float detail = 1.0 - smoothstep(0.12, 0.35, px);
    float s = amp * cos(6.2831853 * Y / lam) * detail;
    vec3 d = normalize(vec3(p, 1.0));
    vec3 N = normalize(vec3(-cos(a), -sin(a), s));                    // the wall's normal, tilted by the rib
    vec3 R = reflect(d, N);
    vec3 env = imgLod(vec2(0.5) + 0.35 * R.xy / (1.0 + abs(R.z)), 3.0);
    vec3 tint = famCol(fh, 0.55);
    vec3 col = mix(env * 0.6, tint * luma(env), 0.5) * (0.35 + 0.25 * R.z);
    float NL = floor(3.0 + 3.0 * clamp(lightP, 0.0, 1.0));
    float turn = 0.03 * sceneTime + 0.4 * audioPhase;
    for (int i = 0; i < 6; ++i) {
        float fi = float(i);
        if (fi >= NL) break;
        float psi = turn + fi * 6.2831853 / NL;
        vec3 L = normalize(vec3(cos(psi), sin(psi), 0.35));
        float spec = pow(max(dot(R, L), 0.0), 40.0);
        col += famLight(fh, 0.4 + 0.3 * fract(fi * 0.5), 0.8) * spec * (0.7 + 0.8 * clamp(audioSwell, 0.0, 1.0));
    }
    col = mix(col, tint * 0.25, smoothstep(6.0, 18.0, z));
    col += famLight(fh, 0.5, 0.7) * exp(-r * 9.0) * 0.35;
    finish(col);
}
