//@doc
 * @brief TEXTURE CONTOUR NEON MAP: the photograph read as a landscape and
 * drawn as a glowing topographic map -- contour lines at every height
 * level, index contours brighter and thicker, the colour running through
 * a neon hypsometric scale from deep valleys to high peaks; the terrain
 * slowly heaves as the photo drifts, the contours sliding and merging,
 * and a scanning light line passes over the map.  Endless, mirrorable.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the terrain drifts (integrated, jump-free)
 *   audioSpread     -> the relief exaggeration (more contours)
 *   audioKick       -> the index contours flash (light)
 *   audioMode       -> the scale: cool (blue-violet) in minor, warm (orange-pink) in major
 *   audioSwell      -> the hillshade under the lines (slow)
 *   audioHigh       -> the scan line glints (light)
 *
 * Knobs: levelP (contour spacing), smoothP (terrain smoothness), fillP (colour fill between lines), hueP.
//@params levelP smoothP fillP
//@audio audioSpread audioKick audioMode audioSwell audioHigh
//@body
void main()
{
    vec2 p = screenP();
    float kick = clamp(audioKick, 0.0, 1.0);
    float hi = clamp(audioHigh * 1.5, 0.0, 1.0);
    float swell = clamp(audioSwell, 0.0, 1.0);
    float mode = clamp(audioMode, 0.0, 1.0);
    vec2 uv = p * 0.6 + 0.5 + vec2(0.004, 0.002) * sceneTime + vec2(0.03, 0.01) * audioAdvance;
    float lod = 2.5 + 2.5 * clamp(smoothP, 0.0, 1.0);
    float h = luma(imgLod(uv, lod)) + 0.1 * (fbm3(p * 1.5 + 0.01 * sceneTime) - 0.5);
    float ex = 8.0 + 16.0 * clamp(levelP, 0.0, 1.0) * (0.6 + 0.8 * clamp(audioSpread, 0.0, 1.0));
    float x = h * ex;
    float px = fwidth(x) + 1e-4;
    float f = abs(fract(x) - 0.5);
    float line = smoothstep(px * 1.5, 0.0, 0.5 - f);
    float idx = step(mod(floor(x + 0.5), 5.0), 0.5);
    float lineI = smoothstep(px * 3.0, 0.0, 0.5 - f) * idx;
    // Neon hypsometric colour.
    vec3 cold = hsv2rgb(vec3(fract(0.55 + 0.25 * h + hueP * 0.159), 0.8, 1.0));
    vec3 warm = hsv2rgb(vec3(fract(0.95 + 0.15 * h + hueP * 0.159), 0.8, 1.0));
    vec3 lc = mix(cold, warm, mode);
    // Hillshade under the lines.
    float e = exp2(lod) / 1024.0;
    vec2 g = vec2(luma(imgLod(uv + vec2(e, 0.0), lod)) - luma(imgLod(uv - vec2(e, 0.0), lod)),
                  luma(imgLod(uv + vec2(0.0, e), lod)) - luma(imgLod(uv - vec2(0.0, e), lod))) / (2.0 * e);
    float shade = clamp(0.5 + dot(normalize(vec3(-g * 0.02, 1.0)).xy, normalize(vec2(-0.6, 0.8))) * 2.0, 0.0, 1.0);
    vec3 col = vec3(0.01, 0.012, 0.02) + lc * (0.02 + 0.08 * clamp(fillP, 0.0, 1.0)) * (0.5 + h) + vec3(0.03) * shade * (0.3 + 0.9 * swell);
    col += lc * line * 0.8;
    col += mix(lc, vec3(1.0), 0.3) * lineI * (0.6 + 1.2 * kick);
    col += lc * exp(-(0.5 - f) / (px * 6.0)) * 0.1;
    // Scan line.
    float sy = mod(0.08 * sceneTime, 2.6) - 1.3;               // wraps well off-screen
    float scan = exp(-pow((p.y - sy * 0.6) / 0.004, 2.0)) + 0.3 * exp(-abs(p.y - sy * 0.6) / 0.05);
    col += mix(lc, vec3(1.0), 0.6) * scan * (0.15 + 0.5 * hi) * (0.3 + line);
    finish(col);
}
