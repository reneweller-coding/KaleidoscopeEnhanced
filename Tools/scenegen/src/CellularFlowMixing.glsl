//@doc
 * @brief CELLULAR FLOW MIXING: a lattice of counter-rotating vortex cells whose whole pattern slides back and forth
 * -- the classic cellular flow made chaotic by its oscillation.  The frame starts as a checkerboard of photo tiles
 * (each cell its own cut, turned); the rolls wind every tile into its cell, and the sliding lets the tiles bleed
 * into their neighbours along the separatrices, until the board is a woven carpet; slowly the tiles come back.
 *
 * Audio Reactivity (structure, not only light):
 *   audioBeatPhase  -> the lattice slides back and forth once a beat (continuous)
 *   audioSwell      -> how far it slides (more chaos in loud passages)
 *   audioSectionId  -> each section changes the cell size (the velocity fields crossfade)
 *   audioKick       -> the separatrices flash (light)
 *
 * Knobs: cellsP (the first cell size), rollP (how fast the cells turn), freshP (how fast the tiles return), hueP.
//@params cellsP rollP freshP
//@audio audioSwell audioKick audioBeatPhase audioSectionId audioSectionAge
//@state 384 216 120 32
//@body
/**  The oscillating cellular flow: psi = sin(k (x - s)) sin(k y), with whole cells across the field.
 *
 * @param x  The point in cells. (in)
 * @param n  Cells on the field's height. (in)
 *
 * @return
 *   The velocity in cells per unit time (amplitude about 1).
 **/
vec2 cellular(vec2 x, float n)
{
    float nx = 2.0 * floor(0.5 * n * stateRes.x / stateRes.y + 0.5);
    vec2 k = 3.14159265 * vec2(nx, n) / stateRes;
    float slide = (0.3 + 0.9 * clamp(audioSwell, 0.0, 1.0)) * sin(6.2831853 * audioBeatPhase) / k.x;
    float sx = sin(k.x * (x.x - slide)), cx = cos(k.x * (x.x - slide));
    float sy = sin(k.y * x.y), cy = cos(k.y * x.y);
    return vec2(sx * cy, -cx * sy);
}

/**  One step of the photo carried by the cells for this cell (the state pass).
 *
 * @return
 *   The photo displacement (rg), 0, 1.
 **/
vec4 stateStep()
{
    if (stateFrame < 0.5) return vec4(0.0, 0.0, 0.0, 1.0);
    vec2 x = vec2(stCell()) + 0.5;
    float s = floor(clamp(cellsP, 0.0, 0.999) * 3.0) + max(audioSectionId, 0.0);
    float nNow = 4.0 + 2.0 * mod(s, 3.0), nBefore = 4.0 + 2.0 * mod(s + 2.0, 3.0);
    float w = audioSectionId < 0.5 ? 1.0 : smoothstep(0.0, 4.0, audioSectionAge);
    vec2 v = mix(cellular(x, nBefore), cellular(x, nNow), w);
    return stCarry(v * (0.2 + 0.5 * clamp(rollP, 0.0, 1.0)), 0.0008 + 0.003 * clamp(freshP, 0.0, 1.0));
}

void main()
{
    if (statePass == 1) { fragColor = stateStep(); return; }
    vec2 p = screenP();
    vec2 cc = stView(p, 1.0);
    vec2 uv = stUV(cc);
    float lod = stLod(cc, resolution.y / stateRes.y);
    // the tiles: the plain coordinate's checkerboard cell decides which cut of the photo a point carries
    vec2 tile = floor(uv * 4.0);
    vec2 inTile = fract(uv * 4.0);
    float h = hash21(mod(tile, 8.0));
    vec2 tuv = (h < 0.25 ? inTile : h < 0.5 ? vec2(1.0 - inTile.y, inTile.x) : h < 0.75 ? 1.0 - inTile : vec2(inTile.y, 1.0 - inTile.x));
    vec3 photo = imgLod(tuv * 0.5 + 0.25 * hash22(mod(tile, 8.0)) + 0.1, lod + 1.0);
    vec3 tone = imgPalette(h + 0.03 * audioPhase);
    vec3 col = mix(photo, photo * tone * 1.7, 0.25);
    float sep = smoothstep(1.5, 4.0, lod);
    col += mix(tone, vec3(1.0), 0.5) * sep * 0.15 * (0.5 + clamp(audioKick, 0.0, 1.0));
    finish(col);
}
