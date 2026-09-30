//@doc
 * @brief TEXTURE IRON FILINGS: iron filings on paper over moving magnets --
 * thousands of tiny dark needles lie on the photograph (printed on the
 * paper) and align themselves with the magnetic field: they trace the
 * field lines between the poles in arcs and spirals, bunch up densely at
 * the poles, and as the hidden magnets glide and turn beneath the paper
 * the whole pattern slowly re-forms.  The poles glow faintly.  Endless,
 * mirrorable.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the magnets glide (integrated, jump-free)
 *   audioPhase      -> the magnets turn (integrated)
 *   audioSpread     -> the field reaches further (more filings aligned)
 *   audioKick       -> the poles glow (light)
 *   audioMode       -> the paper: cool grey in minor, warm cream in major
 *   audioRoughness  -> the filings jitter
 *
 * Knobs: densityP (filings), lengthP (needle length), photoP (the printed photo), hueP.
//@params densityP lengthP photoP
//@audio audioPhase audioSpread audioKick audioMode audioRoughness
//@body
vec2 gPos[4]; vec2 gDir[4];
// 2D dipole field (line poles), and its stream function: the field lines
// are its isolines, so filings can gather along them.
vec2 field(vec2 x, out float psi)
{
    vec2 B = vec2(0.0);
    psi = 0.0;
    for (int i = 0; i < 4; ++i) {
        vec2 n = gPos[i] + gDir[i] * 0.08, s = gPos[i] - gDir[i] * 0.08;
        vec2 dn = x - n, ds = x - s;
        B += dn / (dot(dn, dn) + 0.0005) - ds / (dot(ds, ds) + 0.0005);
        psi += atan(dn.y, dn.x) - atan(ds.y, ds.x);
    }
    return B;
}

void main()
{
    vec2 p = screenP();
    float kick = clamp(audioKick, 0.0, 1.0);
    float rough = clamp(audioRoughness, 0.0, 1.0);
    float T = 0.02 * sceneTime + 0.15 * audioAdvance;
    float spin = 0.03 * sceneTime + 0.3 * audioPhase;
    for (int i = 0; i < 4; ++i) {
        float fi = float(i);
        gPos[i] = 0.55 * vec2(sin(T * (0.7 + 0.2 * fi) + fi * 1.9), 0.6 * cos(T * (0.5 + 0.25 * fi) + fi * 2.7));
        float ang = spin * (mod(fi, 2.0) < 0.5 ? 1.0 : -1.3) + fi * 1.3;
        gDir[i] = vec2(cos(ang), sin(ang));
    }
    float mode = clamp(audioMode, 0.0, 1.0);
    vec2 uv = p * 0.7 + 0.5;
    vec3 paper = mix(vec3(0.78, 0.8, 0.83), vec3(0.92, 0.87, 0.76), mode);
    paper = mix(paper, paper * (0.55 + 0.6 * imgLod(uv, 1.5)), 0.6 * clamp(photoP, 0.0, 1.0));
    paper *= 0.95 + 0.05 * noise2(p * 300.0);
    vec3 col = paper;
    // Filings: short needles in jittered cells, oriented along the field.
    float dens = 0.45 + 0.5 * clamp(densityP, 0.0, 1.0);
    float reach = 0.4 + 0.8 * clamp(audioSpread, 0.0, 1.0);
    float ink = 0.0;
    for (int L = 0; L < 2; ++L) {
        float fl = float(L);
        float S = 70.0 + 40.0 * fl;
        vec2 g = p * S + fl * 7.3;
        vec2 gi = floor(g);
        for (int j = -1; j <= 1; ++j) for (int i = -1; i <= 1; ++i) {
            vec2 id = gi + vec2(i, j);
            vec2 c = id + 0.2 + 0.6 * hash22(id + fl);
            vec2 cw = (c - fl * 7.3) / S;
            float psi;
            vec2 B = field(cw, psi);
            float bm = length(B);
            // Filings gather where the field is strong, and along field lines.
            float gather = smoothstep(0.5, 12.0 * (1.2 - 0.6 * reach), bm);
            float line = 0.5 + 0.5 * cos(psi * 6.0);                   // integer multiple: continuous across the atan cuts
            if (hash21(id + 3.0 + fl) > dens * (0.2 + 0.8 * gather) * (0.3 + 0.9 * line)) continue;
            vec2 dir = B / max(bm, 1e-4);
            float jit = (hash21(id + 5.0) - 0.5) * (0.15 + 0.8 * rough) * (1.0 - 0.8 * gather);
            dir = rot2(jit) * dir;
            float len = (0.35 + 0.6 * clamp(lengthP, 0.0, 1.0)) * (0.6 + 0.5 * hash21(id + 7.0));
            float d = sdSeg(g, c - dir * len * 0.5, c + dir * len * 0.5);
            ink = max(ink, smoothstep(0.1, 0.03, d) * (0.6 + 0.4 * gather));
        }
    }
    col *= 1.0 - 0.85 * ink;
    // The poles glow faintly through the paper.
    vec3 gc = glowColour(imgLod(uv, 5.0), p, hueP * 0.159);
    for (int i = 0; i < 4; ++i) {
        float d1 = length(p - gPos[i] - gDir[i] * 0.08), d2 = length(p - gPos[i] + gDir[i] * 0.08);
        col += gc * (exp(-d1 * 25.0) + exp(-d2 * 25.0)) * (0.05 + 0.4 * kick);
    }
    finish(col);
}
