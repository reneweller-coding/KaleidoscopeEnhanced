//@doc
 * @brief MCMULLEN CANTOR RINGS: z^2 + c / z^2: a dust of circles and rings, a ring of photo in each.  The photo is the orbit trap: wherever an orbit of the iteration lands in a window of the plane it
 * gathers the photo there, so the picture shows in every copy of the fractal, turned, mirrored and nested, in its own
 * colours; where no orbit lands, the plain photo a little dimmed.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the zoom into the fractal (integrated, a raised cosine: no jump)
 *   audioPhase -> the parameter circles round the origin (integrated)
 *   audioSwell      -> how deep the zoom goes and how brightly the trap reads
 *
 * Knobs: depthP (the zoom's depth), iterP (the quality of the iteration), hueP.
//@params depthP iterP
//@audio audioAdvance audioSwell audioPhase audioHarmAdvance
//@body
void main()
{
    vec2 p = screenP();
    vec2 bg = p * 0.8 + 0.5;
    float run = 0.012 * sceneTime + 0.025 * audioAdvance;
    float sw = clamp(audioSwell, 0.0, 1.0);
    float depth = 0.6 * (0.6 + 1.5 * clamp(depthP, 0.0, 1.0)) * (0.5 + 0.7 * sw);
    float zoom = fracZoom(run, depth);
    float h = audioHarmAdvance;
    float ph = 0.3 * sceneTime + 3.0 * audioPhase;
    vec2 c = 0.012 * vec2(cos(0.2 * ph), sin(0.2 * ph)) * (1.0 + 0.5 * sw);
    vec2 z = p * 2.6 * zoom;
    vec2 z0 = z;
    vec3 acc = vec3(0.0);
    float accw = 0.0;
    float esc = 1.0;
    for (int i = 0; i < 40; ++i) {
        if (i >= 30) break;
        z = fcMul(z, z) + fcDiv(c, fcMul(z, z));
        if (dot(z, z) > 16.0 || dot(z, z) < 1e-4) { esc = float(i) / float(30); break; }
        vec4 tr = fracTrap(z, 1.7);
        float w = tr.a * exp(-3.0 * 0.07 * float(i));
        acc += tr.rgb * w;
        accw += w;
    }
    finish(fracCompose(acc, accw, esc, bg) * (0.9 + 0.3 * sw));
}
