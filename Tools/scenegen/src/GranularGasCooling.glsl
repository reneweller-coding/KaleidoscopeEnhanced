//@doc
 * @brief GRANULAR GAS COOLING: a gas of grains that lose a little energy at every collision -- an inelastic granular
 * gas -- collapsing into clusters: where it is a little denser it collides more, cools faster, its pressure drops
 * and more grains flow in.  On the state pass that instability is a density drawn toward its own blurred image (the
 * same runaway as chemotactic collapse), held back by a pressure where the grains pack tight and spread again by the
 * gas's warmth; round grains are scattered by the density and quiver with the flow.  Elastic, loud passages melt the
 * clusters; inelastic, quiet ones let them form and merge.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell      -> the restitution: loud passages make the collisions elastic, the clusters melt
 *   audioAdvance    -> the grains' jitter (integrated)
 *   audioKick       -> the grains flash (light)
 *
 * Knobs: lossP (the base loss), stirP (the stirring), photoP (photo share), hueP.
//@params lossP stirP photoP
//@audio audioSwell audioKick
//@state 192 108 120
//@body
/**  One step of the clustering gas (the state pass): the density flows up the gradient of its own blurred image,
 * against a packing pressure, and spreads by the gas's warmth; the blurred image follows the density.
 *
 * @return
 *   The flux's size (r), 0, the density (b), its blurred image (a).
 **/
vec4 stateStep()
{
    ivec2 ip = stCell();
    if (stateFrame < 0.5) { float r0 = 1.0 + 0.3 * (stRand(0) - 0.5); return vec4(0.0, 0.0, r0, r0); }
    vec4 s = stAt(ip);
    vec4 n[4];
    n[0] = stAt(ip + ivec2(1, 0)); n[1] = stAt(ip - ivec2(1, 0)); n[2] = stAt(ip + ivec2(0, 1)); n[3] = stAt(ip - ivec2(0, 1));
    float e = clamp(0.35 + 0.6 * clamp(audioSwell, 0.0, 1.0) - 0.3 * clamp(lossP, 0.0, 1.0), 0.0, 1.0);
    float warm = 0.02 + 0.12 * e;                               // elastic collisions keep the gas warm and spread
    float drawIn = 0.3 * (1.0 - e) + 0.04;                      // inelastic ones let it fall in on itself
    float rho = s.b, flux = 0.0, lapR = 0.0, lapC = 0.0;
    for (int k = 0; k < 4; ++k) {
        float rm = 0.5 * (rho + n[k].b);
        float pack = max(1.0 - rm / 3.0, 0.0);                  // a packing pressure: no more than about three
        float f = drawIn * rm * pack * (n[k].a - s.a);
        flux -= f;
        lapR += n[k].b - rho;
        lapC += n[k].a - s.a;
    }
    float stir = 0.01 + 0.03 * clamp(stirP, 0.0, 1.0);
    float rho2 = rho + flux + warm * lapR + stir * (stRand(1) - 0.5);
    float c2 = s.a + 0.2 * lapC + 0.08 * (rho - s.a);
    return vec4(abs(flux) * 20.0, 0.0, clamp(rho2, 0.0, 4.0), c2);
}

void main()
{
    if (statePass == 1) { fragColor = stateStep(); return; }
    vec2 p = screenP();
    float sp = 0.016;
    vec2 cell = floor(p / sp);
    float tw = 0.5 * sceneTime + 1.2 * audioAdvance;
    vec3 tone = imgPalette(0.25 + 0.03 * audioPhase);
    vec3 col = imgLod(p * 0.3 + 0.5, 5.0) * 0.08;
    for (int j = -1; j <= 1; ++j) for (int i = -1; i <= 1; ++i) {
        vec2 cc = cell + vec2(float(i), float(j));
        vec2 site = (cc + 0.5 + 0.7 * (hash22(cc + 5.1) - 0.5)) * sp;
        vec4 s = stLin(stView(site, 1.0));
        vec2 h = hash22(cc);
        float exist = smoothstep(h.x * 2.0 - 0.1, h.x * 2.0 + 0.1, s.b);   // the denser, the more grains
        if (exist < 0.001) continue;
        float jit = 0.3 * sp * min(s.r + 0.2, 1.0);
        vec2 pos = site + jit * vec2(sin(tw * (1.0 + h.y) + 6.28 * h.x), cos(tw * (0.8 + h.x) + 6.28 * h.y));
        float d = length(p - pos), r = sp * 0.38;
        float dg = smoothstep(r, r * 0.45, d) * exist;
        if (dg > 0.001) {
            vec3 photo = imgLod(site * 0.55 + 0.5, 1.0);
            vec3 cg = mix(tone * 1.3, photo * 1.6, 0.5 + 0.45 * clamp(photoP, 0.0, 1.0))
                      * (0.6 + 0.25 * min(s.b, 2.0)) * (1.0 + 0.4 * clamp(audioKick, 0.0, 1.0));
            col = mix(col, cg, dg);
        }
    }
    finish(col * 1.4);
}
