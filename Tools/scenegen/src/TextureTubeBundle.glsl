//@doc
 * @brief TEXTURE TUBE BUNDLE: looking straight down a bundle of tubes -- a
 * honeycomb of round tubes, each one its own little tunnel lined with the
 * photograph, all flowing toward the viewer at their own pace, each ending
 * in its own coloured glow deep inside; the metal rims between them catch
 * the light, and the whole bundle turns slowly.  Tunnels of tunnels,
 * endless beyond the frame; mirrorable.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the flow through the tubes (integrated, jump-free)
 *   audioPhase      -> the bundle turns (integrated)
 *   audioSpread     -> how far the tubes' paces differ
 *   audioKick       -> the far glows flare (light)
 *   audioMode       -> glow colours: cool in minor, warm in major
 *   audioSwell      -> depth fog (slow)
 *
 * Knobs: tubeP (tube size), rimP (rim width), wallZoomP, hueP.
//@params tubeP rimP wallZoomP
//@audio audioPhase audioSpread audioKick audioMode audioSwell
//@body
void main()
{
    vec2 p = screenP();
    float kick = clamp(audioKick, 0.0, 1.0);
    float swell = clamp(audioSwell, 0.0, 1.0);
    float cs = 0.12 + 0.18 * clamp(tubeP, 0.0, 1.0);
    vec2 q = rot2(0.015 * sceneTime + 0.2 * audioPhase) * p / cs + vec2(0.02, 0.01) * sceneTime;
    // Hex cells.
    const vec2 s = vec2(1.0, 1.7320508);
    vec2 a = mod(q, s) - s * 0.5;
    vec2 b = mod(q - s * 0.5, s) - s * 0.5;
    vec2 l = dot(a, a) < dot(b, b) ? a : b;
    vec2 id = floor(q - l + 0.01);                               // cell identity (space only)
    float hexD = max(abs(l.x) * 0.866 + abs(l.y) * 0.5, abs(l.y));  // hex distance
    float rimW = 0.03 + 0.1 * clamp(rimP, 0.0, 1.0);
    float tubeR = 0.5 - rimW;
    float r = length(l);
    // Inside a tube: its own tunnel.
    float h = hash21(id);
    float pace = 1.0 + (h - 0.5) * 1.2 * clamp(audioSpread, 0.0, 1.0);
    float travel = (0.5 * sceneTime + 3.0 * audioAdvance) * pace + h * 10.0;
    float z = tubeR / max(r, 1e-3);
    float ang = atan(l.y, l.x) + h * 6.28;
    float wz = 0.3 + 0.4 * clamp(wallZoomP, 0.0, 1.0);
    vec2 uv = vec2(ang / 3.14159265, (z + travel) * wz * 0.5) + hash22(id);  // one full turn = 2 = one mirror period
    vec2 cfw = fwidth(vec2(cos(ang), sin(ang)));
    float fw = max(length(cfw) / 3.14159265, fwidth(z) * wz * 0.5) * 1024.0;
    vec3 wall = imgLod(uv, clamp(log2(max(fw, 1.0)), 0.0, 9.0));
    float mode = clamp(audioMode, 0.0, 1.0);
    vec3 gc = glowColour(imgLod(hash22(id + 3.0), 5.0), id * 0.2, hueP * 0.159 + h * 0.3);
    gc = mix(gc, mix(vec3(0.5, 0.7, 1.0), vec3(1.0, 0.65, 0.3), mode) * luma(gc) * 2.0, 0.3);
    float fog = exp(-z * (0.08 + 0.12 * swell));
    // Rings of light travelling down each tube.
    float ring = pow(0.5 + 0.5 * sin((z + travel) * 2.0), 12.0);
    vec3 tube = wall * (0.35 + 0.75 * smoothstep(1.0, 2.5, z)) + gc * ring * 0.5;
    tube = mix(gc * (0.4 + 1.2 * kick), tube, fog);
    tube += gc * exp(-r / tubeR * 8.0) * (0.6 + 1.5 * kick);
    // Rims: brushed metal, lit from the upper left.
    vec3 rimC = imgLod(q * 0.05 + 0.5, 3.0) * 0.3 + 0.18;
    float rl = 0.6 + 0.4 * dot(normalize(l + 1e-4), normalize(vec2(-0.6, 0.8)));
    rimC *= rl;
    float px = fwidth(r) * 1.2;
    float inTube = smoothstep(tubeR + px, tubeR - px, r);
    vec3 col = mix(rimC, tube, inTube);
    col += vec3(1.0, 0.97, 0.9) * exp(-abs(r - tubeR) / (px * 1.5)) * 0.25 * rl;   // lip highlight
    col *= 1.0 - 0.5 * smoothstep(0.46, 0.5, hexD);           // seams between rims
    finish(col);
}
