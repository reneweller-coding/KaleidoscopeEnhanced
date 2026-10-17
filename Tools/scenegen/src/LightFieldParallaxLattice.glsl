//@doc
 * @brief LIGHT FIELD PARALLAX LATTICE: a sheet of microlenses over the photo, as in integral imaging -- every little
 * lens shows the scene from its own point of view, so the photo, cut into depth layers by its brightness, appears
 * in every lens with a parallax: near layers shift more than far ones.  The viewing direction wanders, the layers
 * slide against each other in each lens, and the whole sheet sparkles like a lenticular print.
 *
 * Audio Reactivity (structure, not only light):
 *   audioPhase      -> the viewing direction wanders (integrated)
 *   audioSwell      -> the depth: loud passages pull the layers further apart
 *   audioKick       -> the lens rims flash (light)
 *
 * Knobs: lensP (lenses on a screen height), layersP (depth layers), rimP (how strongly the rims show), hueP.
//@params lensP layersP rimP
//@audio audioSwell audioKick
//@body
void main()
{
    vec2 p = screenP();
    float lens = 14.0 + 30.0 * clamp(lensP, 0.0, 1.0);
    // a hexagonal lens array: the nearest of two offset square lattices
    vec2 g = p * lens;
    vec2 a = vec2(1.0, 1.7320508);
    vec2 h1 = mod(g, a) - 0.5 * a, h2 = mod(g - 0.5 * a, a) - 0.5 * a;
    vec2 loc = dot(h1, h1) < dot(h2, h2) ? h1 : h2;
    vec2 cen = (g - loc) / lens;                                // the lens's centre on screen
    float rr = length(loc) / 0.5;
    // the view from this lens: the local coordinate within the lens is the viewing angle
    float t = 0.05 * audioPhase + 0.03 * sceneTime;
    vec2 view = 0.6 * vec2(sin(t), cos(0.7 * t)) + loc * 1.6;
    float depth = 0.02 + 0.04 * clamp(audioSwell, 0.0, 1.0);
    int nl = 3 + int(3.0 * clamp(layersP, 0.0, 1.0));
    vec2 uv = cen * 0.7 + 0.5;
    // the frontmost layer the ray meets: a layer at depth k shows where the photo's brightness reaches it
    vec3 col = imgLod(uv + view * depth * float(nl), 2.0) * 0.25;
    for (int k = 0; k < 6; ++k) {
        if (k >= nl) break;
        float fk = float(nl - 1 - k);                           // from the back to the front
        vec2 q = uv + view * depth * fk * 0.5;
        vec3 c = imgLod(q, 0.6);
        float layerAt = floor(luma(imgLod(q, 2.0)) * float(nl));
        if (layerAt >= fk) col = c * (0.7 + 0.5 * fk / float(nl));
    }
    float rim = smoothstep(0.75, 1.0, rr);
    vec3 tone = imgPalette(0.4 + 0.03 * audioPhase);
    col *= 1.0 - 0.4 * rim;
    col += mix(tone, vec3(1.0), 0.6) * rim * (1.0 - smoothstep(1.0, 1.1, rr)) * (0.08 + 0.3 * clamp(rimP, 0.0, 1.0))
           * (0.5 + clamp(audioKick, 0.0, 1.0));
    finish(col);
}
