//@doc
 * @brief HALLEY BASINS PHOTO: Halley's method on z^4 - 1: basins with ring-shaped borders.  The photo is the orbit trap: wherever an orbit of the iteration lands in a window of the plane it
 * gathers the photo there, so the picture shows in every copy of the fractal, turned, mirrored and nested, in its own
 * colours; where no orbit lands, the plain photo a little dimmed.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the zoom into the fractal (integrated, a raised cosine: no jump)
 *   audioPhase -> the method's relaxation breathes (integrated)
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
    float depth = 0.6 * (0.8 + 1.6 * clamp(depthP, 0.0, 1.0)) * (0.5 + 0.7 * sw);
    float zoom = fracZoom(run, depth);
    float h = audioHarmAdvance;
    float ph = 0.3 * sceneTime + 3.0 * audioPhase;
    vec2 z = p * 2.6 * zoom;
    float rl = 1.0 + 0.25 * sin(0.3 * ph);
    vec2 z0 = z;
    vec3 acc = vec3(0.0);
    float accw = 0.0;
    float esc = 1.0;
    for (int i = 0; i < 40; ++i) {
        if (i >= 14) break;
        vec2 z2 = fcMul(z, z), z3 = fcMul(z2, z);
        vec2 f = fcMul(z3, z) - vec2(1.0, 0.0), f1 = 4.0 * z3, f2 = 12.0 * z2;
        vec2 den = 2.0 * fcMul(f1, f1) - fcMul(f, f2);
        z -= rl * fcDiv(2.0 * fcMul(f, f1), den);
        if (dot(z, z) > 100.0) { esc = float(i) / float(14); break; }
        vec4 tr = fracTrap(z, 1.4);
        float w = tr.a * exp(-3.0 * 0.12 * float(i));
        acc += tr.rgb * w;
        accw += w;
    }
    finish(fracCompose(acc, accw, esc, bg) * (0.9 + 0.3 * sw));
}
