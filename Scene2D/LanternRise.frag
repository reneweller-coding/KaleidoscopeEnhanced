#version 330 core
out vec4 fragColor;
/**
 * @file LanternRise.frag
 * @brief LANTERN RISE: the night of the lantern festival.  Over a wide
 * river at dusk, hundreds of paper sky lanterns drift up into a deep blue
 * sky -- warm glowing shells with a bright flame at the base, near ones
 * large and soft, far ones tiny sparks thinning into the stars -- and the
 * river doubles them in shimmering streaks.  On the far bank a temple
 * roofline and a crowd stand in silhouette, a few floating krathong candles
 * drift on the water.  The lanterns rise at their own gentle pace and sway
 * in the breeze; the music is their glow.
 *
 * Replaces a Scene3D point-sprite version (grey dots in the catalogue).
 *
 * Audio Reactivity:
 *   audioSwell -> the lanterns' glow (slow)
 *   audioKick  -> the flames flare (light only)
 *   audioLevel -> brightness
 *   audioChromaHue -> photo tint of the paper
 *   sceneTime / sceneAdvance -> rising, swaying, the river (continuous)
 */

uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float sceneTime;
uniform float sceneAdvance;
uniform float audioAdvance;
uniform float audioSwell;
uniform float audioKick;
uniform float audioLevel;
uniform float audioValence;
uniform float audioChromaHue;

vec3 img(vec2 uv) {
    return (interpolation * texture(tex0, uv) + (1.0 - interpolation) * texture(tex1, uv)).rgb;
}

vec3 imgPalette(float t)
{
    float ang = audioChromaHue + audioAdvance * 0.04 + t * 6.2831853;
    float rad = 0.16 + 0.08 * sin(audioAdvance * 0.013);
    vec3  pc  = img(clamp(vec2(0.5) + rad * vec2(cos(ang), sin(ang)), 0.0, 1.0));
    float pg  = dot(pc, vec3(0.333));
    return mix(vec3(pg), pc, 0.55 + 0.45 * audioValence);
}

float hash21(vec2 p)
{
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
}
float noise2(vec2 p)
{
    vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x),
               mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), f.x), f.y);
}

// The lanterns of one depth layer at screen point p.  Each column of cells
// carries lanterns rising continuously; returns premultiplied glow.
vec3 lanterns(vec2 p, float scale, float speed, float T, float layer, vec3 paper, float glow, float kick, float sparse)
{
    vec3 c = vec3(0.0);
    vec2 g = p * scale;
    float colI = floor(g.x);
    for (int dx = -1; dx <= 1; ++dx) {
        float cx = colI + float(dx);
        float h = hash21(vec2(cx, layer));
        float y = g.y - T * speed * (0.7 + 0.6 * h);          // rising: the pattern moves up
        float cy = floor(y);
        for (int dy = -1; dy <= 1; ++dy) {
            float cid = cy + float(dy);
            float hh = hash21(vec2(cx * 7.1 + cid, layer + 3.0));
            if (hh < sparse) continue;
            float sway = 0.18 * sin(T * 0.5 * (0.6 + hh) + hh * 20.0);
            vec2 ctr = vec2(cx + 0.5 + 0.5 * (hash21(vec2(cid, cx + layer)) - 0.5) + sway, cid + 0.5);
            vec2 d = vec2(g.x - ctr.x, y - ctr.y);
            // The shell: a slightly tapered glowing cylinder; the flame at its base.
            float w = 0.16 - 0.03 * d.y;
            float shell = smoothstep(0.02, -0.02, max(abs(d.x) - w, abs(d.y) - 0.22));
            float flame = exp(-dot(d - vec2(0.0, -0.17), d - vec2(0.0, -0.17)) * 180.0);
            float halo = exp(-dot(d, d) * 9.0);
            float flick = 0.85 + 0.15 * sin(T * 7.0 + hh * 40.0);
            vec3 pc = paper * (0.55 + 0.6 * smoothstep(0.22, -0.2, d.y));   // brighter near the flame
            c += (pc * shell * 0.9 + vec3(1.0, 0.85, 0.5) * flame * (1.2 + 1.5 * kick) * flick + paper * halo * 0.18) * glow;
        }
    }
    return c;
}

