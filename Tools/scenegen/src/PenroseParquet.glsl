//@doc
 * @brief PENROSE PARQUET: an endless quasi-periodic rhombus tiling built from de
 * Bruijn's multigrid (Penrose, Ammann-Beenker, 12- and 14-fold) -- thick and thin rhombi that never repeat, the whole
 * floor drifting and slowly turning.  Every rhombus is a pane of its own
 * showing the kaleidoscoped photograph in its own turning frame, set in thin
 * grout; light runs along the de Bruijn ribbons (the endless chains of tiles
 * sharing one edge direction) in waves carried by the music, and the panes
 * stand out as a relief.  Five-fold, no up or down: endless, mirrorable.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the ribbon waves travel, the floor drifts (integrated, jump-free)
 *   audioPhase      -> the photo frames in the panes turn (integrated)
 *   audioSwell      -> the panes rise into relief, the grout widens (slow)
 *   audioKick       -> the wave crests flash (light)
 *   audioMode       -> the palette: thick and thin tiles cool in minor, warm in major
 *
 * Knobs: tileP (tile size), styleP (photo panes / stained glass / ribbon light),
 * ribbonP (how strongly the ribbons glow), groutP (grout width), gridP (the
 * symmetry, rolled per start: 8-fold Ammann-Beenker, 10-fold Penrose, 12-fold,
 * 14-fold -- de Bruijn's multigrid with 4, 5, 6 or 7 line families), hueP.
//@params tileP styleP ribbonP groutP gridP
//@audio audioKick audioMode audioSwell
//@body
// (the chain library is pulled in for the pentagrid; this scene has no chain)
vec2 chain(vec2 p) { return p; }

void main()
{
    vec2 p = screenP();
    float kick = clamp(audioKick, 0.0, 1.0);
    float swell = clamp(audioSwell, 0.0, 1.0);
    float mode = clamp(audioMode, 0.0, 1.0);
    float T = 0.04 * sceneTime + 0.3 * audioAdvance;
    float cells = 3.0 + 4.0 * (1.0 - clamp(tileP, 0.0, 1.0));
    vec2 x = rot2(0.01 * sceneTime) * p * cells + vec2(1.7 * T, 0.9 * T) + 40.0;
    float px = fwidth(x.x);                                    // before the search: no derivatives in branches
    float N = 4.0 + floor(clamp(gridP, 0.0, 0.999) * 4.0);   // 4..7 line families
    vec2 ab, base, nrs; int r, s;
    bool ok = multiGridFind(x * (5.0 / N), N, ab, r, s, base, nrs);
    float ang = min(float(s - r), N - float(s - r));        // the rhombus' angle class
    bool thick = mod(ang, 2.0) > 0.5;
    float h = hash21(floor(base * 3.0 + 0.5));
    // Pane content: the kaleidoscoped photo in the tile's own turning frame.
    vec2 er = gridE(r, N), es = gridE(s, N);
    vec2 local = (ab.x - 0.5) * er + (ab.y - 0.5) * es;
    vec2 puv = 0.5 + rot2(h * 6.28 + 0.2 * audioPhase + 0.02 * sceneTime) * local * 0.45 + 0.3 * hash22(base);
    vec3 ph = imgK(puv, 1.5);
    vec3 cool = thick ? vec3(0.55, 0.75, 1.1) : vec3(0.95, 0.6, 1.05);
    vec3 warm = thick ? vec3(1.15, 0.8, 0.5) : vec3(1.05, 0.55, 0.45);
    vec3 tint = mix(cool, warm, mode);
    // Relief: the pane rises toward its middle (distance to the nearest edge).
    vec2 f = min(ab, 1.0 - ab);
    float e = min(f.x, f.y);                                   // 0 at the edges
    float grout = (0.02 + 0.05 * clamp(groutP, 0.0, 1.0)) * (0.8 + 0.5 * swell);
    float pane = smoothstep(grout - px * 0.7, grout + px * 0.7, e);
    float bevel = smoothstep(grout, grout + 0.12 + 0.1 * swell, e);
    // Ribbons: each tile lies on ribbon n_r of family r and n_s of family s;
    // waves run along the ribbon numbers (integrated), so light travels
    // through the tiling along the quasi-periodic worms.
    float w1 = pow(0.5 + 0.5 * sin(nrs.x * 1.3 - T * 6.0 + float(r) * 1.7), 6.0);
    float w2 = pow(0.5 + 0.5 * sin(nrs.y * 1.1 - T * 5.0 + float(s) * 2.3), 6.0);
    float ribbon = max(w1, w2) * (0.3 + 1.2 * clamp(ribbonP, 0.0, 1.0));
    // Each tile its own hue (thick and thin half a turn apart), wandering with
    // the music; the ribbons glow in the hue of their family.
    float hue = hueP * 0.159 + 0.12 * audioPhase + 0.3 * mode + h * 0.22 + ang * 0.29;
    vec3 paneC = hsv2rgb(vec3(fract(hue), 0.75, 1.0));
    vec3 ribC = hsv2rgb(vec3(fract(hueP * 0.159 + 0.12 * audioPhase + float(w1 > w2 ? r : s) * 0.2), 0.85, 1.0));
    // Three looks, one knob.
    float st = clamp(styleP, 0.0, 1.0) * 2.0;
    vec3 photoPane = max((ph - luma(ph)) * 1.4 + luma(ph), 0.0) * mix(tint, paneC, 0.35) * 1.3 * (0.55 + 0.45 * bevel) * (0.8 + 0.3 * h);
    vec3 glass = paneC * (0.25 + 1.1 * luma(ph)) * (0.55 + 0.45 * bevel);
    vec3 lightC = photoPane * 0.25 + ribC * ribbon * 1.2 * (0.3 + 0.7 * bevel);
    vec3 col = mix(photoPane, glass, smoothstep(0.0, 1.0, st));
    col = mix(col, lightC, smoothstep(1.0, 2.0, st));
    col += ribC * ribbon * (0.35 + 0.9 * kick) * (0.4 + 0.6 * bevel);
    vec3 glow = ribC;
    // Grout: dark lead, catching a little ribbon light.
    vec3 lead = vec3(0.03, 0.03, 0.04) + glow * ribbon * 0.08;
    col = mix(lead, col, pane);
    if (!ok) col = lead;
    col = mix(col, col * glowColour(imgLod(p * 0.5 + 0.5, 6.0), p, hueP * 0.159) * 1.2, 0.05);
    finish(col);
}
