//@doc
 * @brief EXP JULIA FLAMES: the exponential map z -> e^z + c: Julia sets of endless flame bands.  The photo is the orbit trap: wherever an orbit of the iteration lands in a window of the plane it
 * gathers the photo there, so the picture shows in every copy of the fractal, turned, mirrored and nested, in its own
 * colours; where no orbit lands, the plain photo a little dimmed.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the zoom into the fractal (integrated, a raised cosine: no jump)
 *   audioHarmAdvance -> c follows the harmony (integrated)
 *   audioSwell      -> how deep the zoom goes and how brightly the trap reads
 *
 * Knobs: depthP (the zoom's depth), iterP (the quality of the iteration), hueP.
//@params depthP iterP
//@audio audioAdvance audioSwell audioHarmAdvance audioPhase
//@body
void main()
{
    vec2 p = screenP();
    vec2 bg = p * 0.8 + 0.5;
    float run = 0.012 * sceneTime + 0.025 * audioAdvance;
    float sw = clamp(audioSwell, 0.0, 1.0);
    float depth = 0.6 * (1.0 + 1.8 * clamp(depthP, 0.0, 1.0)) * (0.5 + 0.7 * sw);
    float zoom = fracZoom(run, depth);
    float h = audioHarmAdvance;
    float ph = 0.3 * sceneTime + 3.0 * audioPhase;
    vec2 c = vec2(-1.1, 0.7) + 0.3 * vec2(cos(0.5 * h), sin(0.5 * h));
    vec2 z = p * 5.5 * zoom + vec2(-0.5, 0.0);
    vec2 z0 = z;
    vec3 acc = vec3(0.0);
    float accw = 0.0;
    float esc = 1.0;
    for (int i = 0; i < 40; ++i) {
        if (i >= 26) break;
        z = fcExp(z) + c;
        if (z.x > 12.0) { esc = float(i) / float(26); break; }
        vec4 tr = fracTrap(z, 3.2);
        float w = tr.a * exp(-3.0 * 0.1 * float(i));
        acc += tr.rgb * w;
        accw += w;
    }
    finish(fracCompose(acc, accw, esc, bg) * (0.9 + 0.3 * sw));
}
