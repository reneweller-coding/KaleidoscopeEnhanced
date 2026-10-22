//@doc
 * @brief MIRROR SCALE FIELD: an endless field of small mirror scales, each tilted a little, reflecting a photo
 * kaleidoscope hanging above them; waves of tilt run through the field and break the picture into shimmering pieces
 * that slide and re-join.  Optics: a scale tilted by the angle t turns the reflected ray by 2t, so it shows the
 * kaleidoscope above displaced by twice its tilt times the height; where a scale's tilt is steep it catches the
 * light of the sky as a bright glint.  The scales overlap like fish scales (rows offset by half).  One colour
 * family from the photo.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance   -> the waves of tilt run across the field (integrated: they run with the music's drive) and the
 *                     kaleidoscope above turns
 *   audioSwell     -> the waves' height: the picture breaks into more pieces
 *
 * Knobs: scaleP (the scales' size), foldP (the kaleidoscope's sides), hueP.
//@params scaleP foldP
//@audio audioSwell
//@body
void main()
{
    vec2 p = screenP();
    float fh = famHue();
    float S = 0.08 + 0.06 * clamp(scaleP, 0.0, 1.0);
    float sides = floor(5.0 + 4.0 * clamp(foldP, 0.0, 1.0));
    float amp = 0.08 + 0.18 * clamp(audioSwell, 0.0, 1.0);
    float turn = 0.03 * sceneTime + 0.15 * audioAdvance;
    // the scales: rows offset by half, each scale a rounded shield
    vec2 g = p / S;
    float row = floor(g.y);
    g.x += 0.5 * mod(row, 2.0);
    vec2 cid = vec2(floor(g.x), row);
    vec2 f = fract(g) - vec2(0.5, 0.35);
    float shield = length(f * vec2(1.0, 1.25));
    vec2 centre = (cid + vec2(0.5 - 0.5 * mod(row, 2.0), 0.35)) * S;
    // the tilt wave: a crest per beat running across the field, plus the scale's own small lean
    float hc = fract(sin(dot(cid, vec2(12.9898, 78.233))) * 43758.5453);
    float run = 0.5 * audioAdvance + 0.05 * sceneTime;
    float wave = sin(6.2831853 * (run - 0.9 * dot(centre, vec2(0.8, 0.6)) - 0.3 * length(centre)));
    vec2 tilt = amp * vec2(wave, 0.6 * cos(6.2831853 * (0.8 * run - 1.1 * centre.y)))
                + 0.04 * (vec2(hc, fract(hc * 7.3)) - 0.5);
    // what the scale reflects: the kaleidoscope above, shifted by twice the tilt
    vec2 sky = rot2(turn) * (p + 2.0 * tilt * 0.9);
    vec2 k = kaleidoUV(sky * 0.9 + 0.5, sides);
    vec3 photo = imgLod(k, 0.8);
    vec3 col = famCol(fh, 0.15 + 0.7 * luma(photo)) * (0.25 + 1.2 * luma(photo));
    col += famLight(fh, 0.6, 0.8) * pow(clamp(length(tilt) / (amp + 0.05), 0.0, 1.0), 4.0) * 0.8;   // the glint
    // the scales' edges and the shadow each casts on the next
    col *= smoothstep(0.52, 0.42, shield) * (0.75 + 0.25 * smoothstep(-0.35, 0.3, f.y)) + 0.0;
    col += famCol(fh, 0.4) * 0.03;
    finish(col);
}
