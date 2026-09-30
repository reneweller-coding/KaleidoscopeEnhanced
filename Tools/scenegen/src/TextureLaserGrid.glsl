//@doc
 * @brief TEXTURE LASER GRID: a laser show in haze -- fans of thin coloured
 * beams sweep through a smoky room from several projectors, crossing into
 * shimmering grids and tunnels, the beams visible only where they cut
 * through the haze, flaring where they cross; the photograph is projected
 * as a laser-scanned image (glowing contour lines) on the far wall.
 * Endless, mirrorable.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the fans sweep (integrated, jump-free)
 *   audioPhase      -> the fans rotate (integrated)
 *   audioSpread     -> the fan opening
 *   audioKick       -> the beams flash (light)
 *   audioMode       -> palette: green-cyan in minor, red-magenta in major
 *   audioSwell      -> the haze density (slow)
 *
 * Knobs: beamP (beams per fan), projP (projectors), wallP (the photo on the wall), hueP.
//@params beamP projP wallP
//@audio audioPhase audioSpread audioKick audioMode audioSwell
//@body
void main()
{
    vec2 p = screenP();
    float kick = clamp(audioKick, 0.0, 1.0);
    float swell = clamp(audioSwell, 0.0, 1.0);
    float mode = clamp(audioMode, 0.0, 1.0);
    float T = 0.2 * sceneTime + 1.2 * audioAdvance;
    // Haze.
    float haze = (0.4 + 0.6 * swell) * (0.5 + 0.8 * fbm(p * 1.5 + vec2(0.03 * sceneTime, 0.0)));
    vec3 col = vec3(0.01);
    // The far wall: the photo scanned as glowing contour lines.
    vec2 uv = p * 0.5 + 0.5;
    float l = luma(imgLod(uv, 2.5)) * 6.0;
    float px = fwidth(l) + 1e-4;
    float contour = smoothstep(px * 1.5, 0.0, abs(fract(l) - 0.5) - 0.5 + px * 1.5);
    vec3 laserA = mix(vec3(0.2, 1.0, 0.4), vec3(1.0, 0.15, 0.3), mode);
    vec3 laserB = mix(vec3(0.2, 0.8, 1.0), vec3(1.0, 0.2, 0.9), mode);
    col += mix(laserA, laserB, fract(l * 0.2)) * contour * 0.25 * clamp(wallP + 0.2, 0.0, 1.2);
    // Projectors: fans of beams from points along the edges (repeated so the plane is endless).
    float nP = 2.0 + 2.0 * clamp(projP, 0.0, 1.0);
    float nB = 6.0 + 10.0 * clamp(beamP, 0.0, 1.0);
    float open = 0.3 + 0.8 * clamp(audioSpread, 0.0, 1.0);
    for (int k = 0; k < 4; ++k) {
        float fk = float(k);
        float on = smoothstep(fk - 0.5, fk + 0.5, nP - 0.5);
        if (on <= 0.0) break;
        vec2 src = vec2(mod(fk * 1.1 + 0.4, 2.2) - 1.1, fk < 2.0 ? -0.62 : 0.62);
        float base = (fk < 2.0 ? 1.5708 : -1.5708) + 0.5 * sin(T + fk * 1.7) + 0.3 * audioPhase * (mod(fk, 2.0) < 0.5 ? 1.0 : -1.0);
        vec2 d = p - src;
        float a = atan(d.y, d.x) - base;
        a = mod(a + 3.14159265, 6.2831853) - 3.14159265;
        float r = length(d);
        // Beams: evenly spaced angles inside the fan.
        float fan = a / open * nB;
        float bi = floor(fan + 0.5);
        float inFan = step(abs(bi), nB * 0.5);
        float da = abs(fan - bi) * open / nB * r;                // screen distance to the nearest beam
        float beam = exp(-da * da / 0.000004) * inFan * smoothstep(0.02, 0.1, r);
        vec3 bc = mod(bi + fk, 2.0) < 0.5 ? laserA : laserB;
        bc = mix(bc, glowColour(imgLod(vec2(0.5), 6.0), vec2(fk, bi), hueP * 0.159), 0.15);
        col += bc * beam * (0.3 + 1.2 * haze) * (1.0 + 1.5 * kick) * on;
        col += bc * exp(-r * 20.0) * 0.5 * on;                 // the projector aperture
    }
    col += vec3(0.02, 0.02, 0.03) * haze;
    finish(col);
}
