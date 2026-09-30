//@doc
 * @brief LAVA LAMP (rebuilt 30.09.2026): inside a lava lamp, filling the frame
 * -- warm wax rises from the heat below in slow, heavy columns, bulges into
 * round heads, pinches off at thin necks, floats up, cools and sinks again,
 * blobs meet and melt into each other.  What makes a real lamp hypnotic and
 * what this rebuild is about: the wax GLOWS from inside (light scattered
 * through it, bright at the thin edges and necks, deep in the thick cores),
 * the liquid around it is tinted and lit from below, every blob is a lens
 * that bends the light behind it, and everything moves at the speed of
 * warm honey.  The wax and liquid colours come from the photo where it has
 * colour.  The view is a flat slab of the lamp, repeated and mirrored
 * across the frame so it runs on without edges.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the heat that drives the wax up (integrated, jump-free)
 *   audioSwell      -> the amount of wax (slow)
 *   audioSpread     -> viscosity: wide spectrum makes smaller, quicker blobs
 *   audioMode       -> the wax warms from red toward orange-yellow in major (slow blend)
 *   audioBass       -> the glow of the heat below (light)
 *   audioRoughness  -> the wax surface shimmers
 *
 * Knobs: waxP (wax amount), sizeP (blob size), glowP (inner glow), hueP.
//@params waxP sizeP glowP
//@audio audioSwell audioSpread audioMode audioBass audioRoughness
//@expr waxP = clamp(0.45 + 0.35*swell + 0.1*seed2, 0.0, 1.0)
//@body
float gHeat, gVisc;

// Metaball field of the wax: blobs on lanes that rise and fall slowly,
// stretched vertically while they move (elongation from their speed).
float waxField(vec2 q, out float neck)
{
    float f = 0.0;
    neck = 0.0;
    for (int i = 0; i < 8; ++i) {
        float fi = float(i);
        float lane = ((fi + 0.5) / 8.0 * 2.0 - 1.0) * 1.6 + 0.1 * sin(fi * 5.3);
        // Each blob: a slow cycle up and down, never in step with the others.
        float per = (22.0 + 12.0 * hash11(fi * 1.7)) / gVisc;
        float ph = gHeat / per + hash11(fi * 3.1);
        float y = -1.3 + 2.6 * (0.5 - 0.5 * cos(ph * 6.2831853));
        float vel = sin(ph * 6.2831853);                     // up/down speed
        float r = (0.16 + 0.12 * hash11(fi * 5.7)) * (0.7 + 0.6 * clamp(sizeP, 0.0, 1.0));
        vec2 c = vec2(lane * 0.9 + 0.05 * sin(ph * 3.0 + fi), y);
        vec2 d = q - c;
        d.y /= 1.0 + 0.55 * abs(vel);                         // stretch while moving
        float g = r * r / (dot(d, d) + 1e-4);
        f += g;
        neck += g * abs(vel);
        // A rising blob still hangs from the pool by a thinning neck.
        float dx = q.x - c.x;
        float col = 0.3 * r * r / (dx * dx + r * r * 0.12) * max(vel, 0.0)
                  * smoothstep(c.y, c.y - 0.25, q.y) * exp(-max(c.y + 1.3, 0.0) * 1.1) * smoothstep(-1.6, -1.2, q.y);
        f += col;
        neck += col;
    }
    // The pool of hot wax along the bottom and a cooler layer at the top.
    f += 0.35 * exp(-(q.y + 1.35) * 4.0) + 0.2 * exp((q.y - 1.35) * 5.0);
    return f;
}

