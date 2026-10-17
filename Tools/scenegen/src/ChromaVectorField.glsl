//@doc
 * @brief CHROMA VECTOR FIELD: the twelve pitch classes as twelve springs of a flow that carries the photo -- they sit
 * round a circle in the order of fifths, each pouring out as strongly as its note sounds and swirling a little, so
 * the photo streams away from the notes being played and gathers where the silent ones sit.  The circle repeats
 * across the frame, mirrored, so the whole picture flows; the photo is carried in two phases that take over from
 * each other unseen.
 *
 * Audio Reactivity (structure, not only light):
 *   audioChroma     -> each pitch class's spring (twelve, smoothed on the state pass)
 *   audioPhase      -> the circle turns (integrated)
 *   audioKick       -> the springs flash (light)
 *
 * Knobs: strengthP (the springs' strength), swirlP (how much they swirl), photoP (photo share), hueP.
//@params strengthP swirlP photoP
//@audio audioChroma[12] audioKick
//@state 12 1 60
//@body
/**  The state pass: each pitch class smoothed over about a second, so the flow does not flicker.
 *
 * @return
 *   The smoothed chroma value, 0, 0, 1.
 **/
vec4 stateStep()
{
    int i = int(gl_FragCoord.x);
    float c = clamp(audioChroma[i], 0.0, 1.0);
    if (stateFrame < 0.5) return vec4(c, 0.0, 0.0, 1.0);
    return vec4(mix(texelFetch(texState, ivec2(i, 0), 0).r, c, 0.02), 0.0, 0.0, 1.0);
}

/**  The flow of the twelve springs at a point (one cell of the mirrored repetition).
 *
 * @param x    The point. (in)
 * @param str  The springs' strength. (in)
 * @param sw   The swirl. (in)
 * @param rot  The circle's turn. (in)
 *
 * @return
 *   The velocity.
 **/
vec2 chromaFlow(vec2 x, float str, float sw, float rot)
{
    vec2 q = abs(mod(x + 0.5, 2.0) - 1.0) - 0.5;               // mirrored cells, a circle in each
    vec2 u = vec2(0.0);
    for (int i = 0; i < 12; ++i) {
        float a = 6.2831853 * float((i * 7) % 12) / 12.0 + rot;  // the circle of fifths
        vec2 c = 0.32 * vec2(cos(a), sin(a));
        vec2 d = q - c;
        float r2 = dot(d, d) + 0.004;
        float s = texelFetch(texState, ivec2(i, 0), 0).r - 0.35;   // sounding notes pour out, silent ones draw in
        u += s * (d + sw * vec2(-d.y, d.x)) / r2;
    }
    return u * str * 0.012;
}

void main()
{
    if (statePass == 1) { fragColor = stateStep(); return; }
    vec2 p = screenP();
    float str = 0.6 + 1.2 * clamp(strengthP, 0.0, 1.0);
    float sw = 0.2 + 0.8 * clamp(swirlP, 0.0, 1.0);
    float rot = 0.02 * audioPhase;
    vec2 x = p * 1.4;
    float T = 0.12 * sceneTime;
    vec3 col = vec3(0.0);
    for (int ph = 0; ph < 2; ++ph) {
        float f = fract(T + 0.5 * float(ph));
        float w = 1.0 - abs(2.0 * f - 1.0);
        vec2 y = x;
        for (int s = 0; s < 6; ++s) y -= chromaFlow(y, str, sw, rot) * f * 2.0;
        col += w * imgLod(y / 1.4 * 0.9 + 0.5, 0.5);
    }
    // the springs themselves, faintly
    vec2 q = abs(mod(x + 0.5, 2.0) - 1.0) - 0.5;
    vec3 tone = imgPalette(0.03 * audioPhase);
    for (int i = 0; i < 12; ++i) {
        float a = 6.2831853 * float((i * 7) % 12) / 12.0 + rot;
        float d = length(q - 0.32 * vec2(cos(a), sin(a)));
        col += imgPalette(float(i) / 12.0 + 0.03 * audioPhase) * exp(-d * d / 0.0006) * clamp(audioChroma[i], 0.0, 1.0)
               * (0.4 + 0.6 * clamp(audioKick, 0.0, 1.0)) * 0.6;
    }
    col = mix(col * tone * 1.6, col, 0.6 + 0.4 * clamp(photoP, 0.0, 1.0));
    finish(col * 1.05);
}
