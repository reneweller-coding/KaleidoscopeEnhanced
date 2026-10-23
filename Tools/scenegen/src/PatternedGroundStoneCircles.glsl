//@doc
 * @brief PATTERNED GROUND STONE CIRCLES: patterned ground: stones that sort themselves into circles and polygons by freezing and thawing; the photo sets the stones' colours, and the circles reorder themselves every cycle.  Every cell of a polygon net has a ring of stones round a fine-grained middle; the ring's
 * radius and the number of stones breathe with the cycle, which follows the phrase.
 *
 * Audio Reactivity (structure, not only light):
 *   audioPhrasePos -> the freeze-thaw cycle (periodic): the rings contract and widen
 *   audioSpread    -> the size of the circles (smoothed)
 *
 * Knobs: sizeP (the size of the cells), hueP.
//@params sizeP
//@audio audioSpread audioPhrasePos
//@body
void main()
{
    vec2 p = screenP();
    float S = (0.2 + 0.14 * clamp(sizeP, 0.0, 1.0)) * (1.0 + 0.2 * clamp(audioSpread, 0.0, 1.0));
    vec2 g = p / S;
    vec2 gi = floor(g);
    float d1 = 1e3;
    vec2 best = vec2(0.0);
    for (int dy = -1; dy <= 1; ++dy)
        for (int dx = -1; dx <= 1; ++dx) {
            vec2 cj = gi + vec2(float(dx), float(dy));
            vec2 h = hash22(cj);
            vec2 pt = cj + 0.5 + 0.3 * (h - 0.5) * 2.0;
            float d = length(g - pt);
            if (d < d1) { d1 = d; best = pt; }
        }
    float cyc = 0.5 - 0.5 * cos(6.2831853 * audioPhrasePos);
    float R = 0.28 + 0.08 * cyc;
    vec2 loc = g - best;
    float r = length(loc);
    float a = atan(loc.y, loc.x);
    float nst = 14.0 + 4.0 * cyc;
    float stone = 0.0;
    vec3 sc = vec3(0.0);
    float ring = 1.0 - smoothstep(0.0, 0.06, abs(r - R));
    float u = a / 6.2831853 * nst;
    float k = floor(u);
    float fu = fract(u) - 0.5;
    vec2 sp = R * vec2(cos((k + 0.5) / nst * 6.2831853), sin((k + 0.5) / nst * 6.2831853));
    float ds = length(loc - sp) / (R * 3.1415927 / nst);
    float st = (1.0 - smoothstep(0.7, 0.9, ds)) * ring;
    vec3 c = imgLod((best * S) * 0.85 + 0.5, 1.5);
    vec3 stc = imgLod((best * S + sp * S) * 0.85 + 0.5, 1.0);
    stc = mix(vec3(luma(stc)), stc, 1.3);
    vec3 fine = mix(vec3(0.35, 0.3, 0.25), c, 0.5) * (0.8 + 0.3 * noise2(p * 120.0));
    vec3 bg = mix(vec3(0.3, 0.27, 0.22), c, 0.35) * (0.7 + 0.3 * noise2(p * 60.0));
    vec3 col = bg;
    col = mix(col, fine, 1.0 - smoothstep(R * 0.9, R * 0.98, r));
    col = mix(col, stc * (0.8 + 0.4 * (1.0 - ds * 0.6)) * 1.3, st);
    finish(col * 1.1);
}
