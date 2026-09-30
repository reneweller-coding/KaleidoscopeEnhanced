//@doc
 * @brief TEXTURE ORBIFOLD FLOW: a kaleidoscope whose mirrors are themselves
 * in motion -- the photograph is folded into a hexagonal mirror pattern
 * (p6m), but the mirror lattice is bent by a slow flow field, so the
 * mirror walls sway and curve like water plants, the rosettes stretch and
 * swirl, and the picture inside streams through the folds.  The fold
 * continues endlessly beyond the frame; mirrorable by construction.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the photo streams through the folds (integrated)
 *   audioPhase      -> the lattice rotates (integrated, jump-free)
 *   audioSpread     -> how strongly the flow bends the mirrors
 *   audioMode       -> six-fold (major) or three-fold (minor) rosettes, blended
 *   audioRoughness  -> fine ripples on the mirror walls
 *   audioHigh       -> the mirror walls glint (light)
 *
 * Knobs: cellP (cell size), bendP (base bending), photoZoomP, hueP.
//@params cellP bendP photoZoomP
//@audio audioPhase audioSpread audioMode audioRoughness audioHigh
//@body
vec2 hexFold(vec2 q, float n, out float seam)
{
    const vec2 s = vec2(1.0, 1.7320508);
    vec2 a = mod(q, s) - s * 0.5;
    vec2 b = mod(q - s * 0.5, s) - s * 0.5;
    vec2 h = dot(a, a) < dot(b, b) ? a : b;
    float ang = atan(h.y, h.x);
    float r = length(h);
    float sec = 3.14159265 / n;
    float fa = mod(ang, 2.0 * sec);
    fa = abs(fa - sec);
    seam = min(fa, sec - fa) * r;
    return vec2(cos(fa), sin(fa)) * r;
}

void main()
{
    vec2 p = screenP();
    float hi = clamp(audioHigh * 1.5, 0.0, 1.0);
    float cell = 0.25 + 0.3 * clamp(cellP, 0.0, 1.0);
    vec2 q = rot2(0.01 * sceneTime + 0.2 * audioPhase) * p / cell;
    // The flow bends the lattice.
    float bend = (0.15 + 0.3 * clamp(bendP, 0.0, 1.0)) * (0.6 + 0.8 * clamp(audioSpread, 0.0, 1.0));
    vec2 fq = p * 1.3 + vec2(0.03 * sceneTime, -0.02 * sceneTime);
    q += bend * (vec2(fbm3(fq), fbm3(fq + 5.0)) - 0.5) * 2.0;
    q += 0.02 * clamp(audioRoughness, 0.0, 1.0) * vec2(sin(q.y * 20.0 + sceneTime), sin(q.x * 20.0 - sceneTime));
    float mode = clamp(audioMode, 0.0, 1.0);
    float s3, s6;
    vec2 f3 = hexFold(q, 3.0, s3);
    vec2 f6 = hexFold(q, 6.0, s6);
    float z = 0.25 + 0.3 * clamp(photoZoomP, 0.0, 1.0);
    vec2 win = vec2(0.5) + 0.3 * vec2(sin(0.013 * sceneTime + 0.2 * audioAdvance), cos(0.011 * sceneTime + 0.15 * audioAdvance));
    vec3 c3 = imgLod(win + f3 * z, 0.3);
    vec3 c6 = imgLod(win + f6 * z, 0.3);
    vec3 col = mix(c3, c6, smoothstep(0.2, 0.8, mode));
    float seam = mix(s3, s6, smoothstep(0.2, 0.8, mode));
    float m = luma(imgLod(win, 8.0));
    col = max((col - m) * 1.8 + m, 0.0);
    float lc = luma(col);
    col = max(mix(vec3(lc), col, 1.6), 0.0);
    // Radial shading inside each rosette: bright centres, darker rims.
    float rr = length(mix(f3, f6, smoothstep(0.2, 0.8, mode)));
    col *= 1.45 - 1.0 * smoothstep(0.15, 0.6, rr);
    vec3 hueF = hsv2rgb(vec3(fract(hueP * 0.159 + 0.25 * fbm3(fq * 0.5) + 0.01 * sceneTime), 0.8, 1.0));
    col = mix(col, hueF * lc * 1.8, 0.25);
    col += vec3(1.0, 0.97, 0.92) * exp(-seam * cell / (1.5 / resolution.y * 2.0)) * (0.05 + 0.3 * hi);
    finish(col * 1.05);
}
