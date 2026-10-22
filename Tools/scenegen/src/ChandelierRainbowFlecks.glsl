//@doc
 * @brief CHANDELIER RAINBOW FLECKS: the crystal drops of a turning chandelier throw thousands of small flecks of light
 * over the walls of a dark room: they sweep past, near ones faster and larger, each a warm white spot with a thin
 * coloured fringe at its ends, flaring as its prism turns into the light and fading as it turns away.  The flecks lie
 * in four depth layers of jittered cells on a curved wall that slides by with the chandelier's turn; the chandelier
 * itself is a soft glow at the top in the photo's colour.  The fringes stay near the colour family from the photo.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance -> the chandelier turns (integrated): the flecks sweep and their prisms flare in turn
 *   audioSwell   -> how many flecks there are (they fade in and out one by one)
 *   audioKick    -> some flecks flash
 *
 * Knobs: fleckP (the flecks' size), layerP (how strongly the layers' speeds differ), hueP.
//@params fleckP layerP
//@audio audioSwell audioKick
//@body
void main()
{
    vec2 p = screenP();
    float fh = famHue();
    float turn = 0.04 * sceneTime + 0.16 * audioAdvance;
    float dens = 0.45 + 0.55 * clamp(audioSwell, 0.0, 1.0);
    float kick = clamp(audioKick, 0.0, 1.0);
    vec3 col = famCol(fh, 0.45) * 0.015;
    col += famLight(fh, 0.5, 0.6) * 0.14 * exp(-pow(length(p - vec2(0.0, 0.6)) / 0.35, 2.0));   // the chandelier
    col += famCol(fh, 0.5) * 0.03 * (0.5 + fbm(vec2(3.0 * p.x + 2.0 * turn, 0.5 * p.y)));       // the walls
    for (int L = 0; L < 4; ++L) {
        float fl = float(L);
        float depth = 1.0 + 0.55 * fl;
        float S = (0.14 + 0.06 * clamp(fleckP, 0.0, 1.0)) / depth;
        float speed = 1.0 / (1.0 + fl * (0.3 + 0.5 * clamp(layerP, 0.0, 1.0)));
        // the wall curves round the room: the rows bend, and the wall slides by as the chandelier turns
        vec2 q = vec2(p.x + 2.0 * turn * speed, p.y + 0.12 * p.x * p.x + 0.02 * sin(0.4 * turn + fl));
        q += vec2(13.7, 7.1) * fl;
        vec2 cid = floor(q / S);
        vec2 f = q / S - cid;
        float h1 = hash21(cid + 31.0 * fl), h2 = hash21(cid + vec2(17.0, 3.0) + 31.0 * fl);
        vec2 c = 0.36 + 0.28 * hash22(cid + 5.0 * fl);
        float ang = 1.57 + 0.8 * (h2 - 0.5);                          // the fringe's axis, near vertical
        vec2 ax = vec2(cos(ang), sin(ang));
        vec2 d = f - c;
        float along = dot(d, ax), across = dot(d, vec2(-ax.y, ax.x));
        float len = 0.2 + 0.1 * h1, wid = 0.09 + 0.05 * h2;
        float e = length(vec2(along / len, across / wid));
        // the prism flares as it turns into the light
        float flare = pow(0.5 + 0.5 * cos(6.2831853 * h1 + turn * (3.0 + 4.0 * h2)), 6.0);
        float on = smoothstep(h2 - 0.05, h2 + 0.05, dens);
        float flash = smoothstep(0.85, 0.95, h1) * kick;
        float core = smoothstep(1.0, 0.55, e);
        float t = clamp(along / len * 0.5 + 0.5, 0.0, 1.0);
        vec3 fringe = hsv2rgb(vec3(fract(fh + 0.45 * (t - 0.5)), 0.8, 1.0));
        vec3 fc = mix(famLight(fh, t, 0.8), fringe, smoothstep(0.3, 0.8, e) * (0.5 + 0.5 * smoothstep(0.2, 0.8, abs(along / len))));
        col += fc * (core + 0.2 * exp(-2.0 * e)) * on * (0.08 + 0.75 * flare + 0.9 * flash) * (1.2 / depth);
    }
    finish(famExpose(col, 2.20, 0.80, 0.03, fh));
}
