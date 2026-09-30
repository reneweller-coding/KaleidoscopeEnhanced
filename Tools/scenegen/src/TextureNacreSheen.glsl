//@doc
 * @brief TEXTURE NACRE SHEEN: mother-of-pearl -- the photograph becomes the
 * inside of a shell: its structure turns into fine growth terraces and
 * layered platelets whose thin-film interference plays in pink, green,
 * gold and blue, the colours sliding across the surface as if the shell
 * were slowly tilted in the light; a soft pearly white underlies it all,
 * a bright sheen band wanders over it.  Endless, mirrorable.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the tilt changes (integrated, jump-free)
 *   audioSpread     -> how strongly the colours play
 *   audioHigh       -> the platelets glitter (light)
 *   audioKick       -> the sheen band brightens (light)
 *   audioMode       -> the base: silver-blue in minor, warm pink in major
 *   audioSwell      -> terrace depth (slow)
 *
 * Knobs: terraceP (terrace density), plateP (platelet size), colourP (colour play), hueP.
//@params terraceP plateP colourP
//@audio audioSpread audioHigh audioKick audioMode audioSwell
//@body
vec3 thinFilm(float d)
{
    // Interference colour for an optical path d (in wavelengths of green).
    return 0.5 + 0.5 * cos(6.2831853 * d * vec3(0.82, 1.0, 1.2) + vec3(0.0, 0.4, 0.9));
}

void main()
{
    vec2 p = screenP();
    float hi = clamp(audioHigh * 1.5, 0.0, 1.0);
    float kick = clamp(audioKick, 0.0, 1.0);
    float swell = clamp(audioSwell, 0.0, 1.0);
    vec2 uv = p * 0.7 + 0.5 + vec2(0.002, 0.0015) * sceneTime;
    // Height of the shell: broad photo masses plus terraces.
    float h = texHeight(uv, 4.5, 0.3);
    float nT = 10.0 + 25.0 * clamp(terraceP, 0.0, 1.0);
    float ter = h * nT + 0.3 * fbm3(p * 3.0);
    float step_ = fract(ter);
    float terrace = smoothstep(0.0, 0.08, step_) * smoothstep(1.0, 0.85, step_);
    // Platelets: a cell texture, each tile of nacre slightly different thickness.
    float ps = 25.0 + 40.0 * (1.0 - clamp(plateP, 0.0, 1.0));
    vec2 g = p * ps + 0.5 * vec2(fbm3(p * 4.0), fbm3(p * 4.0 + 3.0));
    vec2 gi = floor(g), gf = fract(g);
    float f1 = 9.0; vec2 id = gi;
    for (int y = -1; y <= 1; ++y) for (int x = -1; x <= 1; ++x) {
        vec2 o = vec2(x, y);
        vec2 c = o + 0.15 + 0.7 * hash22(gi + o);
        float d = length(gf - c);
        if (d < f1) { f1 = d; id = gi + o; }
    }
    float plate = hash21(id);
    // The tilt: the view angle over the surface changes slowly.
    float tiltT = 0.03 * sceneTime + 0.25 * audioAdvance;
    vec2 tilt = vec2(sin(tiltT), cos(tiltT * 0.8));
    vec2 gh = texGrad(uv, 4.0) * 0.02;
    float view = dot(p + gh * 3.0, tilt) * 1.5;
    float play = (0.5 + 1.0 * clamp(colourP, 0.0, 1.0)) * (0.7 + 0.6 * clamp(audioSpread, 0.0, 1.0));
    float d = 1.2 + h * 2.0 * play + view + 0.25 * plate + floor(ter) * 0.07 * (0.5 + swell);
    vec3 irid = mix(vec3(1.0), thinFilm(d + hueP * 0.159), 0.45);
    float mode = clamp(audioMode, 0.0, 1.0);
    vec3 base = mix(vec3(0.8, 0.85, 0.95), vec3(0.98, 0.86, 0.85), mode);
    vec3 photo = imgLod(uv, 1.0);
    vec3 col = base * (0.75 + 0.3 * luma(photo));
    col = mix(col, col * irid * 1.25, 0.3 + 0.3 * play * 0.6);
    col *= 0.93 + 0.1 * plate;
    col *= 0.72 + 0.28 * terrace;
    col += irid * (1.0 - terrace) * 0.12;                     // terrace steps catch colour
    // Sheen band wandering over the shell.
    float band = exp(-pow(dot(p, vec2(tilt.y, -tilt.x)) * 2.5 - sin(tiltT * 1.3) * 1.2, 2.0));
    col += vec3(1.0, 0.97, 0.95) * band * (0.15 + 0.35 * kick);
    // Glittering platelets.
    float gl = pow(hash21(id + 7.0), 30.0) * (0.5 + 0.5 * sin(sceneTime * 2.0 + plate * 40.0));
    col += vec3(1.0) * gl * smoothstep(0.35, 0.0, f1) * (0.3 + 1.2 * hi);
    col *= 0.95;
    finish(col);
}
