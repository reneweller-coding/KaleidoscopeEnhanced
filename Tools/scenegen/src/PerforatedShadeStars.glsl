//@doc
 * @brief PERFORATED SHADE STARS: a perforated sunshade whose holes fall on the photo as spots of light, little images of the sun: in the shade between them the photo is dark and cool; when the shade tilts the spots turn to ellipses and
 * stretch out along the tilt.  The holes are laid in a hexagonal lattice and the photo in each spot is bright and warm.  The tilt follows the melody (smoothed in a small field of the scene's own), the size of the holes the swell.
 *
 * Audio Reactivity (structure, not only light):
 *   audioMelodyPitch -> the tilt of the shade (smoothed, never a jump)
 *   audioSwell      -> the size of the holes
 *
 * Knobs: holeP (the number of holes), hueP.
//@params holeP
//@audio audioMelodyPitch audioSwell
//@state 1 1 30 32
//@body
/**  The state pass: the melody's pitch, smoothed over a second or two.
 *
 * @return
 *   x the smoothed pitch, 0, 0, 1.
 **/
vec4 stateStep()
{
    float old = stateFrame < 0.5 ? clamp(audioMelodyPitch, 0.0, 1.0) : texelFetch(texState, ivec2(0, 0), 0).x;
    return vec4(old + (clamp(audioMelodyPitch, 0.0, 1.0) - old) * 0.02, 0.0, 0.0, 1.0);
}
/**  The photo lit by a warm light and shaded by a soft shadow.
 *
 * @param c    The photo's colour. (in)
 * @param sh   The shadow, 0 lit .. 1 in shade. (in)
 * @param den  How dark the shade is, 0..1. (in)
 *
 * @return
 *   The colour.
 **/
vec3 lightAndShade(vec3 c, float sh, float den)
{
    vec3 lit = c * vec3(1.12, 1.03, 0.88) * 1.1;
    vec3 shade = c * vec3(0.55, 0.66, 0.82) * (1.0 - 0.6 * den);
    return mix(lit, shade, clamp(sh, 0.0, 1.0));
}
void main()
{
    if (statePass == 1) { fragColor = stateStep(); return; }
    vec2 p = screenP();
    float tilt = (texelFetch(texState, ivec2(0, 0), 0).x - 0.5) * 2.4 + 0.3 * sin(0.03 * sceneTime);
    float ct = cos(tilt), sg = sin(tilt);
    vec2 q = vec2(p.x / max(ct, 0.35), p.y);
    float s = 0.16 - 0.08 * clamp(holeP, 0.0, 1.0);
    vec2 g = vec2(q.x / (s * 1.7321), q.y / s);
    vec2 cell = floor(g);
    vec2 best = vec2(0.0);
    float dmin = 9.0;
    for (int j = -1; j <= 1; ++j) {
        for (int i = -1; i <= 1; ++i) {
            vec2 cc = cell + vec2(float(i), float(j));
            float odd = mod(cc.x, 2.0);
            vec2 pos = vec2(cc.x * s * 1.7321 * 0.5 * 2.0, (cc.y + 0.5 * odd) * s);
            vec2 ctr = vec2(cc.x, cc.y + 0.5 * odd) * vec2(s * 1.7321, s);
            float d = length((q - ctr) * vec2(1.0, 1.0));
            if (d < dmin) { dmin = d; best = ctr; }
        }
    }
    float hole = (0.28 + 0.22 * clamp(audioSwell, 0.0, 1.0)) * s;
    float sh = smoothstep(hole * 0.8, hole * 1.35, dmin);
    vec3 c = imgLod(p * 0.8 + 0.5, 0.7);
    finish(lightAndShade(c, sh, 0.85));
}
