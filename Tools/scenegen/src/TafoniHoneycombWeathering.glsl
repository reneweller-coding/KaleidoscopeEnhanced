//@doc
 * @brief TAFONI HONEYCOMB WEATHERING: tafoni: honeycomb weathering in rock, with hollows and webs; the photo sets the colour, and the hollows grow and merge slowly.  The rock is a Voronoi net in which each cell is a hollow whose radius grows with the age of the weathering; where the hollows meet only a thin web
 * is left.  The hollows are shaded as concave bowls.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell   -> the growth of the hollows (the radius against the cell size)
 *   audioAdvance -> the light moves over the rock (integrated)
 *
 * Knobs: sizeP (the size of the hollows), hueP.
//@params sizeP
//@audio audioSwell audioAdvance
//@body
void main()
{
    vec2 p = screenP();
    float S = 0.1 + 0.09 * clamp(sizeP, 0.0, 1.0);
    vec2 g = p / S;
    vec2 gi = floor(g);
    float d1 = 1e3;
    float d2 = 1e3;
    vec2 best = vec2(0.0);
    for (int dy = -1; dy <= 1; ++dy)
        for (int dx = -1; dx <= 1; ++dx) {
            vec2 cj = gi + vec2(float(dx), float(dy));
            vec2 h = hash22(cj);
            vec2 pt = cj + 0.5 + 0.4 * (h - 0.5) * 2.0;
            float d = length(g - pt);
            if (d < d1) { d2 = d1; d1 = d; best = pt; } else if (d < d2) d2 = d;
        }
    float grow = 0.55 + 0.4 * clamp(audioSwell, 0.0, 1.0) + 0.05 * sin(0.07 * sceneTime);
    float web = d2 - d1;
    float inHollow = smoothstep(0.0, 0.18 * grow, web);
    float depth = inHollow * (1.0 - smoothstep(0.0, 0.7, d1));
    vec3 c = imgLod(p * 0.85 + 0.5, 0.8);
    vec3 rock = mix(vec3(0.55, 0.45, 0.38), c * 1.1, 0.55);
    float la = 0.03 * audioAdvance + 0.05 * sceneTime;
    vec2 ldir = vec2(cos(la), sin(la));
    vec2 toC = (g - best);
    float side = dot(normalize(toC + 1e-4), ldir);
    float bowl = 0.5 - 0.35 * inHollow * (0.6 + 0.5 * side * smoothstep(0.0, 0.6, d1));
    vec3 col = rock * mix(1.0, bowl * 1.2, inHollow) * (0.85 + 0.3 * smoothstep(0.0, 0.25, web));
    col *= 0.9 + 0.2 * noise2(p * 160.0);
    finish(col * 1.1);
}
