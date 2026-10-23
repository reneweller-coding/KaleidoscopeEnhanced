//@doc
 * @brief SMOCKING DIAMONDS: gathered smocking: a diamond lattice of stitch points draws the photo together, and between the points tubes of cloth fold;
 * the gathering tightens and loosens, and the bar of the music runs through the points as a wave.  The photo is the cloth, the folds
 * only shade it softly, with a dark pinch at every stitch.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell      -> the gathering's strength
 *   audioBarPhase   -> a wave of tightening runs along the rows of stitches with the bar (continuous)
 *
 * Knobs: cellsP (the lattice's size), tubeP (how deep the tubes' shading is), hueP.
//@params cellsP tubeP
//@audio audioSwell audioBarPhase
//@body
void main()
{
    vec2 p = screenP();
    vec2 uv = p * 0.8 + 0.5;
    float N = 5.0 + 7.0 * clamp(cellsP, 0.0, 1.0);
    vec2 u = rot2(0.7853982) * p * N;
    vec2 f = fract(u) - 0.5;
    float row = floor(u.y);
    float wave = 0.55 + 0.45 * sin(6.2831853 * (audioBarPhase - 0.11 * row));
    float A = (0.4 + 0.9 * clamp(audioSwell, 0.0, 1.0)) * wave;
    float cx = cos(6.2831853 * u.x), cy = cos(6.2831853 * u.y);
    vec2 g = vec2(-sin(6.2831853 * u.x) * cy, -cx * sin(6.2831853 * u.y));
    vec2 d = rot2(-0.7853982) * g * (0.012 * A);
    vec3 c = imgLod(uv + d, 0.5);
    float tube = 0.55 + 0.45 * cos(3.14159265 * f.x * 2.0) * (0.6 + 0.4 * cos(3.14159265 * f.y));
    float pinch = exp(-dot(f, f) * 70.0);
    vec3 col = c * mix(1.0, tube, 0.35 + 0.5 * clamp(tubeP, 0.0, 1.0)) * (1.0 - 0.45 * pinch * A);
    finish(col * 1.12);
}
