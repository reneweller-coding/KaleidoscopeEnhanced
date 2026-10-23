//@doc
 * @brief COHERENCE DIFFUSION REPAINT: the photo painted anew without end by coherence-enhancing diffusion: the colours flow along the edges and leave the lines standing, smearing into long brush-like streaks that follow the picture's contours
 * but never cross them; a source term pulls the colours back toward the photo, and small blots of colour from other places of the photo are dropped into the field and spread along the edges, so the picture stays alive.  The colour field
 * is a small field of the scene's own.  The strength of diffusion follows the swell of the music.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell      -> the strength of the diffusion and the rain of blots
 *
 * Knobs: pullP (how strongly the photo pulls the colours back), hueP.
//@params pullP
//@audio audioSwell
//@state 320 180 120 32
//@body
/**  The photo coordinate of a field cell.
 *
 * @param c  The cell coordinate. (in)
 *
 * @return
 *   The photo coordinate.
 **/
vec2 photoUV(vec2 c) { return ((c / stateRes) - 0.5) * vec2(1.7778, 1.0) * 0.8 + 0.5; }
/**  One step of coherence-enhancing diffusion of the colour field (the state pass).
 *
 * @return
 *   The colour field, 1.
 **/
vec4 stateStep()
{
    ivec2 ip = stCell();
    vec2 uv = photoUV(vec2(ip) + 0.5);
    vec3 ph = imgLod(uv, 0.9);
    if (stateFrame < 0.5) return vec4(ph, 1.0);
    vec3 c = stAt(ip).rgb;
    vec3 e = stAt(ip + ivec2(1, 0)).rgb, w = stAt(ip - ivec2(1, 0)).rgb, n = stAt(ip + ivec2(0, 1)).rgb, s = stAt(ip - ivec2(0, 1)).rgb;
    vec3 ne = stAt(ip + ivec2(1, 1)).rgb, nw = stAt(ip + ivec2(-1, 1)).rgb, se = stAt(ip + ivec2(1, -1)).rgb, sw = stAt(ip - ivec2(1, 1)).rgb;
    vec3 uxx = e + w - 2.0 * c, uyy = n + s - 2.0 * c, uxy = 0.25 * (ne - nw - se + sw);
    float ee = 0.006;
    vec2 gr = vec2(luma(imgLod(uv + vec2(ee, 0.0), 2.5)) - luma(imgLod(uv - vec2(ee, 0.0), 2.5)), luma(imgLod(uv + vec2(0.0, ee), 2.5)) - luma(imgLod(uv - vec2(0.0, ee), 2.5)));
    float edge = smoothstep(0.003, 0.05, length(gr));
    vec2 t = length(gr) > 1e-5 ? normalize(vec2(-gr.y, gr.x)) : vec2(1.0, 0.0);
    vec3 dtt = t.x * t.x * uxx + 2.0 * t.x * t.y * uxy + t.y * t.y * uyy;
    float sw0 = 0.5 + 0.9 * clamp(audioSwell, 0.0, 1.0);
    float Dac = 0.01, Dal = 0.24 * sw0;
    vec3 diff = mix(0.12 * sw0 * (uxx + uyy), Dac * (uxx + uyy) + (Dal - Dac) * dtt, edge);
    vec3 cn = c + diff + (0.006 + 0.018 * clamp(pullP, 0.0, 1.0)) * (ph - c);
    if (stRand(4) < 0.00007 * (0.3 + 1.4 * clamp(audioSwell, 0.0, 1.0))) {
        vec2 at = vec2(stRand(5), stRand(6)) * 1.0;
        cn = mix(cn, imgLod(at * 0.7 + 0.15, 1.0), 0.85);
    }
    return vec4(clamp(cn, 0.0, 1.5), 1.0);
}
void main()
{
    if (statePass == 1) { fragColor = stateStep(); return; }
    vec2 p = screenP();
    float asp = resolution.x / resolution.y;
    vec2 cc = (p / vec2(asp, 1.0) + 0.5) * stateRes;
    vec3 c = stLin(cc).rgb;
    vec3 ph = imgLod(p * 0.8 + 0.5, 0.8);
    finish(mix(c, ph, 0.12) * 1.08);
}
