//@doc
 * @brief SHEARING MOSAIC: a mosaic of the photo sheared along two axes -- first every row slides by an amount that
 * grows row by row, then every column the same, so the picture breaks into staircases of tiles that slant and
 * tumble across each other; the shears swing back and the mosaic recomposes, whole, before it breaks again the
 * other way.  The grout between the tiles catches the light.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the shears swing (integrated: the music drives the mosaic apart and together)
 *   audioSwell      -> how far they swing
 *   audioKick       -> the grout flashes (light)
 *
 * Knobs: tilesP (tiles across), shearP (the base swing), groutP (grout width), hueP.
//@params tilesP shearP groutP
//@audio audioSwell audioKick
//@body
void main()
{
    vec2 p = screenP();
    float nx = floor(10.0 + 14.0 * clamp(tilesP, 0.0, 1.0)), ny = floor(nx * 0.5625 + 0.5);
    vec2 g = (p / vec2(1.7777778, 1.0) + 0.5) * vec2(nx, ny);
    float ph = 0.08 * sceneTime + 0.01 * audioAdvance;
    float amp = (0.3 + 0.6 * clamp(shearP, 0.0, 1.0)) * (0.6 + 0.6 * clamp(audioSwell, 0.0, 1.0));
    float s1 = amp * sin(ph), s2 = amp * sin(ph * 0.73 + 1.3);
    // undo the column shear, then the row shear (whole tiles slide: every tile keeps its picture)
    g.y -= s2 * (floor(g.x) - 0.5 * nx);
    g.x -= s1 * (floor(g.y) - 0.5 * ny);
    vec2 cell = vec2(mod(floor(g.x), nx), mod(floor(g.y), ny));
    vec2 f = fract(g);
    vec2 uv = (cell + f) / vec2(nx, ny);
    vec3 photo = imgLod(uv, 0.3);
    float gw = 0.03 + 0.07 * clamp(groutP, 0.0, 1.0);
    float grout = 1.0 - smoothstep(0.0, gw, min(min(f.x, 1.0 - f.x), min(f.y, 1.0 - f.y)));
    vec3 tone = imgPalette(0.35 + 0.03 * audioPhase);
    vec3 col = photo * (1.0 - 0.55 * grout) + mix(tone, vec3(1.0), 0.6) * grout * 0.2 * (0.4 + clamp(audioKick, 0.0, 1.0));
    finish(col);
}
