//@doc
 * @brief TEXTURE PHOSPHOR TRAILS: an old vector display drawing the
 * photograph -- a bright beam traces Lissajous-like figures whose shape is
 * steered by the picture, and on the long-persistence phosphor its path
 * glows and fades slowly behind it, so the screen fills with luminous
 * curves in green (or amber), brightest where the beam lingers; faint
 * scan grain and the glass's curvature vignette.  Endless, mirrorable.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the figures evolve (integrated, jump-free)
 *   audioSpread     -> the figures' size
 *   audioKick       -> the beam flares (light)
 *   audioMode       -> phosphor: P1 green in minor, P3 amber in major
 *   audioRoughness  -> jitter on the beam
 *   audioSwell      -> the persistence (slow)
 *
 * Knobs: freqP (figure complexity), beamP (beam width), photoP (the picture steers the beam), hueP.
//@params freqP beamP photoP
//@audio audioSpread audioKick audioMode audioRoughness audioSwell
//@body
void main()
{
    vec2 p = screenP();
    float kick = clamp(audioKick, 0.0, 1.0);
    float swell = clamp(audioSwell, 0.0, 1.0);
    float mode = clamp(audioMode, 0.0, 1.0);
    float rough = clamp(audioRoughness, 0.0, 1.0);
    // Tiled across the plane: each tile its own display figure (endless).
    vec2 tile = floor(p * 1.2 + 0.5);
    vec2 l = p * 1.2 - tile;                                    // -0.5..0.5
    float T = 0.05 * sceneTime + 0.3 * audioAdvance;
    float fx = 2.0 + floor(3.0 * clamp(freqP, 0.0, 1.0)) + hash21(tile);
    float fy = 3.0 + floor(3.0 * clamp(freqP, 0.0, 1.0)) + hash21(tile + 1.0);
    float pers = 0.6 + 1.2 * swell;                             // how far back along the path the glow reaches
    float bw = 0.004 + 0.006 * clamp(beamP, 0.0, 1.0);
    float glow = 0.0, core = 0.0, head = 0.0;
    float skewMax = 0.6 * clamp(photoP, 0.0, 1.0);
    float size = (0.26 + 0.1 * clamp(audioSpread, 0.0, 1.0)) / (1.0 + abs(skewMax));
    float t0 = sceneTime * 0.8;
    // The picture steers the figure: per tile, its broad light sets phase and skew.
    vec3 tp = imgLod(tile * 0.17 + 0.5 + vec2(0.01, 0.007) * sceneTime, 5.0);
    float steer = clamp(photoP, 0.0, 1.0);
    float ph1 = steer * 3.0 * luma(tp), skew = steer * 0.6 * (tp.r - tp.b);
    vec2 prev = vec2(0.0);
    for (int i = 0; i <= 96; ++i) {
        float s = float(i) / 96.0;
        float t = t0 - s * pers * 6.0;
        vec2 pt = vec2(sin(fx * t * 0.5 + T * 2.0 + ph1), sin(fy * t * 0.5 + T * 1.3 + 1.57));
        pt.x += skew * pt.y;
        pt += rough * 0.02 * vec2(noise2(vec2(t * 30.0, 0.0)), noise2(vec2(0.0, t * 30.0)));
        pt *= size;
        if (i == 0) head = exp(-length(l - pt) / (bw * 2.0));
        else {
            float d = sdSeg(l, prev, pt);
            float fade = exp(-s * 3.0);
            core = max(core, smoothstep(bw * 2.0, 0.0, d) * fade);   // max: no bright dots at the joints
            glow += exp(-d / (bw * 6.0)) * fade * (1.0 / 96.0) * 5.0;
        }
        prev = pt;
    }
    glow = core + glow * 0.3;
    vec3 ph = mix(vec3(0.3, 1.0, 0.45), vec3(1.0, 0.7, 0.2), mode);
    ph = mix(ph, glowColour(imgLod(vec2(0.5) + tile * 0.1, 5.0), tile, hueP * 0.159), 0.15);
    vec3 col = ph * glow * 0.6 + mix(ph, vec3(1.0), 0.6) * head * (0.8 + 1.5 * kick);
    // Scan grain and tube vignette per tile.
    col *= 0.93 + 0.07 * sin(gl_FragCoord.y * 1.5);
    col *= smoothstep(0.62, 0.45, length(l));
    col += ph * 0.008;
    finish(col);
}
