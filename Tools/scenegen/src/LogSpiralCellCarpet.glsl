//@doc
 * @brief LOG SPIRAL CELL CARPET: a carpet of whirls: the plane cut into the cells of a logarithmic spiral lattice (sectors that wind round the middle),
 * every cell showing the photo in a window turned by its own angle and so a carpet that spins; the cells grow outward and the whole lattice winds slowly.
 * No hole at the centre: it fills with ever smaller cells.
 *
 * Audio Reactivity (structure, not only light):
 *   audioPhase      -> the lattice winds and every cell's picture turns (integrated)
 *   audioSwell      -> the cells' windows zoom
 *
 * Knobs: armsP (the number of sectors), windP (how tightly they wind), hueP.
//@params armsP windP
//@audio audioSwell
//@body
void main()
{
    vec2 p = screenP();
    float t = sceneTime * 0.1 + 0.8 * audioPhase;
    float n = 6.0 + 2.0 * floor(5.0 * clamp(armsP, 0.0, 1.0));
    float k = 2.2 + 2.5 * clamp(windP, 0.0, 1.0);
    float r = max(length(p), 1e-3);
    float u = (atan(p.y, p.x) / 6.2831853 + 0.5) * n;
    float shear = 0.5 * n * 0.5;
    float v = log(r) * k + 0.5 * u + 0.15 * t;
    float iu = floor(u), iv = floor(v);
    vec2 f = vec2(fract(u), fract(v)) - 0.5;
    float a = (iu + 0.5) / n * 6.2831853 - 3.14159265;
    float lr = ((iv + 0.5) - 0.15 * t - 0.5 * (iu + 0.5)) / k;
    float rc = exp(lr);
    vec2 centre = rc * vec2(cos(a), sin(a));
    vec2 d = (p - centre) / max(rc * 6.2831853 / n * 0.5, 1e-4);
    float ang = 1.5 * sin(0.5 * t + 1.3 * iu + 0.7 * iv) ;
    float z = 0.45 + 0.2 * clamp(audioSwell, 0.0, 1.0);
    vec2 uv = rot2(ang) * d * z + 0.5 + 0.12 * (hash22(vec2(iu, iv)) - 0.5);
    vec3 col = imgLod(uv, 0.5 + 1.0 * smoothstep(0.0, -3.0, lr));
    col *= 0.85 + 0.25 * smoothstep(0.0, 0.08, 0.5 - max(abs(f.x), abs(f.y)));
    finish(col * 1.05);
}
