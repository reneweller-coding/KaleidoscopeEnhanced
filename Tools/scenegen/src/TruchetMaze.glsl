//@doc
 * @brief TRUCHET MAZE: an endless Truchet labyrinth -- every cell holds two
 * quarter-circle bands that join the neighbours' bands into long winding
 * loops, never ending, never branching; in the bands the kaleidoscoped
 * photograph flows like liquid through tubes, lit as rounded pipes, while the
 * gaps between them show the photo dim and far away.  Two layers of
 * different size lie over each other, the whole field drifting and slowly
 * turning; waves of light travel through the pipes with the music.
 * No up or down: endless, mirrorable.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the field drifts, the photo flows through the pipes (integrated, jump-free)
 *   audioPhase      -> the colour field wanders (integrated)
 *   audioSwell      -> the pipes swell (slow)
 *   audioKick       -> light waves in the pipes flash (light)
 *   audioMode       -> the palette: cool in minor, warm in major
 *
 * Knobs: cellP (cell size), widthP (pipe width), layerP (second layer),
 * styleP (photo pipes / neon pipes), hueP.
//@params cellP widthP layerP styleP
//@audio audioKick audioMode audioSwell
//@body
// One Truchet layer: returns the band's cross coordinate (0 at the centre
// line, 1 at the edge; > 1 outside) and the band direction.
float truchet(vec2 x, float w, out vec2 dir)
{
    vec2 id = floor(x), f = fract(x) - 0.5;
    float h = hash21(id);
    float sx = h > 0.5 ? -1.0 : 1.0;                          // the cell's orientation, fixed per cell
    f.x *= sx;
    vec2 d1 = f - vec2(0.5), d2 = f + vec2(0.5);
    float e1 = abs(length(d1) - 0.5), e2 = abs(length(d2) - 0.5);
    vec2 dv = e1 < e2 ? d1 : d2;
    dir = normalize(vec2(-dv.y, dv.x)) * vec2(sx, 1.0);
    return min(e1, e2) / w;
}

void main()
{
    vec2 p = screenP();
    float kick = clamp(audioKick, 0.0, 1.0);
    float swell = clamp(audioSwell, 0.0, 1.0);
    float mode = clamp(audioMode, 0.0, 1.0);
    float T = 0.05 * sceneTime + 0.35 * audioAdvance;
    float cells = 3.0 + 7.0 * (1.0 - clamp(cellP, 0.0, 1.0));
    float w = (0.08 + 0.12 * clamp(widthP, 0.0, 1.0)) * (0.85 + 0.3 * swell);
    vec2 x = rot2(0.012 * sceneTime) * p * cells + vec2(0.9 * T, 0.5 * T) + 17.0;
    float px = fwidth(x.x);
    vec2 dir1, dir2;
    float c1 = truchet(x, w, dir1);
    float c2 = truchet(x * 0.5 + 3.7, w * 0.8, dir2);            // the second, larger layer
    float lay = smoothstep(0.1, 0.9, clamp(layerP, 0.0, 1.0));
    // Photo: the background far and dim, the pipes carry it flowing along.
    vec2 uv = p * 0.5 + 0.5;
    vec3 back = imgK(uv * 0.7 + 0.15, 3.0) * 0.18;
    float hueF = hueP * 0.159 + 0.12 * audioPhase + 0.3 * mode;
    vec3 col = back;
    for (int L = 0; L < 2; ++L) {
        float cc = L == 0 ? c2 : c1;
        vec2 dir = L == 0 ? dir2 : dir1;
        float on = L == 0 ? lay : 1.0;
        float pxL = px / w * (L == 0 ? 0.5 : 1.0) * 1.2;
        float band = smoothstep(1.0 + pxL, 1.0 - pxL, cc) * on;
        if (band <= 0.0) continue;
        float round_ = sqrt(max(1.0 - cc * cc, 0.0));          // pipe profile
        vec2 fuv = uv + vec2(0.7, 0.4) * T * 0.3 + (L == 0 ? 0.37 : 0.0);   // flowing (integrated); not along dir: it flips at cell borders
        vec3 ph = imgK(fuv, 1.5);
        float m = luma(ph);
        vec3 field = hsv2rgb(vec3(fract(hueF + 0.25 * m + 0.35 * float(L) + 0.1 * (x.x + x.y) * 0.05), 0.7, 1.0));
        vec3 pipe = mix(max((ph - m) * 1.4 + m, 0.0) * mix(vec3(1.0), field, 0.35), field * (0.3 + 1.2 * m), smoothstep(0.3, 0.7, clamp(styleP, 0.0, 1.0)));
        pipe *= 0.35 + 0.75 * round_;
        pipe += vec3(1.0) * pow(round_, 12.0) * (0.15 + 0.3 * swell);   // highlight along the pipe's crest
        // light waves travelling through the pipes
        float wave = pow(0.5 + 0.5 * sin(dot(x, vec2(0.7, 0.4)) * 2.0 - T * 12.0 + float(L) * 2.0), 8.0);
        pipe += field * wave * (0.25 + 0.9 * kick) * round_;
        col = mix(col, pipe, band);
        col *= 1.0 - 0.35 * smoothstep(1.0, 1.35, cc) * (1.0 - band) * on;   // the pipe's shadow
    }
    finish(col);
}
