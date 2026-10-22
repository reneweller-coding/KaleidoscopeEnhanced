//@doc
 * @brief PRISM BEAM LATTICE: a lattice of thin white beams of light along the three axes; at unseen prisms spaced
 * along every beam it breaks -- a white core runs on, and beside it a narrow fan of coloured seams splays out and
 * fades before the next prism -- and the eye flies through the crossing light.  The seams keep to a narrow band of
 * hues round the photo's colour family, so the light stays white with only fine colour at its edges.
 *
 * Audio Reactivity (structure, not only light):
 *   audioHarmAdvance -> the refraction angle glides with every chord change: the fans open and close
 *   audioSpread      -> a broad spectrum lights more of the lattice's beams
 *   audioAdvance     -> the flight and the light running down the beams (integrated)
 *   audioKick        -> the prisms flash (light)
 *
 * Knobs: fanP (the fans' base width), beamP (the beams' brightness), hueP.  Distinct from DichroicPrismLaserField,
 * which is a surface.
//@params fanP beamP
//@audio audioHarmAdvance audioSpread audioKick
//@body
/**  One family of beams along an axis: the white core and the fan of seams after the last prism.
 *
 * @param s      The coordinate along the beams. (in)
 * @param w      The two coordinates across them. (in)
 * @param L      The beams' spacing across. (in)
 * @param P      The prisms' spacing along. (in)
 * @param ang    The fan's half angle. (in)
 * @param share  How many of the beams are lit (0..1). (in)
 * @param seed   The family's own offset. (in)
 * @param fan    Returns the seams' light (x) and their place across the fan (y, -1..1). (out)
 * @param dist   Returns the distance to the core or the nearest seam (for the step). (out)
 *
 * @return
 *   The core's light.
 **/
float beamFamily(float s, vec2 w, float L, float P, float ang, float share, float seed, out vec2 fan, out float dist)
{
    vec2 id = floor(w / L + 0.5);
    vec2 q = w - id * L;
    float hb = fract(sin(dot(id, vec2(12.9898, 78.233)) + seed) * 43758.5453);
    float lit = smoothstep(hb - 0.1, hb + 0.1, share);
    float k = floor(s / P + hb);
    float u = s - (k - hb) * P;                                  // distance past the last prism, 0..P
    float fanA = 6.2831853 * fract(hb * 7.3 + k * 0.618);        // the fan's plane round the beam
    vec2 fd = vec2(cos(fanA), sin(fanA));
    float across = dot(q, fd), off = dot(q, vec2(-fd.y, fd.x));
    float core = exp(-pow(length(q) / 0.028, 2.0)) + 0.1 * 0.0008 / (0.0008 + dot(q, q));
    float spread = u * tan(ang);
    float seams = 0.0, place = 0.0;
    dist = length(q);
    for (int j = -2; j <= 2; ++j) {
        float y = spread * (0.6 + 0.2 * float(j));               // each seam a little further out
        float dj = length(vec2(across - y, off));
        dist = min(dist, dj);
        float g = exp(-pow(dj / 0.016, 2.0)) * smoothstep(0.0, 0.3, u) * smoothstep(P, 0.6 * P, u);
        seams += g;
        place += g * float(j) * 0.5;
    }
    fan = vec2(seams, place / max(seams, 1e-4)) * lit;
    return core * lit;
}

void main()
{
    vec2 p = screenP();
    float fh = famHue();
    const float L = 1.8, P = 4.0;
    float h = max(audioHarmAdvance, 0.0);
    float ang = (0.04 + 0.04 * clamp(fanP, 0.0, 1.0)) * (1.0 + 0.5 * sin(0.8 * h) + 0.2 * sin(0.33 * h + 1.0));
    float share = 0.45 + 0.5 * clamp(audioSpread, 0.0, 1.0);
    float beamL = 0.6 + 0.6 * clamp(beamP, 0.0, 1.0);
    float kick = clamp(audioKick, 0.0, 1.0);
    float run = 0.6 * audioAdvance + 0.04 * sceneTime;
    float fly = 0.4 * sceneTime + 1.6 * audioAdvance;
    vec3 ro = vec3(0.25 * L + 0.15 * sin(0.04 * fly), 0.25 * L + 0.12 * cos(0.035 * fly), fly);   // clear of every beam
    vec3 rd = normalize(vec3(p, 1.1));
    rd.xz = rot2(0.35 * sin(0.021 * sceneTime)) * rd.xz;
    rd.yz = rot2(0.25 * sin(0.017 * sceneTime + 1.0)) * rd.yz;
    rd.xy = rot2(0.012 * sceneTime) * rd.xy;
    vec3 col = vec3(0.0);
    float t = 0.1;
    for (int i = 0; i < 140; ++i) {
        vec3 x = ro + rd * t;
        vec2 fx, fy, fz;
        float ex, ey, ez;
        float cx = beamFamily(x.x, x.yz, L, P, ang, share, 0.0, fx, ex);
        float cy = beamFamily(x.y, x.zx, L, P, ang, share, 1.7, fy, ey);
        float cz = beamFamily(x.z + 0.5 * L, x.xy + 0.5 * L, L, P, ang, share, 3.1, fz, ez);
        float pulse = 0.75 + 0.25 * sin(0.9 * (x.x + x.y + x.z) - 6.2831853 * run);
        vec3 white = famLight(fh, 0.5, 0.85);
        vec3 c = white * (cx + cy + cz) * pulse * beamL;
        c += famLight(fh + 0.06 * fx.y, 0.5 + 0.4 * fx.y, 0.25) * fx.x * (1.0 + 2.0 * kick);
        c += famLight(fh + 0.06 * fy.y, 0.5 + 0.4 * fy.y, 0.25) * fy.x * (1.0 + 2.0 * kick);
        c += famLight(fh + 0.06 * fz.y, 0.5 + 0.4 * fz.y, 0.25) * fz.x * (1.0 + 2.0 * kick);
        float fade = exp(-0.06 * t) * smoothstep(0.1, 0.6, t);
        col += c * fade * 0.3 * clamp(0.6 * min(ex, min(ey, ez)), 0.008, 0.35) / 0.05;
        t += clamp(0.6 * min(ex, min(ey, ez)), 0.008, 0.35);
        if (t > 30.0) break;
    }
    col += famCol(fh, 0.5) * 0.012;
    finish(col);
}
