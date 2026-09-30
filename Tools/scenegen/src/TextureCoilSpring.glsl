//@doc
 * @brief TEXTURE COIL SPRING: flying through the inside of an endless coil
 * -- a thick helical ribbon, wrapped in the photograph, winds around us
 * turn after turn into the distance, lit from inside so its inner face
 * glows and its edges catch the light; through the gaps between the
 * turns a second, slower coil turns in the opposite direction further
 * out, and behind it a dim glow.  The coil stretches and compresses like
 * a spring as we fly.  Endless, mirrorable.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the flight (integrated, jump-free)
 *   audioPhase      -> the coils turn (integrated)
 *   audioSpread     -> the spring stretches (wider gaps)
 *   audioKick       -> the edges flash (light)
 *   audioMode       -> the light: cool in minor, warm in major
 *   audioSwell      -> the glow behind (slow)
 *
 * Knobs: turnsP (turn density), widthP (ribbon width), outerP (outer coil), hueP.
//@params turnsP widthP outerP
//@audio audioPhase audioSpread audioKick audioMode audioSwell
//@body
// One helical ribbon at radius R: returns (coverage, along, across) at depth z.
vec3 coil(float z, float a, float pitch, float width, float turn)
{
    float u = z / pitch - (a + turn) / 6.2831853;              // turn coordinate (continuous across the atan cut)
    float f = fract(u);
    float c = abs(f - 0.5) * 2.0;                              // 0 at the ribbon's centre line
    return vec3(c, u, f);
}

void main()
{
    vec2 p = screenP();
    float kick = clamp(audioKick, 0.0, 1.0);
    float swell = clamp(audioSwell, 0.0, 1.0);
    float mode = clamp(audioMode, 0.0, 1.0);
    float r = max(length(p), 1e-4);
    float a = atan(p.y, p.x);
    vec2 cs = vec2(cos(a), sin(a));
    float travel = 0.5 * sceneTime + 3.0 * audioAdvance;
    float turn = 0.05 * sceneTime + 0.4 * audioPhase;
    float pitch = (0.5 + 0.8 * (1.0 - clamp(turnsP, 0.0, 1.0))) * (0.8 + 0.5 * clamp(audioSpread, 0.0, 1.0) + 0.1 * sin(0.2 * sceneTime));
    float width = 0.35 + 0.35 * clamp(widthP, 0.0, 1.0);
    vec3 lc = mix(vec3(0.7, 0.85, 1.1), vec3(1.15, 0.88, 0.65), mode);
    vec3 gc = glowColour(imgLod(vec2(0.5 + 0.1 * sin(0.02 * sceneTime), 0.5), 6.0), vec2(travel * 0.03, 0.0), hueP * 0.159);
    // Inner coil at radius 1.
    float z1 = 0.5 / r;
    vec3 c1 = coil(z1 + travel, a, pitch, width, turn);
    float px1 = (fwidth(z1) / pitch + length(fwidth(cs)) / 6.2831853) * 2.0 + 1e-4;
    float on1 = smoothstep(width + px1, width - px1, c1.x);
    vec2 uv1 = vec2(a / 3.14159265, (z1 + travel) / pitch * 0.25);   // continuous across the atan cut
    float fw1 = max(length(fwidth(cs)) / 3.14159265, fwidth(z1) / pitch * 0.25) * 1024.0;
    vec3 rib = imgLod(uv1 + vec2(0.0, (c1.z - 0.5) * 0.1), clamp(log2(max(fw1, 1.0)), 0.0, 9.0));
    float prof = sqrt(max(0.0, 1.0 - (c1.x / width) * (c1.x / width)));
    vec3 ribC = rib * lc * (0.4 + 0.8 * prof) * exp(-z1 * 0.08);
    float edge = exp(-abs(c1.x - width) / (px1 * 1.5));
    ribC += mix(gc, vec3(1.0), 0.5) * edge * (0.25 + 1.0 * kick) * exp(-z1 * 0.08);
    // Outer coil at radius 2 (seen through the gaps), counter-rotating, slower.
    float z2 = 1.0 / r;
    vec3 c2 = coil(z2 + travel * 0.6, -a, pitch * 1.3, width, -turn * 0.7);
    float px2 = (fwidth(z2) / pitch + length(fwidth(cs)) / 6.2831853) * 2.0 + 1e-4;
    float on2 = smoothstep(width + px2, width - px2, c2.x) * clamp(outerP + 0.2, 0.0, 1.0);
    vec3 rib2 = imgLod(vec2(-a / 3.14159265, (z2 + travel * 0.6) / pitch * 0.2 + 0.5), clamp(log2(max(fw1, 1.0)) + 1.0, 0.0, 9.0));
    vec3 rib2C = rib2 * lc * 0.45 * exp(-z2 * 0.1);
    vec3 back = gc * (0.08 + 0.5 * swell) * exp(-r * 2.0);
    vec3 col = mix(back, rib2C, on2);
    col = mix(col, ribC, on1);
    col += gc * exp(-r * 14.0) * (0.4 + swell);
    finish(col);
}
