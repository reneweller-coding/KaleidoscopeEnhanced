//@doc
 * @brief LIQUID LIGHT SHOW: the 1960s overhead-projector light show -- two
 * clock glasses with coloured water, oil and dyes pressed together on a
 * projector, the light artist rocking and squeezing them, so on the wall
 * the colours bloom, burst and chase each other: dye blossoms swelling
 * outward in rings, oil cells pushing through them, drops of one colour
 * blooming inside another, everything magnified, glowing, with dark
 * outlines where the liquids meet.  The colours come from the photograph
 * where it has colour.  The projected disc fills the wall edge to edge and
 * the pressing never stops.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the pressing and rocking (integrated, jump-free)
 *   audioHarmChange -> a fresh bloom opens on chord changes (smoothed, never a cut)
 *   audioSpread     -> bloom size (wide spectrum = many small blossoms)
 *   audioRoughness  -> the outlines wobble
 *   audioBass       -> the lamp's brightness (light)
 *   audioSwell      -> saturation of the dyes (slow)
 *
 * Knobs: bloomsP (how many blossoms), oilP (share of oil cells), ringP
 * (ring structure inside the blooms), hueP.
//@params bloomsP oilP ringP
//@audio audioHarmChange audioSpread audioRoughness audioBass audioSwell
//@body
float gT;

void main()
{
    vec2 p = screenP();
    float swell = clamp(audioSwell, 0.0, 1.0);
    float bass = clamp(audioBass, 0.0, 1.0);
    float rough = clamp(audioRoughness, 0.0, 1.0);
    gT = 0.12 * sceneTime + 1.0 * audioAdvance;

    // The rocking of the glasses: a slow swirl of the whole liquid.
    vec2 q = p * 1.4;
    float sw = 0.35 * sin(gT * 0.7) + 0.2 * sin(gT * 0.43 + 1.0);
    q = rot2(sw * exp(-dot(q, q) * 0.3)) * q;
    q += 0.08 * vec2(fbm3(q * 1.2 + gT * 0.3), fbm3(q * 1.2 + 5.0 - gT * 0.3));

    // Blossoms: dye drops expanding from seeds that wander; each blossom is a
    // set of rings; later (inner) rings overlay earlier ones.
    int nB = 6 + int(clamp(bloomsP, 0.0, 1.0) * 3.99);
    float scale = 0.9 - 0.4 * clamp(audioSpread, 0.0, 1.0);
    vec3 photoC = imgLod(vec2(0.5) + 0.25 * vec2(sin(gT * 0.2), cos(gT * 0.17)), 6.0);
    float h0 = (satOf(photoC) > 0.2) ? hue_of(photoC) : hueP * 0.159;
    // The background liquid: itself a mix of dyes, swirling slowly.
    float bgN = fbm(q * 0.9 + vec2(gT * 0.2, -gT * 0.15));
    vec3 col = hsv2rgb(vec3(fract(h0 + 0.5 + 0.35 * bgN), 0.85, 0.55 + 0.35 * bgN));
    float outline = 0.0;
    for (int k = 0; k < 9; ++k) {
        if (k >= nB) break;
        float fk = float(k);
        // Each blossom has a life cycle (grows, then is pushed aside); staggered.
        float life = fract(gT * 0.08 + fk / float(nB) + 0.13 * clamp(audioHarmChange, 0.0, 1.0));
        vec2 c = vec2(sin(fk * 2.4 + gT * 0.1), cos(fk * 1.7 - gT * 0.13)) * 0.9;
        float R = scale * (0.2 + 1.2 * life) * (0.7 + 0.5 * hash11(fk));
        vec2 d = q - c;
        float ang = atan(d.y, d.x);
        float r0 = length(d) / R;
        float wob = 0.06 * (noise2(vec2(cos(ang), sin(ang)) * 2.0 + fk + gT) - 0.5) * (1.0 + 2.0 * rough) * smoothstep(0.2, 0.8, r0);
        float r = r0 + wob;
        float inside = smoothstep(1.02, 0.98, r);
        // Rings: the dye thins toward the rim and bands into rings.
        float rings = 0.6 + 0.4 * cos(r * (6.0 + 10.0 * clamp(ringP, 0.0, 1.0)) - gT * 2.0);
        vec3 dye = hsv2rgb(vec3(fract(h0 + fk * 0.19 + 0.07 * r), 0.9, 1.0));
        vec3 bc = dye * (0.35 + 0.75 * rings) * (1.2 - 0.5 * r);
        // Fading in at birth and out at the end of life (never a pop).
        float a = inside * smoothstep(0.0, 0.08, life) * smoothstep(1.0, 0.85, life);
        col = mix(col, mix(col, bc, 0.7) * (1.0 + 0.3 * rings), a);
        outline = max(outline, exp(-pow((r - 1.0) / 0.035, 2.0)) * a);
    }
    // Oil cells: clear round bubbles pushing through, bright with dark rims.
    vec2 oq = q * 2.2 + vec2(gT * 0.3, -gT * 0.2);
    vec2 oi = floor(oq), of = fract(oq);
    float best = 9.0;
    for (int j = -1; j <= 1; ++j) for (int i = -1; i <= 1; ++i) {
        vec2 o = vec2(i, j);
        vec2 cc = o + 0.5 + 0.22 * sin(gT * 0.5 + 6.28 * hash22(oi + o));
        best = min(best, length(of - cc) / (0.16 + 0.12 * hash21(oi + o)));
    }
    // Oil only in drifting patches (where the oil sheet lies), not everywhere.
    float sheet = smoothstep(0.62 - 0.2 * clamp(oilP, 0.0, 1.0), 0.72 - 0.2 * clamp(oilP, 0.0, 1.0), fbm3(q * 0.7 + vec2(-gT * 0.15, gT * 0.1)));
    float oil = smoothstep(1.02, 0.95, best) * sheet;
    col = mix(col, col * 1.6 + 0.08, oil * 0.6);
    outline = max(outline, exp(-pow((best - 1.0) / 0.05, 2.0)) * 0.8 * sheet);
    col *= 1.0 - 0.8 * outline;
    // The projector's lamp: bright, a little warm, vignetted at the corners.
    col = mix(vec3(luma(col)), col, 0.8 + 0.6 * swell);
    col *= (0.8 + 0.5 * bass) * (1.0 - 0.3 * dot(p, p));
    finish(col * 1.2);
}
