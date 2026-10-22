//@doc
 * @brief ROSE WINDOW LAMP DISC: a turning glass disc like a rose window in front of a lamp, throwing coloured light
 * into smoke: the disc itself glows in the middle of the frame, its tracery dark, its panes the photo's colours; and
 * from every pane a shaft of light runs outward through the smoke, the shafts turning as a fan with the disc.  The
 * shafts are gathered by marching from each point back toward the disc's middle and summing the panes' light seen
 * along the way (a radial blur of the window), fading with the distance; the smoke's density varies slowly.  The
 * colours are the photo's, calmed toward one colour family.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance     -> the disc turns (integrated)
 *   audioHarmAdvance -> the window's division glides with the chord changes (the light of two counts cross-faded)
 *   audioSwell       -> the smoke thickens: the shafts glow more
 *
 * Knobs: discP (the disc's size), shaftP (the shafts' length), hueP.
//@params discP shaftP
//@audio audioHarmAdvance audioSwell
//@body
/**  The rose window's light at a point (centre 0, radius 1): panes of the photo between dark tracery.
 *
 * @param q     The point. (in)
 * @param n     The window's division. (in)
 * @param turn  The disc's turn. (in)
 * @param fh    The colour family. (in)
 *
 * @return
 *   The light passing the window.
 **/
vec3 rose(vec2 q, float n, float turn, float fh)
{
    float r = length(q);
    if (r > 1.0) return vec3(0.0);
    float a = atan(q.y, q.x) + turn;
    float sec = 6.2831853 / n;
    float u = abs(mod(a, sec) - 0.5 * sec) / (0.5 * sec);
    float ring = floor(r * 4.0);
    float fr = fract(r * 4.0);
    // tracery: the ring boundaries, the petals' mullions and circles in the petals
    float petal = length(vec2(u * 0.9, fr - 0.5));
    float trac = min(min(fr, 1.0 - fr) * 4.0, min(u, 1.0 - u) * r * sec * 4.0);
    trac = min(trac, abs(petal - 0.32) * 2.0);
    vec3 photo = imgLod(vec2(0.15 + 0.7 * u, 0.15 + 0.2 * ring + 0.1 * fr), 2.5);
    float l = luma(photo);
    vec3 glass = mix(photo * 1.3, famCol(fh, 0.1 + 0.2 * ring + 0.3 * u) * (0.5 + 1.0 * l), 0.5);
    return glass * smoothstep(0.02, 0.06, trac);
}

void main()
{
    vec2 p = screenP();
    float fh = famHue();
    float h = max(audioHarmAdvance, 0.0);
    float R = 0.34 + 0.12 * clamp(discP, 0.0, 1.0);
    float turn = 0.03 * sceneTime + 0.15 * audioAdvance;
    float nf = 8.0 + 4.0 * (0.5 + 0.5 * sin(0.6 * h));
    float nk = floor(nf), nm = smoothstep(0.2, 0.8, nf - nk);
    float smoke = 0.5 + 0.6 * clamp(audioSwell, 0.0, 1.0);
    float reach = 0.6 + 0.8 * clamp(shaftP, 0.0, 1.0);
    vec2 q = p / R;
    vec3 disc = mix(rose(q, nk, turn, fh), rose(q, nk + 1.0, turn, fh), nm);
    // the shafts: march back toward the middle, gathering the window's light (where it lies inside the disc)
    vec3 shafts = vec3(0.0);
    float rq = length(q);
    if (rq > 0.98) {
        for (int i = 0; i < 24; ++i) {
            float f = float(i) / 24.0;
            vec2 qs = q / rq * 0.98 * (f + 0.5 / 24.0);   // the panes along this angle, middle to rim
            shafts += mix(rose(qs, nk, turn, fh), rose(qs, nk + 1.0, turn, fh), nm);
        }
        shafts /= 24.0;
        float dens = 0.6 + 0.4 * fbm(p * 2.0 + vec2(0.02 * sceneTime, 0.01 * sceneTime));
        shafts *= exp(-(rq - 1.0) / (1.2 * reach)) * dens * smoke * 0.9;
    }
    vec3 col = disc * 1.1 + shafts;
    finish(col);
}
