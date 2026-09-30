//@doc
 * @brief HARTUNG SCRATCHES: Hans Hartung's late scratched paintings -- a
 * field of luminous colour (from the photograph) covered by a dark layer
 * into which sheaves of fine lines have been scratched, fanning out like
 * grass or thrown straws, each scratch revealing the bright colour
 * beneath; new sheaves are scratched while old ones slowly close over.
 * Endless, mirrorable.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the scratching (integrated, jump-free)
 *   audioSpread     -> how wide the sheaves fan out
 *   audioKick       -> the revealed colour flares (light)
 *   audioMode       -> the top layer: blue-black in minor, brown-black in major
 *   audioRoughness  -> the scratches get wilder
 *   audioSwell      -> the colour beneath glows (slow)
 *
 * Knobs: sheafP (sheaves), lineP (lines per sheaf), lengthP (scratch length), hueP.
//@params sheafP lineP lengthP
//@audio audioSpread audioKick audioMode audioRoughness audioSwell
//@body
void main()
{
    vec2 p = screenP();
    float kick = clamp(audioKick, 0.0, 1.0);
    float swell = clamp(audioSwell, 0.0, 1.0);
    float mode = clamp(audioMode, 0.0, 1.0);
    float rough = clamp(audioRoughness, 0.0, 1.0);
    vec2 uv = p * 0.4 + 0.5;
    vec3 under = imgLod(uv, 3.0);
    under = glowColour(under, p, hueP * 0.159) * (0.6 + 0.5 * luma(under)) * (0.8 + 0.5 * swell);
    vec3 top = mix(vec3(0.02, 0.03, 0.07), vec3(0.07, 0.04, 0.03), mode);
    top *= 0.8 + 0.4 * fbm3(p * 3.0);
    float T = 0.04 * sceneTime + 0.3 * audioAdvance;
    float scratch = 0.0;
    float S = 1.3 + 1.2 * clamp(sheafP, 0.0, 1.0);
    vec2 g = p * S;
    vec2 gi = floor(g);
    for (int j = -1; j <= 1; ++j) for (int i = -1; i <= 1; ++i) {
        vec2 id = gi + vec2(i, j);
        float h = hash21(id);
        float cyc = T * (0.5 + 0.5 * h) + h * 4.0;
        float life = fract(cyc);
        float gen = floor(cyc);
        if (hash21(id + gen * 3.1) > 0.7) continue;
        // A sheaf: lines fanning from a root point.
        vec2 root = id + vec2(0.2 + 0.6 * hash21(id + gen), 0.1 + 0.3 * hash21(id + gen + 2.0));
        float baseA = 1.5708 + (hash21(id + gen + 5.0) - 0.5) * 1.2;
        float fan = 0.3 + 0.9 * clamp(audioSpread, 0.0, 1.0);
        float nL = 8.0 + 16.0 * clamp(lineP, 0.0, 1.0);
        vec2 d = g - root;
        float r = length(d);
        float a = atan(d.y, d.x) - baseA;
        float L = (0.5 + 0.7 * clamp(lengthP, 0.0, 1.0)) * (0.6 + 0.4 * hash21(id + gen + 7.0));
        float grow = smoothstep(0.0, 0.2, life);
        // Nearest line in the fan (angles jittered per line).
        float la = (a / fan + 0.5) * nL;
        float li = floor(la);
        if (li < 0.0 || li >= nL) continue;
        float jit = (hash21(vec2(li, h + gen)) - 0.5) * 0.8 * (0.5 + rough);
        float lineA = ((li + 0.5 + jit) / nL - 0.5) * fan;
        float llen = L * (0.5 + 0.5 * hash21(vec2(h + gen, li)));
        float dist = abs(sin(a - lineA)) * r;
        float w = 0.004 * (1.0 - 0.7 * r / max(llen, 1e-3));
        float on = smoothstep(w + 0.003, w, dist) * step(r, llen * grow) * step(0.0, cos(a - lineA));
        float fade = smoothstep(1.0, 0.75, life);
        scratch = max(scratch, on * fade);
    }
    vec3 col = mix(top, under * (1.0 + 0.7 * kick), scratch);
    finish(col);
}
