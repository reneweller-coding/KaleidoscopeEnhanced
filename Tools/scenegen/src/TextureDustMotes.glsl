//@doc
 * @brief TEXTURE DUST MOTES: a quiet sunbeam in a dim old room -- a broad
 * slanting shaft of light crosses the view, and in it thousands of dust
 * motes drift and swirl lazily in the air currents, sparkling when they
 * catch the light and vanishing when they leave the beam; behind, the
 * photograph hangs in the dim room, dimly lit by the scattered light.
 * The beam slowly shifts as the sun moves.  Endless, mirrorable.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the motes drift (integrated, jump-free)
 *   audioSpread     -> the beam widens
 *   audioHigh       -> the motes sparkle (light)
 *   audioKick       -> the beam brightens (light)
 *   audioMode       -> the light: cool morning in minor, golden afternoon in major
 *   audioSwell      -> the room's dim light (slow)
 *
 * Knobs: moteP (mote density), beamP (beam angle), swirlP (air currents), hueP.
//@params moteP beamP swirlP
//@audio audioSpread audioHigh audioKick audioMode audioSwell
//@body
void main()
{
    vec2 p = screenP();
    float kick = clamp(audioKick, 0.0, 1.0);
    float hi = clamp(audioHigh * 1.5, 0.0, 1.0);
    float swell = clamp(audioSwell, 0.0, 1.0);
    float mode = clamp(audioMode, 0.0, 1.0);
    vec3 lc = mix(vec3(0.8, 0.88, 1.0), vec3(1.15, 0.9, 0.6), mode);
    // The beam: a slanting band (repeating every 2.2 units so the plane is endless).
    float ang = -0.9 + 0.5 * clamp(beamP, 0.0, 1.0) + 0.08 * sin(0.01 * sceneTime);
    vec2 bd = vec2(cos(ang), sin(ang));
    float across = dot(p, vec2(-bd.y, bd.x)) + 0.1 * sin(0.013 * sceneTime);
    across = mod(across + 1.1, 2.2) - 1.1;
    float bw = 0.15 + 0.15 * clamp(audioSpread, 0.0, 1.0);
    float beam = smoothstep(bw, bw * 0.4, abs(across));
    beam *= 0.8 + 0.2 * noise2(vec2(dot(p, bd) * 3.0, across * 20.0));   // soft window-frame striations
    // The room behind.
    vec2 uv = p * 0.5 + 0.5;
    vec3 room = imgLod(uv, 1.5) * (0.06 + 0.15 * swell);
    vec3 col = room + lc * beam * (0.12 + 0.15 * kick);
    // Motes: several layers of round specks drifting in swirling air.
    float T = 0.05 * sceneTime + 0.35 * audioAdvance;
    float sw = 0.02 + 0.06 * clamp(swirlP, 0.0, 1.0);
    for (int L = 0; L < 3; ++L) {
        float fl = float(L);
        float S = 30.0 + 25.0 * fl;
        vec2 air = sw * vec2(sin(p.y * 3.0 + T * 2.0 + fl), cos(p.x * 2.5 - T * 1.6 + fl));
        vec2 g = (p + air) * S + vec2(T * 2.0, -T * 1.2) * (1.0 + 0.3 * fl) + fl * 9.0;
        vec2 gi = floor(g), gf = fract(g);
        vec2 c = 0.2 + 0.6 * hash22(gi + fl);
        float on = step(hash21(gi + 3.0 + fl), 0.15 + 0.4 * clamp(moteP, 0.0, 1.0));
        float d = length(gf - c);
        float tw = 0.5 + 0.5 * sin(sceneTime * (1.0 + 2.0 * hash21(gi)) + hash21(gi + 1.0) * 30.0);
        float spark = pow(tw, 6.0) * hi;
        float I = (0.5 + 0.5 * tw + 2.0 * spark) / (1.0 + fl * 0.4);
        col += lc * on * beam * (smoothstep(0.22, 0.05, d) * 1.1 + exp(-d * 6.0) * 0.15) * I;
    }
    col = mix(col, col * glowColour(imgLod(uv, 6.0), p, hueP * 0.159) * 1.3, 0.06);
    finish(col);
}
