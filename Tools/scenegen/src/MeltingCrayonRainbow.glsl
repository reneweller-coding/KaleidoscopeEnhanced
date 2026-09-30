//@doc
 * @brief MELTING CRAYON RAINBOW: rows of wax crayons melting down a canvas
 * under a hot-air blower -- along the top of each band a row of crayons
 * in the photograph's colours, and from each one a glossy rivulet of
 * molten wax runs down, splitting and splattering, the runs of
 * neighbouring colours braiding together; the drips grow slowly longer,
 * the bands repeat so the plane is endless.  Mirrorable.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the wax runs (integrated, jump-free)
 *   audioSpread     -> the runs splay sideways
 *   audioKick       -> the wet wax gleams (light)
 *   audioMode       -> the canvas: black in minor, white in major (blend)
 *   audioRoughness  -> splatter
 *   audioSwell      -> the runs grow longer (slow)
 *
 * Knobs: crayonP (crayons per band), bandP (band height), photoP (photo colours vs rainbow), hueP.
//@params crayonP bandP photoP
//@audio audioSpread audioKick audioMode audioRoughness audioSwell
//@body
void main()
{
    vec2 p = screenP();
    float kick = clamp(audioKick, 0.0, 1.0);
    float swell = clamp(audioSwell, 0.0, 1.0);
    float mode = smoothstep(0.3, 0.7, clamp(audioMode, 0.0, 1.0));
    float rough = clamp(audioRoughness, 0.0, 1.0);
    float bh = 0.7 + 0.6 * clamp(bandP, 0.0, 1.0);
    float yb = -p.y / bh + 0.3;
    float band = floor(yb);
    float fy = fract(yb);                                       // 0 at the crayon row, 1 at the band bottom
    float nC = 12.0 + 16.0 * clamp(crayonP, 0.0, 1.0);
    float x = p.x * nC * 0.5 + band * 0.37;
    float ci = floor(x);
    float fx = fract(x) - 0.5;
    float T = 0.05 * sceneTime + 0.3 * audioAdvance;
    vec3 canvas = mix(vec3(0.03), vec3(0.95, 0.94, 0.9), mode);
    vec3 col = canvas;
    // Crayon colour: rainbow order across, or the photo's colours.
    vec3 rain = hsv2rgb(vec3(fract(ci / nC + hueP * 0.159), 0.85, 0.95));
    vec3 pc = glowColour(imgLod(vec2(ci / nC * 2.0 + 0.2, band * 0.23 + 0.3), 3.0), vec2(ci, band), hueP * 0.159);
    vec3 cc = mix(rain, pc, clamp(photoP, 0.0, 1.0) * 0.8);
    // Runs: each crayon's rivulet down the band, wobbling, length growing.
    float h = hash21(vec2(ci, band));
    float len = (0.35 + 0.5 * swell) * (0.5 + 0.5 * h) * (0.8 + 0.2 * sin(T + h * 6.28));
    float spl = 0.08 + 0.2 * clamp(audioSpread, 0.0, 1.0);
    float wob = spl * (fbm3(vec2(ci * 3.1, fy * 3.0)) - 0.5) * 2.0 * fy;
    float runW = 0.32 * (1.0 - 0.6 * fy / max(len, 0.05)) * (0.8 + 0.4 * noise2(vec2(ci, fy * 8.0)));
    float px = fwidth(x) * 1.5;
    float run = smoothstep(runW + px, runW - px, abs(fx - wob)) * step(fy, len);
    // Drip head: a round bead at the end of the run.
    float head = smoothstep(0.3 + px, 0.3 - px, length(vec2(fx - wob, (fy - len) * nC * 0.5 * bh)));   // round in screen units
    float wax = max(run, head * step(0.1, len));
    // Splatter.
    vec2 sg = vec2(x * 2.0, fy * 20.0);
    vec2 si = floor(sg);
    float sp = smoothstep(0.3, 0.15, length(fract(sg) - 0.25 - 0.5 * hash22(si + band))) * step(0.97 - 0.06 * rough, hash21(si + band * 3.0)) * step(fy, len + 0.2);
    wax = max(wax, sp);
    // The crayon stub at the top.
    float stub = step(fy, 0.08) * smoothstep(0.42, 0.38, abs(fx));
    vec3 waxC = cc * (0.75 + 0.35 * (1.0 - abs(fx - wob) / 0.35));
    waxC += vec3(1.0) * pow(max(0.0, 1.0 - abs(fx - wob + 0.1) / 0.1), 6.0) * (0.15 + 0.5 * kick) * run;
    col = mix(col, waxC, wax);
    col = mix(col, cc * 0.8, stub);
    finish(col);
}
