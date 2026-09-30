//@doc
 * @brief TEXTURE ANODIZE RAINBOW: anodised titanium -- the photograph is
 * stamped into a sheet of brushed titanium, and a slowly travelling wave
 * of anodising voltage grows an oxide film across it whose thickness
 * paints the metal in its famous colour sequence: straw gold, bronze,
 * purple, deep blue, teal, gold and magenta; the photo's relief changes
 * the thickness, so the picture appears in bands of colour; brushed
 * grain and a moving specular highlight make it metal.  Endless,
 * mirrorable.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the voltage wave travels (integrated, jump-free)
 *   audioSpread     -> the thickness range (more colour bands)
 *   audioKick       -> the highlight flares (light)
 *   audioMode       -> the base voltage: blues/purples in minor, golds in major
 *   audioRoughness  -> the brushing gets coarser
 *   audioSwell      -> the relief depth (slow)
 *
 * Knobs: bandP (photo influence on the bands), brushP (brush grain), shineP, hueP.
//@params bandP brushP shineP
//@audio audioSpread audioKick audioMode audioRoughness audioSwell
//@body
// Titanium anodising colours by oxide thickness (0..1 across the usual range).
vec3 anodize(float t)
{
    t = fract(t);
    vec3 c[8];
    c[0] = vec3(0.75, 0.68, 0.5);  c[1] = vec3(0.72, 0.5, 0.25); c[2] = vec3(0.45, 0.2, 0.45); c[3] = vec3(0.15, 0.2, 0.6);
    c[4] = vec3(0.2, 0.55, 0.65);  c[5] = vec3(0.85, 0.75, 0.3); c[6] = vec3(0.8, 0.3, 0.5);  c[7] = vec3(0.4, 0.7, 0.45);
    float x = t * 8.0;
    int i = int(floor(x));
    vec3 a = c[0], b = c[1];
    for (int n = 0; n < 8; ++n) { if (n == i) { a = c[n]; b = c[(n + 1) - 8 * ((n + 1) / 8)]; } }
    return mix(a, b, smoothstep(0.0, 1.0, fract(x)));
}

void main()
{
    vec2 p = screenP();
    float kick = clamp(audioKick, 0.0, 1.0);
    float swell = clamp(audioSwell, 0.0, 1.0);
    float mode = clamp(audioMode, 0.0, 1.0);
    float rough = clamp(audioRoughness, 0.0, 1.0);
    vec2 uv = p * 0.6 + 0.5 + vec2(0.002, 0.001) * sceneTime;
    float h = texHeight(uv, 3.5, 0.3);
    float T = 0.03 * sceneTime + 0.2 * audioAdvance;
    // Thickness: base (mode), a travelling wave, the photo relief.
    float range = 0.6 + 0.8 * clamp(audioSpread, 0.0, 1.0);
    float wave = 0.5 + 0.5 * sin(dot(p, vec2(1.2, 0.5)) * 2.0 - T * 6.0) * cos(dot(p, vec2(-0.4, 1.0)) * 1.3 + T * 3.0);
    float th = mix(0.3, 0.05, mode) + range * (0.35 * wave + (0.3 + 0.5 * clamp(bandP, 0.0, 1.0)) * h) + hueP * 0.159 * 0.3;
    vec3 film = anodize(th);
    // Brushed grain along one direction.
    float br = noise2(vec2(p.x * 3.0, p.y * (300.0 + 300.0 * clamp(brushP, 0.0, 1.0)) * (1.0 - 0.5 * rough)));
    float br2 = noise2(vec2(p.x * 8.0 + 3.0, p.y * 900.0));
    float grain = 0.85 + 0.15 * br + 0.08 * br2;
    // Relief shading from the photo.
    vec2 gr = texGrad(uv, 3.5) * 0.004 * (0.5 + swell);
    vec3 n = normalize(vec3(-gr, 1.0));
    vec2 lp = vec2(0.7 * sin(0.04 * sceneTime), 0.4 * cos(0.03 * sceneTime));
    vec3 L = normalize(vec3(lp - p, 0.8));
    float diff = max(dot(n, L), 0.0);
    // Anisotropic brushed highlight: stretched across the brush direction.
    vec3 H = normalize(L + vec3(0.0, 0.0, 1.0));
    float aniso = pow(max(0.0, 1.0 - abs(H.y + 0.1 * (br - 0.5))), 12.0) * pow(max(dot(n, H), 0.0), 8.0);
    vec3 col = film * grain * (0.55 + 0.6 * diff);
    col += mix(film, vec3(1.0), 0.5) * aniso * (0.25 + 0.6 * clamp(shineP, 0.0, 1.0)) * (1.0 + 1.2 * kick);
    finish(col * 1.1);
}
