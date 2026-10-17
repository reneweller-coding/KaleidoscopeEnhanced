//@doc
 * @brief WAVE PACKET KALEIDO: Gaussian wave packets -- little bundles of waves with a carrier inside a bell-shaped
 * envelope -- travel and spread out (the free Schroedinger packet disperses), inside a kaleidoscope whose mirrors
 * reflect them, so they meet their own mirror images and interfere in fringes.  The packets are launched anew every
 * few seconds; their density lays bare the photo, their phase colours it.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell      -> the packets' initial width (narrow ones spread faster)
 *   audioPhase      -> the kaleidoscope turns (integrated)
 *   audioKick       -> the fringes flash (light)
 *
 * Knobs: mirrorsP (mirrors of the kaleidoscope: 3 .. 8), packetsP (how many packets), photoP (photo share), hueP.
//@params mirrorsP packetsP photoP
//@audio audioSwell audioKick
//@body
void main()
{
    vec2 p = screenP();
    // the kaleidoscope: fold the plane into a mirrored wedge
    float nm = 3.0 + floor(5.99 * clamp(mirrorsP, 0.0, 1.0));
    float r = length(p), a = atan(p.y, p.x) + 0.05 * audioPhase + 0.01 * sceneTime;
    float sec = 3.14159265 / nm;
    a = abs(mod(a, 2.0 * sec) - sec);
    vec2 x = r * vec2(cos(a), sin(a));
    int n = 3 + int(5.0 * clamp(packetsP, 0.0, 1.0));
    vec2 psi = vec2(0.0);
    for (int i = 0; i < 8; ++i) {
        if (i >= n) break;
        float fi = float(i);
        float life = 7.0 + 4.0 * hash11(fi * 1.9);
        float t0 = sceneTime + life * hash11(fi * 4.3);
        float gen = floor(t0 / life), t = fract(t0 / life) * life;
        // start inside the kaleidoscope's wedge, so the packet is seen
        float sr = 0.15 + 0.6 * hash11(fi * 2.3 + gen), sa = sec * hash11(fi * 6.1 + gen);
        vec2 start = sr * vec2(cos(sa), sin(sa));
        float ang = 6.2831853 * hash11(fi * 8.7 + gen * 1.3);
        vec2 kv = 40.0 * vec2(cos(ang), sin(ang));
        float s0 = 0.04 + 0.05 * clamp(audioSwell, 0.0, 1.0);
        // the free packet: width s(t)^2 = s0^2 (1 + i t / (2 s0^2) * hb), centre moving with k
        float hb = 0.004;
        vec2 c = start + kv * hb * t;
        vec2 q = vec2(s0 * s0, hb * t * 0.5);                   // complex width
        vec2 iq = vec2(q.x, -q.y) / dot(q, q);
        float fade = sin(3.14159265 * t / life);
        // the packet and its images in the wedge's two mirrors: it bounces off them and interferes with itself
        for (int m = 0; m < 3; ++m) {
            vec2 xm = x;
            if (m == 1) xm.y = -xm.y;
            if (m == 2) xm = reflect(xm, vec2(-sin(sec), cos(sec)));
            vec2 d = xm - c;
            float ex = -dot(d, d) * 0.25;
            vec2 env = vec2(ex * iq.x, ex * iq.y);             // -(d.d) / (4 q)
            float mag = exp(env.x) * s0 / sqrt(length(q));
            float ph = env.y + dot(kv, d) - 0.5 * hb * dot(kv, kv) * t;
            psi += mag * vec2(cos(ph), sin(ph)) * fade;
        }
    }
    float I = dot(psi, psi);
    float lit = 1.0 - exp(-I * 4.0);
    vec2 uv = x * 0.7 + 0.5;
    vec3 photo = imgLod(uv, 0.5);
    vec3 tone = imgPalette(atan(psi.y, psi.x) / 6.2831853 + 0.03 * audioPhase);
    vec3 col = mix(tone * 1.2, photo * 1.4, 0.35 + 0.5 * clamp(photoP, 0.0, 1.0)) * lit + photo * 0.08;
    col += mix(tone, vec3(1.0), 0.6) * smoothstep(0.8, 1.0, lit) * 0.25 * (0.5 + clamp(audioKick, 0.0, 1.0));
    finish(col);
}
