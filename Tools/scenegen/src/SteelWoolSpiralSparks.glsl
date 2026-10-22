//@doc
 * @brief STEEL WOOL SPIRAL SPARKS: steel-wool light painting: a glowing bundle swung on a circle leaves a bright ring in
 * the long exposure, and from it showers of round sparks fly off tangentially, each a dotted arc curving a little as
 * it falls; the whole picture is mirrored into a six-fold rosette, so the rings and showers repeat to the frame's
 * edges.  A spark leaves the circle at its own angle, heads along the tangent, sinks under gravity and burns out; its
 * track is drawn as a row of round sparks fading along it.  The sparks' colours are warm shades of one colour family
 * from the photo.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance -> the bundle's swing round the circle (integrated): the showers leave from where it is
 *   audioSwell   -> how many sparks fly
 *   audioOnset   -> a burst of brighter sparks
 *
 * Knobs: radiusP (the circle's size), foldP (the rosette's symmetry), hueP.  Distinct from BlacksmithSparks, which is
 * an anvil.
//@params radiusP foldP
//@audio audioSwell audioOnset
//@body
void main()
{
    vec2 p = screenP();
    float fh = famHue();
    float sides = floor(5.0 + 3.0 * clamp(foldP, 0.0, 1.0));
    float R = 0.22 + 0.12 * clamp(radiusP, 0.0, 1.0);
    float amount = 0.35 + 0.65 * clamp(audioSwell, 0.0, 1.0);
    float burst = clamp(audioOnset, 0.0, 1.0);
    float swing = 0.4 * sceneTime + 1.8 * audioAdvance;
    // the rosette: fold the screen six ways about the middle, then work round the circle's centre at (0.42, 0)
    float sec = 6.2831853 / sides;
    float a = abs(mod(atan(p.y, p.x), sec) - 0.5 * sec);
    vec2 q = length(p) * vec2(cos(a), sin(a)) - vec2(0.42, 0.0);
    // the ring the bundle drew
    float ring = exp(-pow((length(q) - R) / 0.004, 2.0)) * 0.7 + exp(-abs(length(q) - R) / 0.02) * 0.15;
    vec3 col = famLight(fh, 0.15, 0.6) * ring;
    // the sparks: 40 tracks, each leaving the circle at its own angle behind the bundle
    for (int i = 0; i < 40; ++i) {
        float fi = float(i);
        float h1 = fract(sin(fi * 12.9898) * 43758.5453), h2 = fract(sin(fi * 78.233) * 43758.5453);
        float on = smoothstep(h1 - 0.05, h1 + 0.05, amount);   // sparks fade in and out with the swell, never pop
        if (on <= 0.0) continue;
        float a0 = swing - 6.2831853 * h2;                         // where on the circle it left
        vec2 start = R * vec2(cos(a0), sin(a0));
        vec2 dir = vec2(-sin(a0), cos(a0)) * (0.5 + 0.8 * fract(h1 * 7.3));
        // its track: a short arc, falling a little; drawn as round sparks spaced along it
        float best = 1e9, along = 0.0;
        for (int k = 1; k <= 8; ++k) {
            float tt = float(k) / 8.0;
            vec2 sp = start + dir * 0.35 * tt + vec2(0.0, -0.12 * tt * tt);
            float d = length(q - sp);
            if (d < best) { best = d; along = tt; }
        }
        float spark = exp(-pow(best / 0.006, 2.0)) * (1.0 - along) * (1.0 + 1.5 * burst * step(0.7, h2)) * on;
        col += famLight(fh, 0.1 + 0.2 * h2, 0.7 - 0.5 * along) * spark;
    }
    finish(famExpose(col, 3.70, 0.70, 0.05, fh));
}
