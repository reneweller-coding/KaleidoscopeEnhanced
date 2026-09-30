//@doc
 * @brief TEXTURE GIRIH CHAMBERS: an Islamic star lattice of gilded
 * strapwork -- eight-pointed stars and the crosses between them, outlined
 * by raised bands of gold that interlace over and under each other, and
 * every chamber of the pattern filled with the photograph, folded so each
 * star holds a kaleidoscopic eight-fold image; the picture flows through
 * the chambers, the gold catches a moving light.  Endless, mirrorable.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the photo flows through the chambers (integrated)
 *   audioPhase      -> the lattice turns (integrated)
 *   audioSpread     -> the star size within the lattice
 *   audioKick       -> the gold bands flash (light)
 *   audioMode       -> the chambers: cool tint in minor, warm in major
 *   audioHigh       -> sparkles on the gold (light)
 *
 * Knobs: cellP (lattice size), bandP (band width), photoZoomP, hueP.
//@params cellP bandP photoZoomP
//@audio audioPhase audioSpread audioKick audioMode audioHigh
//@body
void main()
{
    vec2 p = screenP();
    float kick = clamp(audioKick, 0.0, 1.0);
    float hi = clamp(audioHigh * 1.5, 0.0, 1.0);
    float cell = 0.3 + 0.3 * clamp(cellP, 0.0, 1.0);
    vec2 q = rot2(0.01 * sceneTime + 0.1 * audioPhase) * p / cell;
    vec2 ci = floor(q + 0.5);
    vec2 f = q - ci;                                           // -0.5..0.5, mirror-symmetric cell
    vec2 fa = abs(f);
    // Star lines: the axis square |x|=s, |y|=s and the diagonal square |x|+|y|=s*sqrt2.
    float st = 0.2 + 0.08 * clamp(audioSpread, 0.0, 1.0);
    float d1 = abs(fa.x - st), d2 = abs(fa.y - st), d3 = abs(fa.x + fa.y - st * 1.4142) * 0.7071;
    // Lines meeting the cell edge continue into the neighbour (mirror symmetry).
    float dl = min(min(d1, d2), d3);
    float bw = 0.02 + 0.03 * clamp(bandP, 0.0, 1.0);
    float px = fwidth(q.x) * 1.2 + 1e-4;
    float band = smoothstep(bw + px, bw - px, dl);
    // Chambers: which region we are in (signs of the three lines).
    float ra = step(st, fa.x), rb = step(st, fa.y), rc = step(st * 1.4142, fa.x + fa.y);
    float region = ra + 2.0 * rb + 4.0 * rc;
    // Eight-fold kaleidoscope inside each chamber, centred on the cell.
    vec2 k = fa;
    if (k.y > k.x) k = k.yx;                                     // fold into 0..45 degrees
    float z = 0.5 + 0.6 * clamp(photoZoomP, 0.0, 1.0);
    vec2 win = vec2(0.5) + 0.3 * vec2(sin(0.012 * sceneTime + 0.12 * audioAdvance), cos(0.009 * sceneTime + 0.1 * audioAdvance));
    vec2 uv = win + k * z + vec2(region * 0.13, region * 0.07) + ci * 0.02;
    vec3 ph = imgLod(uv, 0.6);
    float mode = clamp(audioMode, 0.0, 1.0);
    vec3 tint = mix(vec3(0.8, 0.9, 1.1), vec3(1.1, 0.92, 0.75), mode);
    vec3 col = ph * tint * (0.75 + 0.25 * step(0.5, rc));
    // Gold strapwork with a bevel lit from a moving light.
    vec3 gold = vec3(1.0, 0.78, 0.38);
    float la = 0.2 * sceneTime;
    float bev = clamp(1.0 - dl / max(bw, 1e-3), 0.0, 1.0);
    float lit = 0.55 + 0.45 * sin(la + dot(f, vec2(3.0, 2.0)));
    vec3 bandC = gold * (0.35 + 0.65 * bev) * (0.6 + 0.6 * lit);
    bandC = mix(bandC, bandC * glowColour(imgLod(win, 5.0), ci * 0.1, hueP * 0.159) * 1.3, 0.2);
    bandC *= 1.0 + 1.2 * kick;
    // Shadow beside the bands (they are raised).
    col *= 1.0 - 0.45 * smoothstep(bw * 3.0, bw, dl) * (1.0 - band);
    col = mix(col, bandC, band);
    // Sparkles on the gold: round glints.
    vec2 sg = q * 18.0;
    vec2 si = floor(sg), sf = fract(sg);
    float spk = smoothstep(0.3, 0.0, length(sf - 0.25 - 0.5 * hash22(si))) * step(0.9, hash21(si + 4.0));
    float tw = pow(max(0.0, sin(sceneTime * 2.0 + hash21(si) * 30.0)), 10.0);
    col += vec3(1.0, 0.95, 0.8) * spk * tw * band * (0.3 + 1.5 * hi);
    finish(col);
}
