//@doc
 * @brief HELIOZOAN RAY SPHERES: a field of sun animalcules -- small glassy spheres sending out fine straight rays of
 * light in every direction -- the rays reaching further as the music swells, and over each phrase the rays that point
 * at a neighbour stretching out to meet its ray halfway, joining the whole field into a glowing net; beads of light run
 * outward along the rays.  The spheres sit on a hexagonal lattice; their rays come at even angles, a multiple of six,
 * so some always point straight at the six neighbours; each sphere has a granular glowing body.  The light is shades of
 * one colour family from the photo.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell     -> the rays' length
 *   audioPhrasePos -> over each phrase the rays toward the neighbours reach out and join, then draw back
 *   audioAdvance   -> the beads run out along the rays and the field drifts (integrated)
 *
 * Knobs: cellP (the spheres' spacing), rayP (how many rays), hueP.
//@params cellP rayP
//@audio audioPhrasePos audioSwell
//@body
void main()
{
    vec2 p = screenP();
    float fh = famHue();
    float S = 0.22 + 0.1 * clamp(cellP, 0.0, 1.0);
    float N = 6.0 * floor(4.0 + 3.0 * clamp(rayP, 0.0, 1.0));
    float run = 0.2 * sceneTime + 0.8 * audioAdvance;
    float drift = 0.01 * sceneTime + 0.04 * audioAdvance;
    float L = S * (0.22 + 0.2 * clamp(audioSwell, 0.0, 1.0));
    float join = 0.5 - 0.5 * cos(6.2831853 * clamp(audioPhrasePos, 0.0, 1.0));
    vec2 w = p + vec2(0.5, 0.2) * drift;
    // the nearest sphere of the hexagonal lattice, and its six neighbours
    vec2 g = w / S;
    const vec2 R = vec2(1.0, 1.7320508);
    vec2 qa = mod(g, R) - 0.5 * R, qb = mod(g - 0.5 * R, R) - 0.5 * R;
    vec2 q0 = dot(qa, qa) < dot(qb, qb) ? qa : qb;
    vec3 col = famCol(fh, 0.45) * 0.015;
    for (int k = 0; k < 7; ++k) {
        float ak = 1.0471976 * float(k);
        vec2 off = k == 0 ? vec2(0.0) : vec2(cos(ak), sin(ak));
        vec2 d = (q0 - off) * S;                                     // from that sphere's centre (screen units)
        float hs = hash21(floor((g - q0 + off) * 2.0 + 0.5));
        float r = length(d), an = atan(d.y, d.x);
        // the body: a granular glowing sphere
        float rb = 0.12 * S;
        col += famLight(fh, 0.3 + 0.4 * hs, 0.4) * (smoothstep(rb, rb * 0.7, r) * (0.3 + 0.4 * noise2(d * 300.0 + 9.0 * hs))
                                                   + exp(-pow((r - rb) / 0.003, 2.0)) * 0.5);
        // the nearest ray: at an even angle; those pointing at a neighbour reach out to meet it halfway
        float j = floor(an / 6.2831853 * N + 0.5);
        float aj = j / N * 6.2831853;
        float perp = abs(sin(an - aj)) * r;
        float toNb = smoothstep(0.98, 1.0, cos(6.0 * aj));          // a ray along one of the six neighbour directions
        float len = mix(L, 0.5 * S + 0.004, join * toNb);
        float ray = exp(-pow(perp / 0.0015, 2.0)) * smoothstep(rb * 0.8, rb, r) * smoothstep(len, len * 0.9, r);
        float bead = pow(0.5 + 0.5 * cos(6.2831853 * (r / (0.06 * S) - run + hs)), 12.0);
        col += famLight(fh, 0.4 + 0.3 * hs, 0.5) * ray * (0.35 + 0.5 * toNb * join + 0.9 * bead);
    }
    finish(famExpose(col, 3.46, 0.80, 0.00, fh));
}
