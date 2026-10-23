//@doc
 * @brief SCHROEDER POLE LACE: Schroeder's method on a function with a pole, z^3 - 1 + a / z: a net of poles and cusps, the photo hanging on its edges like lace.  The photo is the orbit trap: wherever an orbit of the iteration lands in a window of the plane it
 * gathers the photo there, so the picture shows in every copy of the fractal, turned, mirrored and nested, in its own
 * colours; where no orbit lands, the plain photo a little dimmed.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the zoom into the fractal (integrated, a raised cosine: no jump)
 *   audioSpread -> the pole's strength a
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
    float depth = 0.6 * (0.8 + 1.6 * clamp(depthP, 0.0, 1.0)) * (0.5 + 0.7 * sw);
    float zoom = fracZoom(run, depth);
    float h = audioHarmAdvance;
    float ph = 0.3 * sceneTime + 3.0 * audioPhase;
    vec2 z = p * 2.8 * zoom;
    vec2 a = vec2(0.15 + 0.35 * clamp(audioSpread, 0.0, 1.0), 0.0);
    vec2 z0 = z;
    vec3 acc = vec3(0.0);
    float accw = 0.0;
    float esc = 1.0;
    for (int i = 0; i < 40; ++i) {
        if (i >= 14) break;
        vec2 iz = fcDiv(vec2(1.0, 0.0), z);
        vec2 f = fcMul(z, fcMul(z, z)) - vec2(1.0, 0.0) + fcMul(a, iz);
        vec2 f1 = 3.0 * fcMul(z, z) - fcMul(a, fcMul(iz, iz));
        vec2 f2 = 6.0 * z + 2.0 * fcMul(a, fcMul(iz, fcMul(iz, iz)));
        vec2 den = fcMul(f1, f1) - fcMul(f, f2);
        z -= fcDiv(fcMul(f, f1), den);
        if (dot(z, z) > 100.0) { esc = float(i) / float(14); break; }
        vec4 tr = fracTrap(z, 1.4);
        float w = tr.a * exp(-3.0 * 0.12 * float(i));
        acc += tr.rgb * w;
        accw += w;
    }
    finish(fracCompose(acc, accw, esc, bg) * (0.9 + 0.3 * sw));
}
