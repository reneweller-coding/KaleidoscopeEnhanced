//@doc
 * @brief SCHROEDINGER PHOTO POTENTIAL: a wave packet in a potential that is the photo: it scatters on the bright barriers, tunnels through the thin places and interferes in the hollows, a quantum particle moving through the
 * picture; the density of the packet is the glow on the photo, whose own colours are the potential seen as a landscape.  The packet is calculated in a small field of the scene's own (a Visscher scheme), a new packet entering every
 * few seconds from a new side: its energy follows the swell of the music, its direction the key.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell      -> the energy (the wave number) of the packet
 *   audioHarmAdvance -> the direction the packet comes from follows the key
 *
 * Knobs: barrierP (the height of the barriers), hueP.
//@params barrierP
//@audio audioSwell audioHarmAdvance
//@state 320 180 360 32
//@body
/**  The photo coordinate of a field cell.
 *
 * @param c  The cell coordinate. (in)
 *
 * @return
 *   The photo coordinate.
 **/
vec2 photoUV(vec2 c) { return ((c / stateRes) - 0.5) * vec2(1.7778, 1.0) * 0.8 + 0.5; }
/**  One step of the Schroedinger equation in the photo's potential, the real and imaginary parts updated in turn (the state pass).
 *
 * @return
 *   The real part, the imaginary part, 0, 1.
 **/
vec4 stateStep()
{
    ivec2 ip = stCell();
    if (stateFrame < 0.5) return vec4(0.0, 0.0, 0.0, 1.0);
    vec4 c = stAt(ip);
    float l = luma(imgLod(photoUV(vec2(ip) + 0.5), 2.0));
    float V = (0.15 + 0.9 * clamp(barrierP, 0.0, 1.0)) * l * l;
    vec4 e = stAt(ip + ivec2(1, 0)), w = stAt(ip - ivec2(1, 0)), n = stAt(ip + ivec2(0, 1)), s = stAt(ip - ivec2(0, 1));
    float dt = 0.35;
    float R = c.r, I = c.g;
    if (mod(stateFrame, 2.0) < 1.0) {
        float H = -0.5 * (e.g + w.g + n.g + s.g - 4.0 * I) + V * I;
        R += dt * H;
    } else {
        float H = -0.5 * (e.r + w.r + n.r + s.r - 4.0 * R) + V * R;
        I -= dt * H;
    }
    vec2 q = (vec2(ip) + 0.5) / stateRes;
    float edge = min(min(q.x, 1.0 - q.x), min(q.y, 1.0 - q.y));
    float ab = 1.0 - 0.04 * smoothstep(0.1, 0.0, edge);
    R *= ab; I *= ab;
    float cyc = floor(stateFrame / 2400.0);
    float ph = mod(stateFrame, 2400.0);
    if (ph < 90.0) {
        float side = hash11(cyc * 3.7 + 0.3);
        float dirA = 6.2831853 * (side + 0.2 * sin(0.45 * audioHarmAdvance));
        vec2 kdir = vec2(cos(dirA), sin(dirA));
        vec2 start = stateRes * (0.5 - 0.38 * kdir);
        vec2 d = vec2(ip) + 0.5 - start;
        float amp = 0.014 * exp(-dot(d, d) / 50.0);
        float kk = 0.7 + 0.8 * clamp(audioSwell, 0.0, 1.0);
        float phs = kk * dot(d, kdir);
        R += amp * cos(phs); I += amp * sin(phs);
    }
    return vec4(R, I, 0.0, 1.0);
}
void main()
{
    if (statePass == 1) { fragColor = stateStep(); return; }
    vec2 p = screenP();
    float asp = resolution.x / resolution.y;
    vec2 cc = (p / vec2(asp, 1.0) + 0.5) * stateRes;
    vec4 s = stLin(cc);
    float dens = s.r * s.r + s.g * s.g;
    vec3 c = imgLod(p * 0.8 + 0.5, 0.7);
    float glow = pow(clamp(dens * 900.0, 0.0, 6.0), 0.6);
    finish(c * (0.4 + 0.4 * glow) + 0.5 * glow * mix(c, vec3(1.0), 0.6) * 0.5);
}