void main()
{
    vec2 p = screenP();
    float swell = clamp(audioSwell, 0.0, 1.0);
    float bass = clamp(audioBass, 0.0, 1.0);
    gHeat = sceneTime * 0.9 + 6.0 * audioAdvance;
    gVisc = 0.8 + 0.6 * clamp(audioSpread, 0.0, 1.0);

    // A slab of the lamp, mirrored across the frame so it never ends.
    vec2 q = p * 2.0;
    q.x = abs(mod(q.x + 1.6, 6.4) - 3.2) - 1.6;
    q += 0.01 * clamp(audioRoughness, 0.0, 1.0) * vec2(sin(q.y * 30.0 + sceneTime), 0.0);

    float neck;
    float thr = 1.0 - 0.35 * clamp(waxP, 0.0, 1.0);
    float f = waxField(q, neck);
    // Gradient of the field (for the lens and the rim light).
    float e = 0.01, nn;
    vec2 gr = vec2(waxField(q + vec2(e, 0.0), nn) - f, waxField(q + vec2(0.0, e), nn) - f) / e;
    float inside = smoothstep(thr - 0.04, thr + 0.04, f);
    // Thickness: how deep into the blob (thin near the surface and at necks).
    float thick = clamp((f - thr) / (thr * 1.8), 0.0, 1.0);

    // Colours: the wax and the liquid, from the photo where it has colour.
    vec3 ph = imgLod(vec2(0.5) + 0.2 * vec2(sin(0.02 * sceneTime), cos(0.017 * sceneTime)), 6.0);
    float h = (satOf(ph) > 0.2) ? hue_of(ph) : hueP * 0.159;
    h += 0.06 * clamp(audioMode, 0.0, 1.0);
    vec3 waxHot = hsv2rgb(vec3(fract(h), 0.9, 1.0));
    vec3 waxDeep = hsv2rgb(vec3(fract(h - 0.03), 1.0, 0.45));
    vec3 liquid = hsv2rgb(vec3(fract(h + 0.5), 0.75, 0.35));

    // The liquid, lit from the heat below, and bent by the blobs (lens).
    vec2 bend = -gr * 0.004;
    vec3 bg = liquid * (0.35 + 0.9 * exp(-(q.y + 1.4) * 1.3) * (0.6 + 0.6 * bass));
    bg *= 0.85 + 0.15 * sin((q.x + bend.x * 20.0) * 12.0 + (q.y + bend.y) * 3.0);       // faint coil shadow bands
    // Wax: glows from inside -- bright where thin, deep where thick.
    float glow = 0.6 + 0.8 * clamp(glowP, 0.0, 1.0);
    // Scattering: the thin skin glows brightest, the core stays saturated.
    vec3 wax = mix(waxHot * 1.35, mix(waxHot, waxDeep, 0.45), smoothstep(0.0, 0.6, thick)) * glow;
    wax += waxHot * clamp(neck / max(f, 1e-3), 0.0, 1.0) * 0.25;       // moving blobs run a little hotter
    // Heat from below lights the wax more toward the bottom.
    wax *= 0.75 + 0.5 * smoothstep(1.3, -1.3, q.y) * (0.6 + 0.6 * bass);
    // Shape: the surface normal from the field; lit from the heat below,
    // a soft sheen from the room light above.
    // (height saturates into the blob, so the core is a smooth dome, not a crease)
    float kH = 2.5 / thr;
    vec2 gh = gr * kH * exp(-max(f - thr, 0.0) * kH);
    vec3 n = normalize(vec3(-gh * 0.012, 1.0));
    wax *= 0.7 + 0.45 * clamp(-n.y * 1.5 + 0.4, 0.0, 1.0);
    wax += vec3(1.0, 0.95, 0.9) * pow(max(dot(n, normalize(vec3(-0.3, 0.5, 1.0))), 0.0), 18.0) * 0.35 * inside;
    // The rim: light caught at the surface.
    float rim = smoothstep(thr + 0.12, thr, f) * inside;
    wax += vec3(1.0, 0.95, 0.85) * rim * 0.35;
    vec3 col = mix(bg, wax, inside);
    // A soft halo of scattered light around the blobs.
    col += waxHot * smoothstep(thr * 0.4, thr, f) * (1.0 - inside) * 0.18;
    finish(col);
}
