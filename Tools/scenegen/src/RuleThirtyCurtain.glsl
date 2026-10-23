//@doc
 * @brief RULE THIRTY CURTAIN: the automaton rule 30, started from a row of the photo's brightness: chaotic triangles fall as a curtain, and the photo colours their cells; the rule changes continuously between 30, 90 and 110 by mixing the look-up tables.  The newest row is at the top and the older rows move
 * down one row per step, so the curtain hangs full of its own history.
 *
 * Audio Reactivity (structure, not only light):
 *   audioHarmAdvance -> the mixture of the rules 30, 90 and 110 (integrated)
 *   audioSwell       -> the pace (quiet music skips rows)
 *
 * Knobs: scaleP (cell size), hueP.
//@params scaleP
//@audio audioSwell audioHarmAdvance
//@state 480 270 44 32
//@body
vec3 phAt(vec2 c, float lod) { return imgLod((c - 0.5 * stateRes) / stateRes.y * 0.8 + 0.5, lod); }
float ruleBit(int rule, int idx) { return float((rule >> idx) & 1); }
vec4 stateStep()
{
    ivec2 ip = stCell();
    int H = int(stateRes.y);
    if (stateFrame < 0.5) {
        float l = luma(phAt(vec2(ip) + 0.5, 1.0));
        return vec4(ip.y == H - 1 && l > 0.5 ? 1.0 : 0.0, 0.0, 0.0, 1.0);
    }
    if (stRandStep(0) > 0.55 + 0.45 * clamp(audioSwell, 0.0, 1.0)) return stAt(ip);
    if (ip.y < H - 1) return stAt(ip + ivec2(0, 1));
    float l = stAt(ip + ivec2(-1, 0)).r;
    float c = stAt(ip).r;
    float r = stAt(ip + ivec2(1, 0)).r;
    int idx = int(step(0.5, l)) * 4 + int(step(0.5, c)) * 2 + int(step(0.5, r));
    float ph = 0.04 * audioHarmAdvance + 0.01 * stateFrame * 0.0;
    float i0 = floor(ph);
    float f = smoothstep(0.0, 1.0, fract(ph));
    vec3 w = vec3(0.0);
    int a = int(mod(i0, 3.0));
    int b = int(mod(i0 + 1.0, 3.0));
    w[a] += 1.0 - f;
    w[b] += f;
    float nv = w.x * ruleBit(30, idx) + w.y * ruleBit(90, idx) + w.z * ruleBit(110, idx);
    if (stRand(1) < 0.0005) nv = 1.0 - nv;
    return vec4(nv, 0.0, 0.0, 1.0);
}
void main()
{
    if (statePass == 1) { fragColor = stateStep(); return; }
    vec2 p = screenP();
    float zoom = 1.0 - 0.5 * clamp(scaleP, 0.0, 1.0);
    vec2 cc = stView(p, zoom);
    vec4 s = texelFetch(texState, stWrap(ivec2(floor(cc))), 0);
    vec3 ph = phAt(cc, 0.8);
    float fall = smoothstep(0.0, 0.8, 1.0 - cc.y / stateRes.y);
    vec3 col = ph * (0.06 + 1.15 * s.r * (0.75 + 0.35 * fall));
    finish(col);
}
