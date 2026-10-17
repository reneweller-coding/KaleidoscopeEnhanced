//@doc
 * @brief MAGMA CONVECTION TOP: a magma chamber seen from above -- a crust broken into plates by the convection beneath,
 * each plate a cooling slab drifting away from the hot upwellings, glowing cracks where the plates pull apart and
 * fresh melt wells up, darker crust toward the plates' cold middles.  The plates jostle, the cracks open and seal;
 * the bass drives the convection, so heavy passages stir the crust faster.  The photo tints the glowing melt.
 *
 * Audio Reactivity (structure, not only light):
 *   audioBass       -> the convection's speed (integrated on the state pass: the plates never jump)
 *   audioSwell      -> the melt glows hotter
 *   audioKick       -> the cracks flare (light)
 *
 * Knobs: platesP (how many plates), crackP (the cracks' width), photoP (photo share), hueP.
//@params platesP crackP photoP
//@audio audioBass audioSwell audioKick
//@state 1 1 60
//@body
/**  The state pass: the convection's clock, advancing faster with the bass.
 *
 * @return
 *   The clock (r), 0, 0, 1.
 **/
vec4 stateStep()
{
    if (stateFrame < 0.5) return vec4(0.0, 0.0, 0.0, 1.0);
    float c = texelFetch(texState, ivec2(0, 0), 0).r;
    return vec4(c + (0.2 + 1.0 * clamp(audioBass, 0.0, 1.0)) / 60.0, 0.0, 0.0, 1.0);
}

void main()
{
    if (statePass == 1) { fragColor = stateStep(); return; }
    vec2 p = screenP();
    float clock = texelFetch(texState, ivec2(0, 0), 0).r;
    float sz = 0.16 - 0.07 * clamp(platesP, 0.0, 1.0);
    vec2 x = p / sz;
    // the plates: Worley cells whose centres drift outward from slow upwellings (a warp that moves with the clock)
    vec2 warp = vec2(fbm(x * 0.35 + vec2(0.1 * clock, 0.0)), fbm(x * 0.35 + vec2(3.7, -0.08 * clock))) - 0.5;
    vec2 q = x + warp * 1.2;
    vec2 c = floor(q);
    float d1 = 1e9, d2 = 1e9;
    vec2 best = vec2(0.0);
    for (int j = -1; j <= 1; ++j) for (int i = -1; i <= 1; ++i) {
        vec2 cc = c + vec2(float(i), float(j));
        vec2 h = hash22(cc);
        vec2 o = 0.5 + 0.35 * vec2(sin(clock * 0.5 + 6.2831853 * h.x), cos(clock * 0.4 + 6.2831853 * h.y));
        float d = length(q - cc - o);
        if (d < d1) { d2 = d1; d1 = d; best = cc; } else if (d < d2) d2 = d;
    }
    float crack = d2 - d1;
    float cw = 0.05 + 0.12 * clamp(crackP, 0.0, 1.0);
    float melt = smoothstep(cw, 0.0, crack);
    float heat = 0.6 + 0.6 * clamp(audioSwell, 0.0, 1.0);
    vec3 photo = imgLod(p * 0.5 + 0.5, 2.5);
    vec3 glow = mix(vec3(1.0, 0.45, 0.1), photo * 1.6, 0.25 + 0.4 * clamp(photoP, 0.0, 1.0)) * heat;
    // the crust: cooler (darker) toward the plate's middle, with a cracked skin
    float cool = smoothstep(0.0, 0.5, d2 - d1) * (0.6 + 0.4 * smoothstep(0.6, 0.0, d1));
    vec3 tone = imgPalette(hash21(best) * 0.3 + 0.03 * audioPhase);
    vec3 crust = mix(vec3(0.08, 0.05, 0.04), tone * 0.35, 0.4) * (0.6 + 0.6 * fbm(q * 4.0 + best));
    crust += glow * 0.25 * (1.0 - cool) * (0.6 + 0.4 * fbm(q * 8.0));
    vec3 col = mix(crust, glow * (1.0 + 0.6 * clamp(audioKick, 0.0, 1.0)), melt);
    finish(col);
}
