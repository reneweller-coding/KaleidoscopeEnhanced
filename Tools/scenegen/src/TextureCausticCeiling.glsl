//@doc
 * @brief TEXTURE CAUSTIC CEILING: sunlight through moving water, cast onto a
 * pale surface -- the bright, sharp, ever-changing net of caustic lines
 * that dances on the bottom of a pool, but the water's surface is shaped
 * by the photograph: its relief becomes the waves, so the net takes the
 * photo's structure (tight cells over fine grain, long lines along veins
 * and ridges), and the light carries the photo's colours, split into
 * rainbow fringes at the brightest lines.  The waves travel continuously;
 * the net is endless and mirrors without seams.
 *
 * The caustic is computed properly: each point of the water surface
 * refracts the light by the surface slope; the brightness where the rays
 * land is the inverse of the area they spread over (the Jacobian).
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the waves travel (integrated, jump-free)
 *   audioSpread     -> the depth of the water (focus): lines sharpen or soften
 *   audioRoughness  -> choppy small waves on top
 *   audioMode       -> the light warms in major
 *   audioHigh       -> sparkle on the brightest lines (light)
 *   audioSwell      -> sun strength (slow)
 *
 * Knobs: waveP (share of photo relief vs. free waves), scaleP, fringeP
 * (colour fringes), hueP.
//@params waveP scaleP fringeP
//@audio audioSpread audioRoughness audioMode audioHigh audioSwell
//@body
float gT, gW, gRough;

// Water surface: a sum of smooth travelling plane waves, with its slope
// and curvature computed analytically (finite differences of finite
// differences drown the caustic in float noise).  The photo shapes the
// water through the waves' strength and direction, read at a very soft mip.
// Returns slope (xy) and the Hessian (xx, yy, xy) packed in a mat3-ish way.
void waves(vec2 q, out vec2 g, out vec3 H)
{
    vec2 uv = q * 0.12 + 0.5 + vec2(gT * 0.006, gT * 0.004);
    vec3 ph = imgLod(uv, 7.5);
    float amp = mix(1.0, 0.4 + 1.4 * luma(ph), gW) * 0.9;
    float rot = gW * 2.0 * (ph.r - ph.b);
    g = vec2(0.0); H = vec3(0.0);
    for (int k = 0; k < 7; ++k) {
        float fk = float(k);
        float a = fk * 2.39996 + rot;
        vec2 d = vec2(cos(a), sin(a));
        float f = 1.3 + 0.55 * fk;
        float ph0 = dot(q, d) * f + gT * (0.7 + 0.15 * fk) + fk * 1.7;
        float A = amp / (f * f);
        g += A * cos(ph0) * f * d;
        H += -A * sin(ph0) * f * f * vec3(d.x * d.x, d.y * d.y, d.x * d.y);
    }
    // small chop on top (roughness)
    vec2 d1 = vec2(5.3, 3.1), d2 = vec2(-2.7, 6.1);
    float c1 = 0.012 * gRough;
    float s1 = sin(dot(q, d1) + gT * 2.0), s2 = sin(dot(q, d2) - gT * 1.7);
    g += c1 * (cos(dot(q, d1) + gT * 2.0) * d1 * s2 + s1 * cos(dot(q, d2) - gT * 1.7) * d2);
}

// Caustic brightness: rays land at q - depth*grad(h); the area element of
// that map is det(I - depth*Hessian).
float causticAt(vec2 q, float depth)
{
    vec2 g; vec3 H;
    waves(q, g, H);
    float jxx = 1.0 - depth * H.x, jyy = 1.0 - depth * H.y, jxy = -depth * H.z;
    float det = abs(jxx * jyy - jxy * jxy);
    return 1.0 / (det + 0.015);
}

void main()
{
    vec2 p = screenP();
    float swell = clamp(audioSwell, 0.0, 1.0);
    float hi = clamp(audioHigh * 1.5, 0.0, 1.0);
    gT = sceneTime * 0.35 + 2.5 * audioAdvance;
    gW = 0.35 + 0.6 * clamp(waveP, 0.0, 1.0);
    gRough = clamp(audioRoughness, 0.0, 1.0);
    float sc = 3.5 + 3.0 * clamp(scaleP, 0.0, 1.0);
    vec2 q = p * sc;
    float depth = 0.9 + 0.8 * clamp(audioSpread, 0.0, 1.0);

    // Dispersion: each colour channel focuses at a slightly different depth.
    float fr = 0.03 * clamp(fringeP, 0.0, 1.0) + 0.01;
    float cr = causticAt(q, depth * (1.0 - fr));
    float cg = causticAt(q, depth);
    float cb = causticAt(q, depth * (1.0 + fr));
    vec3 c = vec3(cr, cg, cb);
    // Light colour: the photo's colour where it lands, warmer in major.
    vec3 ph = imgLod(q * 0.15 + 0.5 + vec2(gT * 0.006, gT * 0.004), 5.0);
    vec3 lightC = mix(vec3(0.85, 0.95, 1.05), vec3(1.1, 0.97, 0.8), clamp(audioMode, 0.0, 1.0));
    lightC *= mix(vec3(1.0), glowColour(ph, q * 0.3, hueP * 0.159) * 1.3, 0.45);
    // The floor: pale tiles tinted by water, the caustic on top.
    // The floor is the photo itself, under water (tinted, the ripples bend it).
    vec2 g0; vec3 H0; waves(q, g0, H0);
    vec3 bottom = imgLod(q * 0.15 + 0.5 - g0 * 0.02, 1.5);
    vec3 floorC = mix(vec3(0.1, 0.18, 0.24), bottom * vec3(0.55, 0.75, 0.85), 0.6);
    vec3 col = floorC * (0.7 + 0.03 * cg) + lightC * c * 0.09 * (0.7 + 0.6 * swell);
    col += vec3(1.0) * smoothstep(12.0, 30.0, cg) * (0.1 + 0.5 * hi);
    finish(col);
}
