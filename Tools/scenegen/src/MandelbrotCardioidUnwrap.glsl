//@doc
 * @brief MANDELBROT CARDIOID UNWRAP: the edge of the Mandelbrot set unrolled along its main cardioid -- the
 * cardioid's boundary becomes a straight line across the frame, the bulbs that sprout from it (one at every
 * rational angle, the big ones at 1/2, 1/3, 2/5 ...) stand on it like a frieze of domes, each crowned with its own
 * smaller bulbs and antennae.  The frieze scrolls endlessly (the angle is periodic) and is mirrored about the line;
 * the bulbs' interiors hold the photo.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the frieze scrolls along the cardioid (integrated)
 *   audioSpread     -> how far out from the cardioid the frame reaches (wide music: the antennae too)
 *   audioKick       -> the filaments flash (light)
 *
 * Knobs: reachP (the base reach), itersP (detail), photoP (photo share), hueP.
//@params reachP itersP photoP
//@audio audioKick audioSpread
//@body
void main()
{
    vec2 p = screenP();
    float th = 6.2831853 * fract((p.x / 1.7777778) * 0.35 + 0.004 * sceneTime + 0.0015 * audioAdvance);
    vec2 e1 = vec2(cos(th), sin(th)), e2 = vec2(cos(2.0 * th), sin(2.0 * th));
    vec2 cb = 0.5 * e1 - 0.25 * e2;                             // the cardioid's boundary
    vec2 dc = 0.5 * vec2(-e1.y, e1.x) - 0.5 * vec2(-e2.y, e2.x); // its derivative
    vec2 nrm = length(dc) > 1e-5 ? normalize(vec2(dc.y, -dc.x)) : -e1;
    // the distance from the boundary: logarithmic, outward above the line, inward below (mirrored as |y|)
    float reach = (0.15 + 0.35 * clamp(reachP, 0.0, 1.0)) * (0.8 + 0.4 * clamp(audioSpread, 0.0, 1.0));
    float yy = abs(p.y) * 2.0;
    float s = reach * (exp(3.0 * yy) - 1.0) / (exp(3.0) - 1.0);
    vec2 c = cb + nrm * s * (p.y >= 0.0 ? 1.0 : -0.4);
    int n = 80 + int(120.0 * clamp(itersP, 0.0, 1.0));
    vec2 z = vec2(0.0), dz = vec2(0.0);
    float esc = -1.0;
    for (int i = 0; i < 200; ++i) {
        if (i >= n) break;
        dz = 2.0 * vec2(z.x * dz.x - z.y * dz.y, z.x * dz.y + z.y * dz.x) + vec2(1.0, 0.0);
        z = vec2(z.x * z.x - z.y * z.y, 2.0 * z.x * z.y) + c;
        if (dot(z, z) > 1024.0) { esc = float(i); break; }
    }
    vec3 col;
    vec2 uv = p * 0.6 + 0.5 + 0.02 * vec2(sin(th), cos(th));
    if (esc < 0.0) {
        // inside: the photo, tinted by where on the cardioid the bulb stands
        vec3 photo = imgLod(uv, 0.5);
        vec3 tone = imgPalette(th / 6.2831853 + 0.03 * audioPhase);
        col = mix(tone, photo * 1.2, 0.45 + 0.5 * clamp(photoP, 0.0, 1.0));
    } else {
        // outside: the distance estimate draws the filaments and antennae
        float r = length(z);
        float de = 0.5 * r * log(r) / max(length(dz), 1e-6);
        float px = reach * 3.0 / resolution.y;
        float fil = 1.0 - smoothstep(0.0, px * 3.0, de);
        vec3 tone = imgPalette(0.5 + 0.02 * esc + 0.03 * audioPhase);
        col = imgLod(uv, 2.5) * 0.12 + mix(tone, vec3(1.0), 0.4) * fil * (0.6 + 0.8 * clamp(audioKick, 0.0, 1.0));
    }
    finish(col);
}
