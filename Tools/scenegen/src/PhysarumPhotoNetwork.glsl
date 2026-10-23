//@doc
 * @brief PHYSARUM PHOTO NETWORK: slime-mould cells that strive toward the brightness of the photo and lay veins between the bright zones: a network of veins that joins the photo's lights.  The cells are a density that moves
 * up the gradient of a chemical they themselves release and the bright places feed (the Keller-Segel model of chemotaxis, which forms exactly such networks); the density and the chemical are calculated in a small field of the
 * scene's own.  The veins wear the photo's colours.  The strength of the chemotaxis follows the spectral spread.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSpread     -> the strength of the chemotaxis (more spread, finer networks)
 *   audioSwell      -> the glow of the veins
 *
 * Knobs: foodP (how strongly the photo's light feeds the network), hueP.
//@params foodP
//@audio audioSpread audioSwell
//@state 320 180 400 32
//@body
/**  The photo coordinate of a field cell.
 *
 * @param c  The cell coordinate. (in)
 *
 * @return
 *   The photo coordinate.
 **/
vec2 photoUV(vec2 c) { return ((c / stateRes) - 0.5) * vec2(1.7778, 1.0) * 0.8 + 0.5; }
/**  One step of the Keller-Segel model with the photo as food (the state pass).
 *
 * @return
 *   The cell density, the chemical, 0, 1.
 **/
vec4 stateStep()
{
    ivec2 ip = stCell();
    if (stateFrame < 0.5) return vec4(0.35 + 0.15 * stRand(1), 0.0, 0.0, 1.0);
    vec4 c = stAt(ip);
    vec4 e = stAt(ip + ivec2(1, 0)), w = stAt(ip - ivec2(1, 0)), n = stAt(ip + ivec2(0, 1)), s = stAt(ip - ivec2(0, 1));
    float u = c.r, v = c.g;
    float chemo = 0.5 * (u + e.r) * (e.g - v) - 0.5 * (u + w.r) * (v - w.g) + 0.5 * (u + n.r) * (n.g - v) - 0.5 * (u + s.r) * (v - s.g);
    float food = (0.01 + 0.05 * clamp(foodP, 0.0, 1.0)) * luma(imgLod(photoUV(vec2(ip) + 0.5), 2.0));
    float chi = 0.5 + 0.9 * clamp(audioSpread, 0.0, 1.0);
    float dt = 0.2;
    float un = u + dt * (0.15 * (e.r + w.r + n.r + s.r - 4.0 * u) - chi * chemo + 0.05 * u * (1.0 - u * 0.7));
    float vn = v + dt * (1.0 * (e.g + w.g + n.g + s.g - 4.0 * v) + 0.5 * u - 0.1 * v + food);
    return vec4(clamp(un, 0.0, 6.0), clamp(vn, 0.0, 30.0), 0.0, 1.0);
}
void main()
{
    if (statePass == 1) { fragColor = stateStep(); return; }
    vec2 p = screenP();
    float asp = resolution.x / resolution.y;
    vec2 cc = (p / vec2(asp, 1.0) + 0.5) * stateRes;
    vec4 s = stLin(cc);
    float vein = smoothstep(0.15, 1.1, s.r);
    vec3 c = imgLod(p * 0.8 + 0.5, 0.7);
    float gl = 0.7 + 0.8 * clamp(audioSwell, 0.0, 1.0);
    finish(c * (0.3 + 1.0 * vein * gl) + 0.2 * pow(vein, 3.0) * mix(c, vec3(1.0), 0.5));
}
