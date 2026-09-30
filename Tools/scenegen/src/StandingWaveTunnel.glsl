//@doc
 * @brief STANDING WAVE TUNNEL: flying through a tunnel that vibrates like the
 * inside of an organ pipe -- its wall bulges and pinches in a standing
 * wave along its length and around its circumference, nodes and
 * antinodes breathing in and out, the photograph stretched over the
 * moving wall and lit by how the wall faces us: bulges glow, pinches
 * darken into rings.  Endless, mirrorable; the wall continues beyond the
 * frame.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the flight (integrated, jump-free)
 *   audioPhase      -> the wave's phase (integrated)
 *   audioSpread     -> wave amplitude (slow)
 *   audioMode       -> lobes around the tunnel: 4 in minor, 6 in major (blended)
 *   audioKick       -> the antinode rings glow (light)
 *   audioSwell      -> depth glow (slow)
 *
 * Knobs: waveP (wavelength), ampP (base amplitude), wallZoomP, hueP.
//@params waveP ampP wallZoomP
//@audio audioPhase audioSpread audioMode audioKick audioSwell
//@body
float gK, gA, gPh, gMix;
float radiusAt(float z, float a)
{
    float lobes = mix(cos(4.0 * a), cos(6.0 * a), gMix);
    return 1.0 + gA * sin(gK * z) * cos(gPh) + 0.5 * gA * lobes * sin(gK * z * 0.5 + 1.0) * sin(gPh * 0.7);
}

void main()
{
    vec2 p = screenP();
    float kick = clamp(audioKick, 0.0, 1.0);
    float swell = clamp(audioSwell, 0.0, 1.0);
    float r = max(length(p), 1e-4);
    float a = atan(p.y, p.x);
    float travel = 0.5 * sceneTime + 3.0 * audioAdvance;
    gK = 1.2 + 2.0 * clamp(waveP, 0.0, 1.0);
    gA = (0.08 + 0.15 * clamp(ampP, 0.0, 1.0)) * (0.6 + 0.8 * clamp(audioSpread, 0.0, 1.0));
    gPh = 0.3 * sceneTime + 1.5 * audioPhase;
    gMix = smoothstep(0.2, 0.8, clamp(audioMode, 0.0, 1.0));
    // Solve z = R(z) / r (the wall seen at screen radius r) by iteration.
    float z = 0.5 / r;
    for (int i = 0; i < 6; ++i) z = 0.5 * radiusAt(z + travel, a) / r;
    float wz = z + travel;
    float R = radiusAt(wz, a);
    float dR = (radiusAt(wz + 0.01, a) - radiusAt(wz - 0.01, a)) / 0.02;
    // Wall facing: a bulge coming toward us (dR < 0 ahead) faces the camera.
    float facing = clamp(0.55 - dR * 1.2, 0.1, 1.3);
    float zoom = 0.3 + 0.4 * clamp(wallZoomP, 0.0, 1.0);
    vec2 uv = vec2(a / 3.14159265, wz * zoom * 0.5);
    vec2 cfw = fwidth(vec2(cos(a), sin(a)));
    float fw = max(length(cfw) / 3.14159265, fwidth(z) * zoom * 0.5) * 1024.0;
    vec3 wall = imgLod(uv, clamp(log2(max(fw, 1.0)), 0.0, 9.0));
    vec3 gc = glowColour(imgLod(vec2(0.5 + 0.1 * sin(0.02 * sceneTime), 0.5), 6.0), vec2(wz * 0.05, 0.0), hueP * 0.159);
    vec3 col = wall * facing * 1.2;
    // Antinode rings (where the radius is largest) glow.
    float anti = smoothstep(0.6, 1.0, (R - 1.0) / max(gA, 1e-3));
    col += gc * anti * (0.15 + 0.7 * kick);
    // Pinches darken.
    col *= 0.6 + 0.4 * smoothstep(-1.0, 0.0, (R - 1.0) / max(gA, 1e-3));
    float fog = exp(-z * 0.12);
    col = mix(gc * (0.15 + 0.5 * swell), col, fog);
    col += gc * exp(-r * 14.0) * (0.5 + swell);
    finish(col);
}