void main()
{
    float aspect = resolution.x / resolution.y;
    vec2 uv = gl_FragCoord.xy / resolution;
    vec2 p = (uv - 0.5) * vec2(aspect, 1.0);
    float swell = clamp(audioSwell, 0.0, 1.0);
    float kick = clamp(audioKick, 0.0, 1.0);
    float T = sceneTime + sceneAdvance * 0.5;
    float glow = 0.85 + 0.35 * swell;
    vec3 paper = mix(vec3(1.0, 0.55, 0.2), imgPalette(0.08), 0.18);

    float horizon = -0.2;
    // Dusk sky: deep blue above, a last violet-orange glow low down.
    vec3 sky = mix(vec3(0.35, 0.18, 0.25), vec3(0.03, 0.05, 0.14), smoothstep(horizon, 0.35, p.y));
    sky = mix(sky, vec3(0.01, 0.02, 0.07), smoothstep(0.3, 0.6, p.y));
    {
        vec2 g = p * 90.0;
        vec2 gi = floor(g), gf = fract(g);
        vec2 sc = 0.25 + 0.5 * vec2(hash21(gi + 1.0), hash21(gi + 2.0));
        sky += vec3(0.8, 0.85, 1.0) * smoothstep(0.1, 0.0, length(gf - sc)) * step(0.985, hash21(gi)) * smoothstep(0.0, 0.3, p.y) * 0.6;
    }

    // Lanterns in the sky: far (tiny, many) to near (big, few).
    vec3 lan = vec3(0.0);
    vec2 ps = p - vec2(0.0, horizon);
    if (ps.y > 0.0) {
        lan += lanterns(ps, 42.0, 0.9, T, 1.0, paper, glow * 0.55, kick, 0.7 + 0.2 * smoothstep(0.1, 0.6, ps.y)) * smoothstep(0.0, 0.1, ps.y);
        lan += lanterns(ps, 22.0, 0.55, T, 2.0, paper, glow * 0.8, kick, 0.72) * smoothstep(0.0, 0.12, ps.y);
        lan += lanterns(ps, 11.0, 0.3, T, 3.0, paper, glow, kick, 0.8);
    }
    vec3 col = sky + lan;
    // A warm haze the crowd of lanterns lights in the air.
    col += paper * 0.08 * smoothstep(0.5, -0.1, p.y) * glow;

    // Far bank: temple roofs, trees and the crowd in silhouette.
    float bank = horizon + 0.03 + 0.02 * noise2(vec2(p.x * 8.0, 1.0));
    // Temple: stacked pointed roofs at left of centre.
    vec2 tq = p - vec2(-0.45, horizon + 0.03);
    float roof = 0.0;
    for (int k = 0; k < 3; ++k) {
        float fk = float(k);
        float wy = tq.y - fk * 0.045;
        float wdt = 0.16 - fk * 0.045;
        roof = max(roof, step(0.0, wy) * step(wy, 0.05) * step(abs(tq.x), wdt - wy * 1.4));
    }
    roof = max(roof, step(abs(tq.x), 0.006) * step(0.0, tq.y) * step(tq.y, 0.2));       // the spire
    float sil = max(step(p.y, bank), roof);
    // The crowd on the near side of the bank: heads and raised arms.
    float crowdTop = horizon + 0.012 + 0.012 * noise2(vec2(p.x * 60.0, 3.0)) + 0.01 * step(0.8, noise2(vec2(p.x * 25.0, 7.0)));
    sil = max(sil, step(p.y, crowdTop) * step(horizon - 0.02, p.y));
    col = mix(col, vec3(0.02, 0.02, 0.04) + paper * 0.03, sil);

    // The river: mirrored sky and lanterns, broken into ripple streaks.
    if (p.y < horizon - 0.02) {
        float d = (horizon - 0.02) - p.y;
        float rip = noise2(vec2(p.x * 30.0, d * 140.0 - T * 0.8)) - 0.5;
        vec2 rp = vec2(p.x + rip * 0.008 * (1.0 + d * 4.0), d * 1.1);
        vec3 rsky = mix(vec3(0.3, 0.16, 0.22), vec3(0.03, 0.05, 0.14), smoothstep(0.0, 0.5, rp.y));
        vec3 rl = lanterns(rp, 22.0, 0.55, T, 2.0, paper, glow * 0.7, kick, 0.72) + lanterns(rp, 11.0, 0.3, T, 3.0, paper, glow * 0.8, kick, 0.8);
        // Vertical streaking: reflections smear along the ripples.
        vec3 w = (rsky + rl * (0.6 + 0.6 * abs(rip))) * 0.75;
        w += paper * 0.05 * glow;
        col = w;
        // Floating krathong: small candle-lit rafts drifting on the current.
        for (int k = 0; k < 6; ++k) {
            float fk = float(k);
            float kx = mod(hash21(vec2(fk, 9.0)) * 3.0 + T * 0.015 * (0.5 + hash21(vec2(fk, 4.0))), 3.0) - 1.5;
            float ky = horizon - 0.08 - 0.3 * hash21(vec2(fk, 5.0));
            vec2 kd = p - vec2(kx * aspect * 0.6, ky);
            float sz = 0.6 + 1.2 * (horizon - ky);
            col += vec3(1.0, 0.75, 0.35) * exp(-dot(kd, kd) / (0.00004 * sz * sz)) * (1.0 + kick);
            col += vec3(1.0, 0.6, 0.25) * exp(-dot(kd * vec2(1.0, 0.25), kd * vec2(1.0, 0.25)) / (0.0006 * sz)) * 0.25;
        }
    }

    col *= 0.9 + 0.2 * audioLevel;
    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
