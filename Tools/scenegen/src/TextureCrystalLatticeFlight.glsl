//@doc
 * @brief TEXTURE CRYSTAL LATTICE FLIGHT: gliding through the inside of a
 * vast crystal lattice -- an endless three-dimensional grid of glowing
 * struts meeting at bright nodes, receding in perfect perspective in all
 * directions, the struts sheathed in the photograph's colours, the whole
 * lattice slowly rolling as we fly diagonally through it; fog swallows the
 * far rows in the photo's tint.  Endless, mirrorable.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the flight (integrated, jump-free)
 *   audioPhase      -> the lattice rolls (integrated)
 *   audioSpread     -> strut thickness
 *   audioKick       -> the nodes flash (light)
 *   audioMode       -> the light: cool in minor, warm in major
 *   audioSwell      -> the fog (slow)
 *
 * Knobs: cellP (cell size), glowP (strut glow), fogP (base fog), hueP.
//@params cellP glowP fogP
//@audio audioPhase audioSpread audioKick audioMode audioSwell
//@body
void main()
{
    vec2 p = screenP();
    float kick = clamp(audioKick, 0.0, 1.0);
    float swell = clamp(audioSwell, 0.0, 1.0);
    float mode = clamp(audioMode, 0.0, 1.0);
    float roll = 0.02 * sceneTime + 0.2 * audioPhase;
    vec3 rd = normalize(vec3(p, 1.3));
    rd.xy = rot2(roll) * rd.xy;
    rd.xz = rot2(0.35) * rd.xz;
    rd.yz = rot2(0.25) * rd.yz;
    float travel = 0.6 * sceneTime + 4.0 * audioAdvance;
    vec3 ro = vec3(0.3, 0.2, 1.0) * travel;
    float cs = 1.0 + 0.8 * clamp(cellP, 0.0, 1.0);
    float r = (0.03 + 0.05 * clamp(audioSpread, 0.0, 1.0)) * cs;
    // Sphere-trace the lattice of struts along the three axes.
    float t = 0.05;
    float dmin = 1e3; float tHit = -1.0;
    vec3 hp = ro;
    for (int i = 0; i < 64; ++i) {
        hp = ro + rd * t;
        vec3 q = mod(hp, cs) - cs * 0.5;
        vec3 a = abs(q);
        float dx = length(q.yz), dy = length(q.xz), dz = length(q.xy);
        float d = min(dx, min(dy, dz)) - r;
        dmin = min(dmin, d / t);
        if (d < 0.001 * t) { tHit = t; break; }
        t += d * 0.9;
        if (t > 40.0) break;
    }
    vec3 lc = mix(vec3(0.7, 0.85, 1.1), vec3(1.15, 0.9, 0.7), mode);
    vec3 gc = glowColour(imgLod(vec2(0.5 + 0.1 * sin(0.02 * sceneTime), 0.5), 6.0), vec2(travel * 0.02, 0.0), hueP * 0.159);
    float fogK = (0.05 + 0.08 * clamp(fogP, 0.0, 1.0)) * (0.7 + 0.8 * swell);
    vec3 col = gc * 0.06;
    if (tHit > 0.0) {
        vec3 q = mod(hp, cs) - cs * 0.5;
        // Which strut: the axis we are closest to.
        float dx = length(q.yz), dy = length(q.xz), dz = length(q.xy);
        vec3 n; vec2 uv;
        if (dx < dy && dx < dz) { n = normalize(vec3(0.0, q.yz)); uv = vec2(hp.x, atan(q.z, q.y)); }
        else if (dy < dz)       { n = normalize(vec3(q.x, 0.0, q.z)); uv = vec2(hp.y, atan(q.z, q.x)); }
        else                    { n = normalize(vec3(q.xy, 0.0)); uv = vec2(hp.z, atan(q.y, q.x)); }
        vec3 ph = imgLod(vec2(uv.x * 0.15 + 0.5, uv.y / 3.14159265), clamp(log2(tHit * 2.0), 0.0, 7.0));   // angle/pi: the atan cut meets the mirror fold
        float diff = 0.4 + 0.6 * max(dot(n, normalize(vec3(0.4, 0.8, -0.3))), 0.0);
        vec3 sc = ph * lc * diff;
        // Nodes: bright where all three axes meet.
        float node = exp(-length(q) / (r * 3.0));
        sc += gc * node * (0.8 + 2.0 * kick);
        sc += gc * (0.1 + 0.4 * clamp(glowP, 0.0, 1.0)) * pow(1.0 - abs(dot(n, -rd)), 3.0);
        col = mix(sc, gc * 0.25, 1.0 - exp(-tHit * fogK));
    } else {
        col = gc * 0.25;
    }
    // Glow halo around near-misses.
    col += gc * exp(-max(dmin, 0.0) * 60.0) * 0.12 * (0.3 + clamp(glowP, 0.0, 1.0));
    finish(col);
}
