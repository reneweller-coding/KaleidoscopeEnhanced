//@doc
 * @brief RETRO REFLECTOR BLOOM: a surface paved with corner-cube reflectors, like a road sign seen up close -- each
 * hexagon three little mirror facets meeting at a corner, which send light back where it came from -- so the
 * lights near the eye bloom out of the facets as glowing patterns that wander as the view swings.  Every facet has
 * its own normal; a light returns to the eye when its direction, folded through the three facets, points back at
 * it, so the brightness is a narrow lobe round the light's mirror image in each facet.  The lights' colours come
 * from one colour family from the photo.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance -> the view swings slowly over the surface (integrated): the patterns wander
 *   audioOnset   -> a new light flares beside the eye and fades
 *   audioSwell   -> the lobes widen
 *
 * Knobs: cellP (the reflectors' size), lobeP (how sharp the lobes), hueP.  Distinct from the glitter of the list of
 * 30.09.: here the facet pattern itself.
//@params cellP lobeP
//@audio audioOnset audioSwell
//@body
void main()
{
    vec2 p = screenP();
    float fh = famHue();
    float S = 0.045 + 0.04 * clamp(cellP, 0.0, 1.0);
    float sharp = (180.0 + 400.0 * clamp(lobeP, 0.0, 1.0)) / (0.6 + 0.8 * clamp(audioSwell, 0.0, 1.0));
    float swing = 0.04 * sceneTime + 0.2 * audioAdvance;
    // the surface tilted a little against the eye, seen in perspective
    vec2 q = p * vec2(1.0, 1.0 + 0.25 * p.y);
    vec2 v = vec2(0.25 * sin(swing), 0.2 * cos(0.7 * swing));   // the view's tilt over the surface
    q += v * 0.5;
    // the hexagonal cell and the facet: three rhombi round the cell's centre
    vec2 r = vec2(1.0, 1.7320508);
    vec2 h = r * 0.5;
    vec2 a = mod(q / S, r) - h, b = mod(q / S - h, r) - h;
    vec2 g = dot(a, a) < dot(b, b) ? a : b;                     // the point in its hexagon
    vec2 cid = q / S - g;
    float ang = atan(g.y, g.x) + 3.14159265;
    float facet = floor(ang / 2.0943951);                        // 0, 1, 2
    // each facet's normal leans toward its own third; the eye's view direction leans with the swing
    float fa = facet * 2.0943951 + 1.0471976;
    float hn = fract(sin(dot(cid, vec2(41.3, 17.7))) * 43758.5453);
    vec3 n = normalize(vec3(0.6 * cos(fa) + 0.35 * (hn - 0.5), 0.6 * sin(fa) + 0.35 * (fract(hn * 7.1) - 0.5), 1.0));
    vec3 view = normalize(vec3(-p * 0.6 - v, 1.0));
    vec3 col = famCol(fh, 0.5) * 0.03 * (0.6 + 0.4 * facet);
    // which of a cube's three facets lights up depends on the direction the light leaves by: as the view swings, the
    // bright facet steps round the corner, and every cell a little differently (its own manufacturing tilt)
    float az = atan(view.y, view.x) + 6.2831853 * (hn - 0.5) * 0.35;
    float facetLit = pow(0.5 + 0.5 * cos(fa - az - 1.5 * length(view.xy) * 3.0), 6.0);
    for (int i = 0; i < 4; ++i) {
        float fi = float(i);
        // the lights: three steady ones round the eye, one that flares on onsets
        vec3 L = normalize(vec3(0.15 * cos(2.0944 * fi + 0.3 * swing), 0.15 * sin(2.0944 * fi + 0.3 * swing), 1.0));
        float amp = i < 3 ? 1.0 : 2.5 * clamp(audioOnset, 0.0, 1.0);
        // a corner cube sends the light back where it came from: a lobe round the light's own direction
        float retro = exp(-sharp * 0.08 * (1.0 - max(dot(L, view), 0.0)));
        float hc = fract(sin(dot(cid, vec2(12.9898, 78.233)) + fi) * 43758.5453);
        col += famLight(fh, 0.2 * fi + 0.1 * hc, 0.5 * facetLit) * retro * (0.15 + 1.4 * facetLit * (0.6 + 0.8 * hc)) * amp;
    }
    // the facets' ridges: fine dark lines between the three mirrors and round the hexagon
    float ridge = abs(fract(ang / 2.0943951 + 0.5) - 0.5) * length(g);
    float rim = 0.5 - max(abs(g.x) * 0.8660254 + abs(g.y) * 0.5, abs(g.y));
    col *= smoothstep(0.0, 0.05, ridge) * smoothstep(0.0, 0.04, rim);
    finish(famExpose(col, 1.60, 1.00, 0.03, fh));
}
