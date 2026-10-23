//@doc
 * @brief TANGENT JULIA TOWERS: z -> c tan z: towers to infinity, the photo standing in stacked tiles.  The photo is the orbit trap: wherever an orbit of the iteration lands in a window of the plane it
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
    vec2 c = vec2(0.9, 0.25) + 0.2 * vec2(cos(0.5 * h), sin(0.5 * h));
    vec2 z = p * 5.0 * zoom;
    vec2 z0 = z;
    vec3 acc = vec3(0.0);
    float accw = 0.0;
    float esc = 1.0;
    for (int i = 0; i < 40; ++i) {
        if (i >= 24) break;
        vec2 tz = fcDiv(vec2(sin(2.0 * z.x), sinh(2.0 * z.y)), vec2(cos(2.0 * z.x) + cosh(2.0 * z.y), 0.0));
        z = fcMul(c, tz);
        if (abs(z.y) > 8.0 || dot(z, z) > 400.0) { esc = float(i) / float(24); break; }
        vec4 tr = fracTrap(z, 2.6);
        float w = tr.a * exp(-3.0 * 0.09 * float(i));
        acc += tr.rgb * w;
        accw += w;
    }
    finish(fracCompose(acc, accw, esc, bg) * (0.9 + 0.3 * sw));
}
