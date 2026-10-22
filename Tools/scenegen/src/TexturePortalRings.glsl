//@doc
 * @brief TEXTURE PORTAL RINGS: glowing rings hang over one photo and open, phrase by phrase, into views of the other:
 * as a phrase begins the rings widen like irises and the second photo appears through them, turned and a little
 * nearer, and as the phrase ends they close again; their dashed rims turn with the music's phase.  The rings stand on
 * a slow drifting pattern, the larger ones holding smaller ones within; a ring's opening follows the phrase's position
 * as a sine that is shut at both ends of the phrase, each ring a little later than the one before; inside, the second
 * photo is turned and zoomed about the ring's middle.  Both photos are calmed toward one colour family.
 *
 * Audio Reactivity (structure, not only light):
 *   audioPhrasePos -> the rings open and close once a phrase, one after another
 *   audioPhase     -> the rims turn and the views inside turn (integrated)
 *   audioSwell     -> the rims' glow
 *
 * Knobs: countP (how many rings), openP (how wide they open), hueP.
//@params countP openP
//@audio audioPhrasePos audioPhase audioSwell
//@body
/**  The photo's colour calmed toward the colour family.
 *
 * @param photo  The photo's colour. (in)
 * @param fh     The family's hue. (in)
 *
 * @return
 *   The colour.
 **/
vec3 tone(vec3 photo, float fh)
{
    float l = luma(photo);
    return mix(photo * 1.1, famCol(fh, 0.15 + 0.7 * l) * (0.25 + 1.2 * l), 0.45);
}

void main()
{
    vec2 p = screenP();
    float fh = famHue();
    float n = floor(4.0 + 5.0 * clamp(countP, 0.0, 1.0));
    float pp = clamp(audioPhrasePos, 0.0, 1.0);
    float turn = 0.03 * sceneTime + 0.4 * audioPhase;
    float glow = 0.6 + 0.6 * clamp(audioSwell, 0.0, 1.0);
    vec3 col = tone(imgLod(vec2(0.5) + p * vec2(0.55, 0.95), 0.8), fh) * 0.75;
    for (int k = 0; k < 9; ++k) {
        float i = float(k);
        if (i >= n) break;
        vec2 c = vec2(1.4 * (fract(i * 0.7548777 + 0.15) - 0.5), 0.8 * (fract(i * 0.5698403 + 0.4) - 0.5));
        c += 0.05 * vec2(sin(0.05 * sceneTime + i), cos(0.04 * sceneTime + 2.0 * i));
        float Rmax = 0.16 + 0.12 * hash11(i * 3.7);
        float open = pow(sin(3.14159265 * clamp(pp * 1.25 - 0.06 * i, 0.0, 1.0)), 2.0) * (0.6 + 0.4 * clamp(openP, 0.0, 1.0));
        float R = Rmax * (0.12 + 0.88 * open);
        vec2 d = p - c;
        float rr = length(d);
        // inside: the other photo, turned and a little nearer about the ring's middle
        vec2 q = rot2(turn * (mod(i, 2.0) < 0.5 ? 1.0 : -1.0) + i) * d / (1.3 + 0.4 * open);
        vec3 other = tone(imgB(vec2(0.5) + q * vec2(0.55, 0.95) + vec2(0.13, 0.07) * i, 0.8), fh);
        float inside = 1.0 - smoothstep(R - 0.004, R + 0.004, rr);
        col = mix(col, other * (0.85 + 0.3 * (1.0 - rr / max(R, 1e-3))), inside);
        // the dashed rim, turning
        float ang = atan(d.y, d.x) + turn * 2.0 * (mod(i, 2.0) < 0.5 ? 1.0 : -1.0);
        float dash = 0.5 + 0.5 * smoothstep(-0.2, 0.2, sin(ang * 12.0));
        float rim = exp(-pow((rr - R) / 0.008, 2.0)) * (0.5 + 0.5 * dash) + 0.3 * exp(-abs(rr - R) / 0.03);
        col += famLight(fh, 0.6, 0.6) * rim * glow * 0.7;
    }
    finish(col);
}
