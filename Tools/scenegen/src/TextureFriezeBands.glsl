//@doc
 * @brief TEXTURE FRIEZE BANDS: a wall of stacked friezes -- horizontal bands
 * of the photograph, each band a different frieze symmetry (mirrored,
 * rotated, glided, translated) of its own strip of the picture, running
 * sideways at its own speed and direction like a many-layered ornamental
 * border, separated by gilded mouldings with rows of beads; the bands
 * breathe in height.  Endless, mirrorable.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the bands run (integrated, jump-free)
 *   audioSpread     -> the speed differences between the bands
 *   audioKick       -> the bead mouldings flash (light)
 *   audioMode       -> the gilding: silver in minor, gold in major
 *   audioRoughness  -> relief shading on the friezes
 *   audioSwell      -> band height breathing (slow)
 *
 * Knobs: bandP (band count), repeatP (motif width), mouldP (moulding width), hueP.
//@params bandP repeatP mouldP
//@audio audioSpread audioKick audioMode audioRoughness audioSwell
//@body
void main()
{
    vec2 p = screenP();
    float kick = clamp(audioKick, 0.0, 1.0);
    float swell = clamp(audioSwell, 0.0, 1.0);
    float mode = clamp(audioMode, 0.0, 1.0);
    float rough = clamp(audioRoughness, 0.0, 1.0);
    float nb = 3.0 + 4.0 * clamp(bandP, 0.0, 1.0);
    float y = p.y * nb * 0.5 + 0.08 * swell * sin(p.y * 3.0 + 0.2 * sceneTime);
    float bi = floor(y);
    float fy = fract(y);                                        // 0..1 in the band
    float h = hash11(bi * 0.731 + 5.0);
    float spd = (0.1 + 0.3 * clamp(audioSpread, 0.0, 1.0)) * (h - 0.5) * 2.0;
    float run = spd * (sceneTime * 0.5 + 3.0 * audioAdvance) + h * 10.0;
    float W = (0.4 + 0.6 * clamp(repeatP, 0.0, 1.0));          // motif width (in band heights)
    float x = (p.x * nb * 0.5 + run) / W;
    float xi = floor(x);
    vec2 f = vec2(fract(x), fy);
    // Frieze symmetry per band (7 frieze groups simplified to 4 looks).
    float kind = floor(h * 4.0);
    vec2 lf = f;
    if (kind < 0.5) lf.x = abs(lf.x - 0.5) * 2.0;                                    // mirror (pma)
    else if (kind < 1.5) lf = mod(xi, 2.0) < 0.5 ? lf : vec2(1.0 - lf.x, 1.0 - lf.y); // half-turn (p2)
    else if (kind < 2.5) lf.y = mod(xi, 2.0) < 0.5 ? lf.y : 1.0 - lf.y;               // glide (p11g)
    else { lf.x = abs(lf.x - 0.5) * 2.0; lf.y = abs(lf.y - 0.5) * 2.0; }              // double mirror (pmm)
    vec2 uv = vec2(lf.x * W * 0.25, lf.y * 0.25) + vec2(h * 0.7, fract(h * 13.0) * 0.7);
    vec3 ph = imgLod(uv, 0.8);
    // Relief shading from the photo.
    vec2 g = texGrad(uv, 2.0) * 0.01 * (0.3 + rough);
    ph *= 0.85 + clamp(-g.x - g.y, -0.3, 0.3);
    vec3 col = ph * mix(vec3(0.9, 0.95, 1.05), vec3(1.05, 0.98, 0.9), mode);
    // Mouldings at the band edges with beads.
    float mw = 0.06 + 0.1 * clamp(mouldP, 0.0, 1.0);
    float e = min(fy, 1.0 - fy);
    float mould = smoothstep(mw, mw * 0.8, e);
    vec3 gilt = mix(vec3(0.75, 0.78, 0.82), vec3(1.0, 0.78, 0.35), mode);
    float bx = fract(p.x * nb * 2.0);
    float bead = smoothstep(0.35, 0.2, length(vec2(bx - 0.5, (e - mw * 0.5) / mw * 0.5)));
    float roundness = 0.5 + 0.5 * cos(e / mw * 3.14159);
    vec3 mc = gilt * (0.3 + 0.45 * roundness) * (0.7 + 0.3 * bead) + gilt * bead * pow(roundness, 4.0) * (0.15 + 0.8 * kick);
    col = mix(col, mc, mould);
    col = mix(col, col * glowColour(ph, vec2(bi, 0.0), hueP * 0.159) * 1.3, 0.08);
    finish(col);
}
