//@doc
 * @brief TEXTURE OP WAVES: an op-art painting in motion -- fine parallel
 * stripes that swell, pinch and ripple in waves so the flat surface seems
 * to billow like cloth; the photograph bends the stripes (its bright parts
 * push them apart, dark parts pull them together), so each photo creates
 * its own landscape of optical folds; the stripes run in interleaved
 * colours taken from the photo, and a slow wave travels through them.
 * Endless, mirrorable.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the waves travel (integrated, jump-free)
 *   audioSpread     -> how strongly the photo bends the stripes
 *   audioHarmChange -> the stripe direction turns (slow, smoothed)
 *   audioMode       -> palette: black/white in minor, photo colours in major
 *   audioKick       -> the light stripes brighten (light)
 *   audioSwell      -> wave height (slow)
 *
 * Knobs: stripeP (stripe density), bendP (base bending), colourP (colour stripes), hueP.
//@params stripeP bendP colourP
//@audio audioSpread audioHarmChange audioMode audioKick audioSwell
//@body
void main()
{
    vec2 p = screenP();
    float kick = clamp(audioKick, 0.0, 1.0);
    float swell = clamp(audioSwell, 0.0, 1.0);
    float T = 0.05 * sceneTime + 0.4 * audioAdvance;
    float dirA = 0.3 * sin(0.01 * sceneTime) + 0.3 * clamp(audioHarmChange, 0.0, 1.0);
    vec2 d = vec2(cos(dirA), sin(dirA));
    vec2 uv = p * 0.6 + 0.5 + vec2(0.003, 0.002) * sceneTime;
    float h = luma(imgLod(uv, 5.5));
    float bend = (0.3 + 0.7 * clamp(bendP, 0.0, 1.0)) * (0.5 + clamp(audioSpread, 0.0, 1.0));
    float N = 22.0 + 30.0 * clamp(stripeP, 0.0, 1.0);
    float wave = (0.25 + 0.35 * swell) * sin(dot(p, vec2(-d.y, d.x)) * 3.0 + T * 2.0) * sin(dot(p, d) * 1.3 - T * 1.3);
    float ph = dot(p, d) + 0.25 * bend * (h - 0.5) + 0.05 * wave + 0.02 * sin(dot(p, vec2(-d.y, d.x)) * 7.0 + T * 3.0);
    float x = ph * N;
    float px = fwidth(x) + 1e-4;
    // Stripe duty cycle varies too (swelling stripes): part of the op effect.
    float duty = 0.5 + 0.25 * sin(dot(p, vec2(-d.y, d.x)) * 2.0 - T) * (0.5 + swell);
    float f = fract(x);
    float s = smoothstep(duty - px, duty + px, f) * (1.0 - smoothstep(1.0 - px, 1.0, f)) + smoothstep(px, 0.0, f);
    s = 1.0 - clamp(s, 0.0, 1.0);                              // 1 on the light stripe
    // Colour: which stripe we are on (space), alternating palette colours.
    float k = floor(x);
    float mode = clamp(audioMode, 0.0, 1.0);
    vec3 c1 = imgPalette(fract(k * 0.137 + hueP * 0.159));
    c1 = c1 / max(max(c1.r, max(c1.g, c1.b)), 0.2);
    vec3 light = mix(vec3(0.95), c1 * 0.95, clamp(colourP, 0.0, 1.0) * (0.3 + 0.7 * mode));
    vec3 dark = mix(vec3(0.03), c1 * 0.12, 0.5 * clamp(colourP, 0.0, 1.0));
    // Fade the stripes to their mean where they get finer than a pixel.
    float fine = smoothstep(0.35, 0.6, px);
    vec3 col = mix(dark, light * (1.0 + 0.3 * kick), mix(s, duty, fine));
    finish(col);
}
