//@doc
 * @brief FLOCKING PHASE TRANSITION: the Vicsek model at its transition from disorder to order, as a field -- every cell
 * holds a heading, carried along by itself, turned toward the mean heading of its neighbours and shaken by noise.
 * Below a critical noise the headings lock into great flocks streaming across the frame in bands; above it they
 * dissolve into a churning gas; the music's roughness moves the noise back and forth across the transition.
 * Round particles ride the heading field, coloured by where they head.
 *
 * Audio Reactivity (structure, not only light):
 *   audioRoughness  -> the noise: rough sound melts the flocks, smooth sound orders them
 *   audioAdvance    -> the particles' speed (integrated: the music's drive)
 *   audioKick       -> the particles flash (light)
 *
 * Knobs: noiseP (the base noise), speedP (how fast the field carries itself), photoP (photo share), hueP.
//@params noiseP speedP photoP
//@audio audioRoughness audioKick
//@state 160 90 30
//@body
/**  One Vicsek step for this cell (the state pass): carried along its own heading, aligned with its neighbours,
 * shaken by noise.
 *
 * @return
 *   The heading as a unit vector (xy), 0, 1.
 **/
vec4 stateStep()
{
    ivec2 ip = stCell();
    if (stateFrame < 0.5) { float a = 6.2831853 * stRand(0); return vec4(cos(a), sin(a), 0.0, 1.0); }
    vec2 h0 = stAt(ip).xy;
    float v0 = 0.6 + 1.2 * clamp(speedP, 0.0, 1.0);
    vec2 from = vec2(ip) + 0.5 - h0 * v0;                       // carried along its own heading
    vec2 sum = vec2(0.0);
    for (int j = -1; j <= 1; ++j) for (int i = -1; i <= 1; ++i) sum += stLin(from + vec2(float(i), float(j))).xy;
    float eta = clamp(0.1 + 0.3 * clamp(noiseP, 0.0, 1.0) + 0.6 * clamp(audioRoughness, 0.0, 1.0), 0.05, 1.0);   // the noise
    float a = atan(sum.y, sum.x) + eta * 3.14159265 * (stRand(1) - 0.5) * 2.0;
    float m = length(sum) / 9.0;
    if (m < 0.05) a = 6.2831853 * stRand(2);
    return vec4(cos(a), sin(a), 0.0, 1.0);
}

void main()
{
    if (statePass == 1) { fragColor = stateStep(); return; }
    vec2 p = screenP();
    float spacing = 0.02, rad = spacing * 0.33, life = 2.0;
    float run = 0.06 + 0.04 * clamp(speedP, 0.0, 1.0);
    vec3 col = imgLod(p * 0.3 + 0.5, 5.0) * 0.1;
    for (int ph = 0; ph < 2; ++ph) {
        float f = fract(sceneTime / life + 0.5 * float(ph) + 0.02 * audioAdvance);
        float w = 1.0 - abs(2.0 * f - 1.0);
        vec2 x0 = p;
        for (int s = 0; s < 3; ++s) x0 -= stLin(stView(x0, 1.0)).xy * run * f / 3.0;   // back along the heading field
        vec2 g = x0 / spacing + float(ph) * 0.43;
        vec2 cell = floor(g);
        float best = 1e9;
        vec2 bestC = cell;
        for (int jj = -1; jj <= 1; ++jj) for (int ii = -1; ii <= 1; ++ii) {
            vec2 cc = cell + vec2(float(ii), float(jj));
            vec2 c = cc + 0.5 + 0.35 * (hash22(cc + float(ph) * 7.1) - 0.5);
            float d = length(g - c) * spacing;
            if (d < best) { best = d; bestC = cc; }
        }
        vec2 hd = stLin(stView(p, 1.0)).xy;
        float hue = atan(hd.y, hd.x) / 6.2831853;
        vec3 tone = imgPalette(hue + 0.03 * audioPhase);
        vec3 photo = imgLod((bestC + 0.5) * spacing * 0.55 + 0.5, 1.0);
        vec3 c = mix(tone * 1.4, photo * 1.5, 0.35 + 0.5 * clamp(photoP, 0.0, 1.0)) * (0.6 + 0.6 * length(hd))
                 * (1.0 + 0.4 * clamp(audioKick, 0.0, 1.0));
        col = mix(col, c, smoothstep(rad, rad * 0.5, best) * w);
    }
    finish(col);
}
