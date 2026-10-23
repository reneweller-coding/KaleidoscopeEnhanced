//@doc
 * @brief WOVEN CANE HEXAGON WEBBING: cane webbing: the hexagonal weave of rattan, in which three directions of thread make holes; the photo shines through the holes and colours the threads, and the light glides across the weave.  Three sets of strands at sixty degrees, over and under, leave hexagonal openings; the
 * photo is seen through the openings, the strands are lit like cylinders by a light that wanders.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSpread  -> the width of the holes (smoothed)
 *   audioAdvance -> the light glides (integrated)
 *
 * Knobs: sizeP (the size of the weave), hueP.
//@params sizeP
//@audio audioSpread audioAdvance
//@body
void main()
{
    vec2 p = screenP();
    float S = 0.07 + 0.06 * clamp(sizeP, 0.0, 1.0);
    float la = 0.02 * audioAdvance + 0.04 * sceneTime;
    vec2 Ld = vec2(cos(la), sin(la));
    float wdt = 0.16 + 0.1 * (1.0 - clamp(audioSpread, 0.0, 1.0));
    float strand = 0.0;
    vec3 scol = vec3(0.0);
    float depth = 0.0;
    float best = 0.0;
    for (int k = 0; k < 3; ++k) {
        float fk = float(k);
        float a = 1.0471976 * fk + 0.2618;
        vec2 ax = vec2(cos(a), sin(a));
        vec2 nx = vec2(-ax.y, ax.x);
        float s = dot(p, nx) / S;
        float u = dot(p, ax) / S;
        float fr = fract(s) - 0.5;
        float over = 0.5 + 0.5 * sin(6.2831853 * (u * 0.5 + fk / 3.0));
        float cyl = sqrt(max(1.0 - (fr / wdt) * (fr / wdt), 0.0));
        float on = 1.0 - smoothstep(wdt * 0.85, wdt, abs(fr));
        float z = over * 0.6 + fk * 0.001;
        if (on > 0.0 && z > depth) {
            depth = z;
            best = on;
            float lit = 0.4 + 0.7 * clamp(dot(vec2(cyl * sign(fr), 0.0) + 0.0, vec2(1.0, 0.0)) * 0.0 + dot(Ld, nx) * fr / wdt * 0.5 + 0.5 * cyl, 0.0, 1.0);
            vec3 c = imgLod(p * 0.85 + 0.5 + 0.02 * fk, 1.2);
            c = mix(vec3(luma(c)), c, 1.2);
            scol = mix(vec3(0.55, 0.38, 0.2), c * 1.1, 0.35) * lit * (0.7 + 0.5 * over);
        }
    }
    vec3 thru = imgLod(p * 0.85 + 0.5, 0.8);
    thru = mix(vec3(luma(thru)), thru, 1.3);
    vec3 col = mix(thru * 1.1 + vec3(0.05), scol * 1.3, best);
    finish(col);
}
