//@doc
 * @brief SMITH CHART INVERSION: a Smith chart: the plane is mapped onto a disc by z -> (z-1)/(z+1) and ruled by circles of resistance and reactance, with the photo as the filling; the disc wanders over the photo.  Inside the disc the photo is seen through the map (an inversion that pulls the
 * far parts to the rim), and the circles are drawn over it in thin lines.
 *
 * Audio Reactivity (structure, not only light):
 *   audioHarmAdvance -> the reactance angle turns the disc's mapping (integrated)
 *   audioAdvance     -> the photo wanders through the map
 *
 * Knobs: sizeP (the size of the disc), hueP.
//@params sizeP
//@audio audioAdvance audioHarmAdvance
//@body
vec2 cdiv(vec2 a, vec2 b)
{
    return vec2(a.x * b.x + a.y * b.y, a.y * b.x - a.x * b.y) / dot(b, b);
}
void main()
{
    vec2 p = screenP();
    float Rd = 0.4 + 0.1 * clamp(sizeP, 0.0, 1.0);
    vec2 w = p / Rd;
    float rw = length(w);
    float psi = 0.1 * audioHarmAdvance + 0.04 * sceneTime;
    vec2 wr = rot2(psi) * w;
    vec2 z = cdiv(vec2(1.0, 0.0) + wr, vec2(1.0, 0.0) - wr);
    vec2 off = 0.08 * vec2(sin(0.02 * audioAdvance + 0.03 * sceneTime), cos(0.017 * audioAdvance));
    vec3 inside = imgLod(z * 0.12 + 0.5 + off, 1.5 + 0.8 * smoothstep(0.7, 1.0, rw));
    vec3 outside = imgLod(p * 0.85 + 0.5, 1.2) * 0.35;
    float disc = 1.0 - smoothstep(0.985, 1.0, rw);
    float lines = 0.0;
    float rr[5];
    rr[0] = 0.2; rr[1] = 0.5; rr[2] = 1.0; rr[3] = 2.0; rr[4] = 5.0;
    for (int i = 0; i < 5; ++i) {
        float r = rr[i];
        vec2 c1 = vec2(r / (1.0 + r), 0.0);
        float R1 = 1.0 / (1.0 + r);
        lines += 1.0 - smoothstep(0.0, 0.012, abs(length(wr - c1) - R1));
        vec2 c2 = vec2(1.0, 1.0 / r);
        float R2 = 1.0 / r;
        lines += 1.0 - smoothstep(0.0, 0.012, abs(length(wr - c2) - R2));
        vec2 c3 = vec2(1.0, -1.0 / r);
        lines += 1.0 - smoothstep(0.0, 0.012, abs(length(wr - c3) - R2));
    }
    lines *= disc;
    vec3 col = mix(outside, inside * 1.1, disc);
    col = mix(col, vec3(1.0, 0.92, 0.7), clamp(lines, 0.0, 1.0) * 0.55);
    float rim = (1.0 - smoothstep(0.0, 0.015, abs(rw - 1.0)));
    col = mix(col, vec3(1.0), rim * 0.7);
    finish(col);
}
