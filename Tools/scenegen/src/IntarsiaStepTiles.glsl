//@doc
 * @brief INTARSIA STEP TILES: intarsia in the style of tumbling blocks: rhombs of three woods make a pile of cubes; the photo is rastered into diamonds and every rhomb is turned to one of three sides.  The three sides of a cube are light, middle and dark; the photo gives the tone and the hue of each cube,
 * and the cubes turn slowly: the borders between their faces wander round.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance -> the cubes turn (the face borders wander round) (integrated)
 *   audioSwell   -> the contrast between the three faces
 *
 * Knobs: sizeP (the size of the cubes), hueP.
//@params sizeP
//@audio audioSwell audioAdvance
//@body
void main()
{
    vec2 p = screenP();
    float S = (0.07 + 0.07 * clamp(sizeP, 0.0, 1.0));
    vec2 q = p / S;
    vec2 r = vec2(1.0, 1.7320508);
    vec2 h = r * 0.5;
    vec2 a = mod(q, r) - h;
    vec2 b = mod(q - h, r) - h;
    vec2 gv = dot(a, a) < dot(b, b) ? a : b;
    vec2 id = q - gv;
    float ang = atan(gv.y, gv.x) + 0.02 * audioAdvance + 0.015 * sceneTime + 1.5707963;
    float sec = floor(mod(ang / 6.2831853 + 8.0, 1.0) * 3.0);
    float fs = fract(mod(ang / 6.2831853 + 8.0, 1.0) * 3.0);
    vec3 c = imgLod((id * S) * 0.85 + 0.5, 1.2);
    float ct = 0.35 + 0.35 * clamp(audioSwell, 0.0, 1.0);
    float tone = sec < 0.5 ? 1.05 : (sec < 1.5 ? 1.0 - ct * 0.55 : 1.0 - ct * 1.1);
    float hexd = max(abs(gv.x) * 0.8660254 + abs(gv.y) * 0.5, abs(gv.y));
    float edge = smoothstep(0.5, 0.44, hexd);
    float seam = smoothstep(0.0, 0.05, fs) * (1.0 - smoothstep(0.95, 1.0, fs));
    vec3 col = c * tone * (0.7 + 0.3 * seam);
    finish(col * edge * 1.25 + (1.0 - edge) * vec3(0.03));
}
