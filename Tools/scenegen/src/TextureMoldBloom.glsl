//@doc
 * @brief TEXTURE MOLD BLOOM: colonies of mould and lichen spreading over the
 * photograph like over an old print -- round colonies grow outward in
 * rings of different colour (a dense centre, a fuzzy hyphal margin,
 * spore-darkened zones), meet each other and stop at sharp borders,
 * velvety in texture; old colonies fade back into the picture while new
 * ones sprout.  Oddly beautiful, like a petri dish of art.  Endless,
 * mirrorable.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the colonies grow (integrated, jump-free)
 *   audioSpread     -> colony size
 *   audioMode       -> palette: blue-green-grey in minor, ochre-orange-pink in major (tint)
 *   audioRoughness  -> the margins get fuzzier
 *   audioKick       -> the margins glow (light)
 *   audioSwell      -> how much of the picture shows through (slow)
 *
 * Knobs: colonyP (colony density), ringP (ring zones), fuzzP (margin fuzz), hueP.
//@params colonyP ringP fuzzP
//@audio audioSpread audioMode audioRoughness audioKick audioSwell
//@body
void main()
{
    vec2 p = screenP();
    float kick = clamp(audioKick, 0.0, 1.0);
    float swell = clamp(audioSwell, 0.0, 1.0);
    float mode = clamp(audioMode, 0.0, 1.0);
    float rough = clamp(audioRoughness, 0.0, 1.0);
    vec2 uv = p * 0.6 + 0.5;
    vec3 ph = imgLod(uv, 0.8);
    float S = 2.0 + 2.5 * clamp(colonyP, 0.0, 1.0);
    vec2 g = p * S;
    vec2 gi = floor(g);
    float T = 0.04 * sceneTime + 0.3 * audioAdvance;
    // The colony that reaches this point first wins (additively weighted Voronoi
    // by radius); growth follows each colony's own life cycle.
    float best = 1e3, second = 1e3; vec2 bid = vec2(0.0); float bR = 0.0, bd = 0.0, bAge = 0.0;
    float fuzz = (0.02 + 0.06 * clamp(fuzzP, 0.0, 1.0)) * (0.6 + 0.8 * rough);
    for (int j = -1; j <= 1; ++j) for (int i = -1; i <= 1; ++i) {
        vec2 id = gi + vec2(i, j);
        float h = hash21(id);
        float cyc = T * (0.6 + 0.6 * h) + h * 4.0;
        float age = fract(cyc);
        float gen = floor(cyc);
        vec2 c = id + 0.2 + 0.6 * hash22(id + gen * 1.37);
        float R = (0.25 + 0.5 * age) * (0.7 + 0.5 * clamp(audioSpread, 0.0, 1.0)) * smoothstep(0.0, 0.1, age);
        vec2 dv = g - c;
        float ang = atan(dv.y, dv.x);
        vec2 u = vec2(cos(ang), sin(ang));
        float d = length(dv) * (1.0 + fuzz * 3.0 * (noise2(u * 8.0 + h * 20.0) - 0.5)) - R;
        if (d < best) { second = best; best = d; bid = id + gen * 0.013; bR = R; bd = length(dv); bAge = age; }
        else if (d < second) second = d;
    }
    vec3 col = ph;
    if (best < 0.0) {
        float h = hash21(bid);
        float t = bd / max(bR, 1e-3);                          // 0 centre .. 1 margin
        float nZ = 2.0 + 3.0 * clamp(ringP, 0.0, 1.0);
        float zone = 0.5 + 0.5 * cos(t * nZ * 6.2831853 - T * 3.0);
        vec3 cool[3]; vec3 warm[3];
        cool[0] = vec3(0.35, 0.55, 0.5); cool[1] = vec3(0.2, 0.3, 0.35); cool[2] = vec3(0.7, 0.8, 0.75);
        warm[0] = vec3(0.85, 0.6, 0.3); warm[1] = vec3(0.9, 0.45, 0.45); warm[2] = vec3(0.95, 0.85, 0.6);
        int k = int(floor(h * 3.0));
        vec3 a = cool[0], b = warm[0];
        if (k == 1) { a = cool[1]; b = warm[1]; } else if (k == 2) { a = cool[2]; b = warm[2]; }
        vec3 cc = mix(a, b, mode);
        cc = mix(cc, glowColour(ph, bid, hueP * 0.159), 0.2);
        vec3 colony = mix(cc, cc * 0.6, zone * 0.6);
        colony *= 0.85 + 0.15 * noise2(g * 40.0);             // velvety
        // Fuzzy bright margin.
        float margin = smoothstep(-fuzz * 2.0, 0.0, best);
        colony = mix(colony, mix(cc, vec3(1.0), 0.5), margin * 0.6);
        colony += cc * margin * kick * 0.6;
        // Old colonies fade back into the picture.
        float fade = smoothstep(1.0, 0.7, bAge);
        float show = (0.5 + 0.3 * swell);
        col = mix(ph, mix(colony, colony * (0.6 + 0.6 * luma(ph)), show), fade * smoothstep(0.0, -fuzz, best));
        // Sharp dark border where two colonies meet.
        col *= 1.0 - 0.5 * exp(-(second - best) / 0.02) * step(second, 0.0);
    }
    finish(col);
}
