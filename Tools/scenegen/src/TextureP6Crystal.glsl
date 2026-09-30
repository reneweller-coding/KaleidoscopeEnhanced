//@doc
 * @brief TEXTURE P6 CRYSTAL: the photograph cut into a crystal of
 * six-fold pinwheels -- each hexagonal cell holds the picture six times,
 * rotated (not mirrored) around its centre, so the cells swirl like
 * turbines; every one of the six wedges is a bevelled facet catching a
 * slowly circling light, with sharp bright facet edges and a small
 * refracting jewel at each cell centre.  The photo glides under the
 * crystal, the facet light wanders.  Endless, mirrorable.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the photo glides under the crystal (integrated)
 *   audioPhase      -> the crystal lattice turns (integrated)
 *   audioSpread     -> bevel depth
 *   audioKick       -> the facet edges flash (light)
 *   audioMode       -> light temperature: cool in minor, warm in major
 *   audioHigh       -> the jewels sparkle (light)
 *
 * Knobs: cellP (cell size), twistP (pinwheel twist inside the cells), photoZoomP, hueP.
//@params cellP twistP photoZoomP
//@audio audioPhase audioSpread audioKick audioMode audioHigh
//@body
void main()
{
    vec2 p = screenP();
    float kick = clamp(audioKick, 0.0, 1.0);
    float hi = clamp(audioHigh * 1.5, 0.0, 1.0);
    float cell = 0.22 + 0.25 * clamp(cellP, 0.0, 1.0);
    vec2 q = rot2(0.008 * sceneTime + 0.1 * audioPhase) * p / cell;
    const vec2 s = vec2(1.0, 1.7320508);
    vec2 ha = mod(q, s) - s * 0.5;
    vec2 hb = mod(q - s * 0.5, s) - s * 0.5;
    vec2 h = dot(ha, ha) < dot(hb, hb) ? ha : hb;
    vec2 cid = q - h;
    cid = floor(cid / (s * 0.5) + 0.5) * (s * 0.5);                // exact centre: hashes must not see rounding noise
    float r = length(h);
    float ang = atan(h.y, h.x);
    // Six wedges; each is the same piece of photo, rotated (p6: no mirrors).
    float sec = 1.0471976;
    float wi = floor((ang + 3.14159265) / sec);                // wedge index (space)
    float la = ang - (wi * sec - 3.14159265) ;                  // 0..sec inside the wedge
    float tw = (0.3 + 1.2 * clamp(twistP, 0.0, 1.0)) * r;       // pinwheel twist grows outward
    vec2 lp = r * vec2(cos(la + tw), sin(la + tw));
    float z = 0.35 + 0.35 * clamp(photoZoomP, 0.0, 1.0);
    vec2 win = vec2(0.5) + 0.3 * vec2(sin(0.011 * sceneTime + 0.15 * audioAdvance), cos(0.009 * sceneTime + 0.12 * audioAdvance));
    vec2 uv = win + (lp - vec2(0.25, 0.1)) * z + cid * 0.013;
    vec3 ph = imgLod(uv, 0.4);
    // Facets: each wedge a bevel tilted toward the cell centre.
    float bevel = 0.4 + 0.6 * clamp(audioSpread, 0.0, 1.0);
    float mid = wi * sec - 3.14159265 + sec * 0.5;
    vec3 n = normalize(vec3(-cos(mid) * bevel * smoothstep(0.1, 0.5, r), -sin(mid) * bevel * smoothstep(0.1, 0.5, r), 1.0));
    float la2 = 0.15 * sceneTime;
    vec3 L = normalize(vec3(cos(la2), sin(la2), 1.2));
    float diff = max(dot(n, L), 0.0);
    float spec = pow(max(dot(reflect(-L, n), vec3(0.0, 0.0, 1.0)), 0.0), 24.0);
    float mode = clamp(audioMode, 0.0, 1.0);
    vec3 lc = mix(vec3(0.75, 0.88, 1.1), vec3(1.15, 0.9, 0.7), mode);
    float m = luma(imgLod(win, 8.0));
    vec3 col = max((ph - m) * 1.4 + m, 0.0) * (0.35 + 0.85 * diff) * lc;
    col += lc * spec * 0.35;
    // Facet edges: wedge borders and the hexagon rim.
    float px = fwidth(r) * 1.5 + 1e-4;
    float edgeW = min(la, sec - la) * r;
    float hexD = max(abs(h.x), abs(h.x) * 0.5 + abs(h.y) * 0.866);   // pointy-top cell, inradius 0.5
    vec3 gc = glowColour(imgLod(win, 5.0), cid * 0.1, hueP * 0.159);
    float edge = exp(-edgeW / px) * smoothstep(0.05, 0.15, r) + exp(-max(0.5 - hexD, 0.0) / px);
    col += mix(gc, vec3(1.0), 0.5) * edge * (0.2 + 0.9 * kick);
    // The jewel at the centre: a small refracting dome.
    float jr = 0.1;
    float jd = smoothstep(jr, jr - px, r);
    vec3 jewel = imgLod(win - h * 2.0, 1.0) * 1.2 * gc;
    jewel += vec3(1.0) * pow(max(0.0, 1.0 - length(h - vec2(-0.03, 0.03)) / 0.04), 3.0) * (0.3 + 1.2 * hi);
    col = mix(col, jewel, jd);
    finish(col);
}
