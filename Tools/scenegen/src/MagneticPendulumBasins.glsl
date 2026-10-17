//@doc
 * @brief MAGNETIC PENDULUM BASINS: a pendulum swinging over three to six magnets comes to rest above one of them --
 * which one depends on where it was let go, and near the boundaries the answer is fractal: basins interleaved on
 * every scale, spiral arms of every colour wound round each other.  The magnets wander slowly, so the basins flow
 * and their boundaries churn.  Each basin is its own cut of the photo, shaded by how long the swing lasted.
 *
 * Audio Reactivity (structure, not only light):
 *   audioHarmAdvance -> each change of harmony brings one more magnet (three to six and round again; the new one
 *                      grows in)
 *   audioPhase      -> the magnets' slow dance (integrated)
 *   audioSwell      -> the friction (quiet music: longer swings, finer fractal)
 *   audioKick       -> the boundaries flash (light)
 *
 * Knobs: spanP (how much of the plane the frame shows), pullP (the magnets' strength), photoP (photo share), hueP.
//@params spanP pullP photoP
//@audio audioSwell audioKick audioHarmAdvance
//@body
void main()
{
    vec2 p = screenP();
    float h = max(audioHarmAdvance, 0.0);
    float nm = 3.0 + mod(floor(h), 4.0);
    float grow = smoothstep(0.2, 0.8, fract(h));                // the next magnet grows in while the harmony changes
    int count = int(nm) + 1;
    vec2 mag[7];
    float str[7];
    for (int i = 0; i < 7; ++i) {
        float fi = float(i);
        float a = 6.2831853 * fi / max(nm + grow, 1.0) + 0.05 * audioPhase + 0.3 * sin(0.03 * sceneTime + fi);
        mag[i] = 0.55 * vec2(cos(a), sin(a)) * (0.8 + 0.2 * sin(0.05 * sceneTime + 2.0 * fi));
        str[i] = i < int(nm) ? 1.0 : (i == int(nm) ? grow : 0.0);
    }
    float span = 1.2 + 1.6 * clamp(spanP, 0.0, 1.0);
    vec2 x = p * span, v = vec2(0.0);
    float pull = 0.6 + 0.8 * clamp(pullP, 0.0, 1.0);
    float fric = 0.12 + 0.18 * clamp(audioSwell, 0.0, 1.0);
    float dt = 0.05;
    int best = 0;
    float steps = 0.0;
    for (int s = 0; s < 160; ++s) {
        vec2 acc = -0.4 * x - fric * v;
        for (int i = 0; i < 7; ++i) {
            if (i >= count) break;
            vec2 d = mag[i] - x;
            float r2 = dot(d, d) + 0.04;
            acc += pull * str[i] * d / (r2 * sqrt(r2));
        }
        v += dt * acc;
        x += dt * v;
        steps += 1.0;
        if (dot(v, v) < 0.0004 && s > 20) break;
    }
    float bd = 1e9;
    for (int i = 0; i < 7; ++i) {
        if (i >= count) break;
        float d = length(x - mag[i]);
        if (d < bd && str[i] > 0.5) { bd = d; best = i; }
    }
    float fb = float(best);
    vec2 uv = p * 0.7 + 0.5 + vec2(0.31, 0.57) * fb;
    vec3 photo = imgLod(uv, 0.5);
    vec3 tone = imgPalette(fb / 7.0 + 0.03 * audioPhase);
    float lasted = steps / 160.0;
    // each basin its own brightness as well as its own cut and tone, so neighbours always part
    float lvl = 0.45 + 0.55 * fract(fb * 0.618 + 0.2);
    vec3 tn = tone / max(max(tone.r, tone.g), max(tone.b, 0.05));   // the tone at full brightness
    vec3 col = mix(tn * 0.9, photo * 1.7, 0.3 + 0.5 * clamp(photoP, 0.0, 1.0)) * (0.35 + lvl) * (1.1 - 0.3 * lasted);
    float edge = abs(dFdx(fb)) + abs(dFdy(fb));
    col += mix(tone, vec3(1.0), 0.5) * min(edge, 1.0) * 0.25 * (0.4 + clamp(audioKick, 0.0, 1.0));
    finish(col);
}
