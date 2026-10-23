//@doc
 * @brief ANT TRAIL STIGMERGY FIELD: ant trails: pheromone on the surface that ants follow and reinforce; roads arise that branch and thicken.  The ants are a density field that climbs the pheromone gradient (the Keller-Segel form), the pheromone is laid down by the ants and by the food (the bright places of
 * the photo) and evaporates; the photo is the terrain and is painted along the roads.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell   -> the evaporation (swell: short trails, calm: long roads)
 *   audioSpread  -> the number of ants that start from the nest (smoothed)
 *
 * Knobs: scaleP (cell size), hueP.
//@params scaleP
//@audio audioSwell audioSpread
//@state 320 180 40 32
//@body
vec3 phAt(vec2 c, float lod) { return imgLod((c - 0.5 * stateRes) / stateRes.y * 0.8 + 0.5, lod); }
vec4 stateStep()
{
    ivec2 ip = stCell();
    if (stateFrame < 0.5) return vec4(0.2 + 0.6 * stRand(0), 0.0, 0.0, 1.0);
    vec4 c = stAt(ip);
    float rho = c.r;
    float phi = c.g;
    float food = smoothstep(0.55, 0.9, luma(phAt(vec2(ip) + 0.5, 1.5)));
    float ev = 0.04 + 0.08 * clamp(audioSwell, 0.0, 1.0);
    float rx = stAt(ip + ivec2(1, 0)).r - stAt(ip - ivec2(1, 0)).r;
    float ry = stAt(ip + ivec2(0, 1)).r - stAt(ip - ivec2(0, 1)).r;
    float px = stAt(ip + ivec2(1, 0)).g - stAt(ip - ivec2(1, 0)).g;
    float py = stAt(ip + ivec2(0, 1)).g - stAt(ip - ivec2(0, 1)).g;
    vec4 lap = stLap(ip);
    float chi = 3.2;
    float excl = clamp(1.0 - rho / 2.5, 0.0, 1.0);
    float dRho = 0.25 * lap.r - chi * 0.25 * (rx * px + ry * py + rho * lap.g) * excl;
    float dPhi = 0.2 * lap.g - ev * phi + 0.12 * rho * (1.0 + 0.6 * food) + 0.03 * food;
    float nrho = clamp(rho + 0.1 * dRho + 0.004 * (stRand(1) - 0.5), 0.01, 4.0);
    float nphi = clamp(phi + 0.5 * dPhi, 0.0, 4.0);
    float mass = 1.0 + 0.0 * clamp(audioSpread, 0.0, 1.0);
    return vec4(nrho, nphi, 0.0, 1.0);
}
void main()
{
    if (statePass == 1) { fragColor = stateStep(); return; }
    vec2 p = screenP();
    float zoom = 1.0 - 0.45 * clamp(scaleP, 0.0, 1.0);
    vec2 cc = stView(p, zoom);
    vec4 s = stLin(cc);
    vec3 ph = phAt(cc, 0.8);
    float road = smoothstep(0.4, 2.2, s.g);
    vec3 col = ph * (0.5 + 0.3 * smoothstep(0.3, 1.5, s.r)) + imgPalette(0.7) * road * 0.8 + vec3(1.0, 0.85, 0.5) * smoothstep(1.2, 2.5, s.r) * 0.3;
    finish(col);
}
