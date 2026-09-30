//@doc
 * @brief TEXTURE GEODE INTERIOR: looking into a hollow geode that opens
 * endlessly into the depth -- the cavity is lined with crystal points, all
 * pointing inward toward the centre, ring after ring of them receding, each
 * crystal a faceted wedge glowing with light that shines through the
 * stone from outside; the crystals' colours are the photo's colours, and
 * the banded agate crust between the rings is the photo itself.  A light
 * travels slowly around the cavity and sets the facets sparkling.  An
 * endless polar field (like Tunnel), mirrorable.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the drift into the depth (integrated, jump-free)
 *   audioPhase      -> the ring of crystals turns (integrated)
 *   audioSpread     -> crystal length (wide spectrum = long points)
 *   audioMode       -> the glow: violet-blue in minor, amber-gold in major (slow blend)
 *   audioHigh       -> facets sparkle (light)
 *   audioBass       -> the light through the stone (light)
 *
 * Knobs: countP (crystals per ring), bandP (share of agate crust), glowP, hueP.
//@params countP bandP glowP
//@audio audioPhase audioSpread audioMode audioHigh audioBass
//@body
void main()
{
    vec2 p = screenP() * 2.5;
    float hi = clamp(audioHigh * 1.5, 0.0, 1.0);
    float bass = clamp(audioBass, 0.0, 1.0);
    float r = length(p);
    float a = atan(p.y, p.x) + 0.012 * sceneTime + 0.2 * audioPhase;
    float z = 0.45 / max(r, 1e-3);
    float u = z + 0.18 * sceneTime + 1.0 * audioAdvance;
    float nA = 2.0 * floor(14.0 + 14.0 * clamp(countP, 0.0, 1.0));
    float ringSp = 0.22;
    float mode = clamp(audioMode, 0.0, 1.0);
    vec3 glowC = mix(vec3(0.55, 0.35, 1.0), vec3(1.0, 0.65, 0.25), mode);
    float lightA = 0.1 * sceneTime;
    // Crystals from this ring and the two rings behind overlap (long points
    // reach into the next ring); draw back to front.
    vec3 crystal = vec3(0.0);
    float cover = 0.0;
    for (int k = 2; k >= 0; --k) {
        float ry = floor(u / ringSp) - float(k);
        float off = hash11(ry * 1.3);
        float gx = a / 6.2831853 * nA - off;
        vec2 gi = vec2(floor(gx), ry);
        float hx = hash21(vec2(mod(gi.x, nA), gi.y));
        vec2 gf = vec2(fract(gx) - 0.5 + 0.2 * (hx - 0.5), (u - ry * ringSp) / ringSp);
        float len = (1.2 + 1.6 * hx) * (0.7 + 0.5 * clamp(audioSpread, 0.0, 1.0));
        float w = 0.48 * (1.0 - gf.y / len);
        float fwx = fwidth(gx) + 0.01;
        float ins = step(0.0, gf.y) * smoothstep(0.0, 0.02, len - gf.y) * smoothstep(w + fwx, w - fwx, abs(gf.x));
        if (ins <= 0.0) continue;
        float facet = gf.x > 0.0 ? 1.0 : 0.0;
        float lit = 0.5 + 0.5 * cos(a - lightA + (facet - 0.5) * 1.3 + hx * 2.0);
        vec2 cuv = vec2(mod(gi.x, nA) * 0.071, gi.y * 0.233);
        vec3 ph = imgLod(cuv, 4.0);
        vec3 cc = mix(glowColour(ph, vec2(cos(a), sin(a)) + gi.y * 0.1, hueP * 0.159), glowC, 0.35);
        // Translucent quartz: the core glows, the facets reflect.
        float t = gf.y / len;
        float trans = (0.5 + 0.9 * clamp(glowP, 0.0, 1.0)) * (0.6 + 0.6 * bass) * (1.0 - 0.5 * t);
        vec3 c = cc * (0.2 + 0.9 * lit) * trans + cc * 0.3 * (1.0 - abs(gf.x) / max(w, 1e-3));
        float edge = smoothstep(0.04, 0.0, abs(abs(gf.x) - w)) + smoothstep(0.03, 0.0, abs(gf.x)) * 0.6;
        c += vec3(1.0) * edge * lit * (0.1 + 0.6 * hi);
        // Glitter at the tips.
        c += vec3(1.0) * smoothstep(0.15, 0.0, len - gf.y) * (0.3 + 1.0 * hi) * step(0.6, hash21(gi + 5.0)) * lit;
        crystal = mix(crystal, c, ins);
        cover = max(cover, ins);
    }
    float inside = cover;
    // The agate crust between the crystals: the photo in bands.
    vec2 buv = vec2(a / 6.2831853 * 2.0, u * 0.35);
    vec3 crust = imgLod(buv, clamp(log2(max(fwidth(u) * 1024.0 * 0.35, 1.0)), 0.0, 8.0));
    crust *= 0.35 + 0.35 * clamp(bandP, 0.0, 1.0);
    vec3 col = mix(crust, crystal, inside);
    // Depth: far rings fade into a glowing core.
    float far = smoothstep(2.0, 8.0, z);
    col = mix(col, glowC * 0.5, far);
    col += glowC * exp(-r * 3.0) * (0.3 + 0.5 * bass);
    finish(col);
}
