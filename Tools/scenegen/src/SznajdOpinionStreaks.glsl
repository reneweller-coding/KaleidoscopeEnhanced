//@doc
 * @brief SZNAJD OPINION STREAKS: the Sznajd model: two cells of the same opinion convince their neighbours; fronts form and spread in streaks.  The photo sets the first opinion (light or dark); every cell looks at the four pairs of cells that touch it (left, right, up, down), and if any pair agrees it takes
 * their opinion, so the streaks run along the pairs' direction.  The photo's colours show in the light opinion, its dark in the other.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance -> the rate: the stepping pace and the drift of the colours (integrated)
 *   audioSwell   -> the chance of taking the opinion of an agreeing pair
 *
 * Knobs: scaleP (cell size), hueP.
//@params scaleP
//@audio audioSwell audioAdvance
//@state 320 180 30 32
//@body
vec3 phAt(vec2 c, float lod) { return imgLod((c - 0.5 * stateRes) / stateRes.y * 0.8 + 0.5, lod); }
vec4 stateStep()
{
    ivec2 ip = stCell();
    if (stateFrame < 0.5) {
        float l = luma(phAt(vec2(ip) + 0.5, 1.2));
        return vec4(l + 0.25 * (stRand(0) - 0.5) > 0.5 ? 1.0 : 0.0, 0.0, 0.0, 1.0);
    }
    vec4 c = stAt(ip);
    float pf = 0.0004 + 0.0016 * clamp(audioSwell, 0.0, 1.0);
    for (int dy = -1; dy <= 1; ++dy)
        for (int dx = -1; dx <= 1; ++dx)
            if (hash21(vec2(ip + ivec2(dx, dy)) + vec2(stateFrame * 7.31, stateFrame * 1.77)) < pf) return vec4(1.0 - c.r, 0.0, 0.0, 1.0);
    float p = 0.25 + 0.5 * clamp(audioSwell, 0.0, 1.0);
    if (stRand(2) > p) return c;
    int start = int(stRand(0) * 4.0);
    for (int k = 0; k < 4; ++k) {
        int d = (start + k) & 3;
        ivec2 o = d == 0 ? ivec2(1, 0) : (d == 1 ? ivec2(-1, 0) : (d == 2 ? ivec2(0, 1) : ivec2(0, -1)));
        float a = stAt(ip + o).r;
        float b = stAt(ip + 2 * o).r;
        if (abs(a - b) < 0.5) return vec4(a, 0.0, 0.0, 1.0);
    }
    return c;
}
void main()
{
    if (statePass == 1) { fragColor = stateStep(); return; }
    vec2 p = screenP();
    float zoom = 1.0 - 0.45 * clamp(scaleP, 0.0, 1.0);
    vec2 cc = stView(p, zoom);
    vec4 s = texelFetch(texState, stWrap(ivec2(floor(cc))), 0);
    vec3 ph = phAt(cc, 0.8);
    vec3 lightc = ph * 1.25;
    vec3 darkc = vec3(luma(ph)) * vec3(0.4, 0.5, 0.75) * 0.7 + imgPalette(fract(0.4 + 0.01 * audioAdvance)) * 0.12;
    finish(mix(darkc, lightc, s.r));
}
