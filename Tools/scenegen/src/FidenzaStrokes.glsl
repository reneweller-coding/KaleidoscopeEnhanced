//@doc
 * @brief FIDENZA STROKES: fat curving ribbons of paint laid side by side
 * along a flow field, in the manner of generative flow-field art -- each
 * ribbon follows the field's curves, broken into strokes of different
 * lengths with rounded ends, the strokes coloured from the photograph's
 * palette, with a thin dark gap between neighbours and a subtle painted
 * texture inside each stroke.  The field slowly bends, so the whole
 * composition flows, ribbons are born and fade where the field turns.
 * Endless, mirrorable.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the strokes slide along their ribbons (integrated)
 *   audioSpread     -> ribbon width (few fat ones or many thin ones)
 *   audioRoughness  -> the painted texture inside the strokes
 *   audioMode       -> the palette: muted in minor, vivid in major
 *   audioKick       -> the strokes brighten (light)
 *   audioHarmChange -> the field bends further (slow, smoothed)
 *
 * Knobs: curlP (how much the field curls), strokeP (stroke length), gapP (gap width), hueP.
//@params curlP strokeP gapP
//@audio audioSpread audioRoughness audioMode audioKick audioHarmChange
//@body
float lcOf(vec3 c) { return 0.4 + 0.8 * luma(c); }
float streamFn(vec2 p, float t, float curl)
{
    return p.y + curl * (fbm3(p * 0.7 + vec2(t, 0.3 * t)) - 0.5) * 2.2 + 0.3 * sin(p.x * 0.8 + t * 0.7);
}

void main()
{
    vec2 p = screenP() * 3.0;
    float kick = clamp(audioKick, 0.0, 1.0);
    float t = 0.02 * sceneTime + 0.1 * clamp(audioHarmChange, 0.0, 1.0);
    float curl = 0.7 + 1.1 * clamp(curlP, 0.0, 1.0);
    float psi = streamFn(p, t, curl);
    float e = 0.01;
    vec2 gpsi = vec2(streamFn(p + vec2(e, 0.0), t, curl) - psi, streamFn(p + vec2(0.0, e), t, curl) - psi) / e;
    float N = 4.0 + 6.0 * clamp(audioSpread, 0.0, 1.0);
    float bandF = psi * N;
    float band = floor(bandF);
    float across = fract(bandF);                               // 0..1 across the ribbon
    // Along-ribbon coordinate: x warped slightly by the band's curve.
    vec2 tang = normalize(vec2(gpsi.y, -gpsi.x));
    float along = p.x + 0.3 * psi * tang.y + 0.15 * sceneTime * (0.5 + hash11(band)) + 0.6 * audioAdvance * (0.5 + hash11(band + 3.0));
    float segL = 0.35 + 1.2 * clamp(strokeP, 0.0, 1.0);
    float sa = along / segL + hash11(band * 1.7) * 7.0;
    float seg = floor(sa);
    float fs = fract(sa);
    // Pixel sizes for antialiasing.
    float pxA = length(gpsi) * N * 3.0 / resolution.y;          // across units per pixel
    float pxL = 3.0 / resolution.y / segL;                      // along units per pixel
    float gap = 0.06 + 0.12 * clamp(gapP, 0.0, 1.0);
    // Rounded stroke ends: an ellipse-ish cap in (along, across) space.
    float halfW = 0.5 - gap * 0.5;
    float ca = (across - 0.5);
    float capL = min(0.2, halfW * segL * 0.9 / segL);
    float ex = max(0.0, max(capL - fs, fs - (1.0 - capL))) / capL; // 0 in the body, 0..1 in the caps
    float r = sqrt(ex * ex + (ca / halfW) * (ca / halfW));
    float inStroke = smoothstep(1.0 + pxA / halfW * 1.5, 1.0 - pxA / halfW * 1.5, r);
    // Some strokes are missing (the field shows through).
    float present = step(0.12, hash21(vec2(band, seg) + 0.3));
    // Colour from the photo's palette.
    float mode = clamp(audioMode, 0.0, 1.0);
    vec2 cuv = vec2(hash21(vec2(band, seg)), hash21(vec2(seg, band) + 2.0));
    vec3 c = imgLod(cuv, 4.0);
    c = mix(c, glowColour(c, vec2(band, seg) * 0.3, hueP * 0.159), 0.35 + 0.3 * mode);
    c = mix(c, hsv2rgb(vec3(fract(hueP * 0.159 + 0.5 * hash21(vec2(band * 0.37, 1.0))), 0.75, 1.0)) * lcOf(c), step(0.8, hash21(vec2(seg, band) + 9.0)));
    float lc = luma(c);
    c = max(mix(vec3(lc), c, 0.9 + 0.8 * mode), 0.0);
    c = c / max(max(c.r, max(c.g, c.b)), 0.25) * (0.55 + 0.4 * hash21(vec2(band, seg) + 5.0));
    // Painted texture: bristle streaks along the stroke.
    float rough = clamp(audioRoughness, 0.0, 1.0);
    float bristle = noise2(vec2(fs * 3.0 * segL, across * 40.0) + vec2(seg, band) * 3.7);
    c *= 0.85 + (0.12 + 0.25 * rough) * (bristle - 0.5) * 2.0;
    c *= 0.85 + 0.3 * smoothstep(1.0, 0.0, r);                 // a little body shading
    vec2 uv = p / 3.0 * 0.8 + 0.5;
    vec3 ground = mix(vec3(0.93, 0.9, 0.84), imgLod(uv, 3.0), 0.25) * (0.35 + 0.25 * (1.0 - mode));
    vec3 col = mix(ground, c * (1.0 + 0.4 * kick), inStroke * present);
    finish(col);
}
