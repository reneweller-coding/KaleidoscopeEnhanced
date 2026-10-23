//@doc
 * @brief PERPENDICULAR MANDELBROT NEEDLES: the perpendicular Mandelbrot map (|Re z| - i Im z)^2 + c: needles and bones instead of roundness, the photo in splinters.  The photo is the orbit trap: wherever an orbit of the iteration lands in a window of the plane it
 * gathers the photo there, so the picture shows in every copy of the fractal, turned, mirrored and nested, in its own
 * colours; where no orbit lands, the plain photo a little dimmed.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the zoom into the fractal (integrated, a raised cosine: no jump)
 *   audioSpread -> the view's centre moves with the spectrum's width
 *   audioSwell      -> how deep the zoom goes and how brightly the trap reads
 *
 * Knobs: depthP (the zoom's depth), iterP (the quality of the iteration), hueP.
//@params depthP iterP
//@audio audioAdvance audioSwell audioSpread audioPhase audioHarmAdvance
//@body
void main()
{
    vec2 p = screenP();
    vec2 bg = p * 0.8 + 0.5;
    float run = 0.012 * sceneTime + 0.025 * audioAdvance;
    float sw = clamp(audioSwell, 0.0, 1.0);
    float depth = 0.6 * (1.5 + 2.5 * clamp(depthP, 0.0, 1.0)) * (0.5 + 0.7 * sw);
    float zoom = fracZoom(run, depth);
    float h = audioHarmAdvance;
    float ph = 0.3 * sceneTime + 3.0 * audioPhase;
    vec2 c0 = vec2(-0.55, 0.0) + 0.15 * vec2(sin(0.2 * ph), cos(0.17 * ph)) * clamp(audioSpread, 0.0, 1.0);
    vec2 c = c0 + p * 3.2 * zoom;
    vec2 z = vec2(0.0);
    vec2 z0 = c * 0.5;
    vec3 acc = vec3(0.0);
    float accw = 0.0;
    float esc = 1.0;
    for (int i = 0; i < 40; ++i) {
        if (i >= 32) break;
        vec2 wv = vec2(abs(z.x), -z.y);
        z = fcMul(wv, wv) + c;
        if (dot(z, z) > 16.0) { esc = float(i) / float(32); break; }
        vec4 tr = fracTrap(z, 1.8);
        float w = tr.a * exp(-3.0 * 0.06 * float(i));
        acc += tr.rgb * w;
        accw += w;
    }
    finish(fracCompose(acc, accw, esc, bg) * (0.9 + 0.3 * sw));
}
