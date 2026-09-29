#version 330 core
out vec4 fragColor;
/**
 * @file ChandBaoriStepwell.frag
 * @brief CHAND BAORI STEPWELL: an Indian stepwell seen from straight above --
 * a square funnel of sandstone sinking level after level toward a small
 * pool of green water at the bottom, every level a zigzag of double
 * flights of steps, thousands of treads catching the sun and thousands of
 * risers in shadow.  The rim wall throws a hard diagonal shadow down into
 * the well that creeps around as the sun moves; the water glints.  The
 * camera is still; the light wanders slowly.
 *
 * Audio Reactivity:
 *   audioSwell  -> the warmth and strength of the sunlight (slow)
 *   audioHigh   -> glints on the water (light)
 *   audioLevel  -> brightness
 *   sceneTime / sceneAdvance -> the wandering sun (continuous)
 *
 * Per-activation variety: levelsP (how deep the well), hueP.
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
uniform float audioHigh;
uniform float audioLevel;
uniform float audioValence;
uniform float audioChromaHue;

uniform float levelsP;
uniform float hueP;

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

void main()
{
    float aspect = resolution.x / resolution.y;
    vec2 uv = gl_FragCoord.xy / resolution;
    vec2 p = (uv - 0.5) * vec2(aspect, 1.0);
    float swell = clamp(audioSwell, 0.0, 1.0);
    float hi = clamp(audioHigh * 2.0, 0.0, 1.0);
    float T = sceneTime + sceneAdvance * 0.4;

    const float S0 = 0.46;                  // half size of the rim
    const float RK = 0.9;                   // each level this much smaller (perspective)
    float nLev = 11.0 + floor(clamp(levelsP, 0.0, 1.0) * 4.99);
    float sWater = S0 * pow(RK, nLev);

    // The sun wanders around the well; its light is the swell.
    float az = 0.7 + T * 0.012;
    vec2 ld = vec2(cos(az), sin(az));                        // direction toward the sun
    vec3 sunC = mix(vec3(1.0, 0.9, 0.75), vec3(1.0, 0.75, 0.5), 0.3 + 0.4 * swell) * (0.9 + 0.35 * swell);
    vec3 shadeC = vec3(0.36, 0.38, 0.5);

    vec3 stone = mix(vec3(0.86, 0.7, 0.52), imgPalette(0.08 + hueP * 0.159) * vec3(1.0, 0.8, 0.6), 0.12);
    vec3 col;
    float m = max(abs(p.x), abs(p.y));
    float depth;                                              // how deep the point lies (in levels)
    if (m > S0) {
        // The plaza around the well: flagstones, the rim wall's lip.
        vec2 fq = p * vec2(20.0, 28.0);
        float joint = min(0.5 - abs(fract(fq.x + 0.5 * floor(fq.y)) - 0.5), 0.5 - abs(fract(fq.y) - 0.5));
        float grain = 0.6 * noise2(p * 300.0) + 0.4 * noise2(p * 90.0);
        col = stone * (0.9 + 0.1 * grain) * (0.88 + 0.12 * smoothstep(0.0, 0.08, joint)) * (0.97 + 0.06 * hash21(floor(vec2(fq.x + 0.5 * floor(fq.y), fq.y)))) * sunC;
        col *= mix(0.6, 1.0, smoothstep(S0, S0 + 0.012, m)) * mix(1.0, 0.72, smoothstep(S0 + 0.05, 0.9, m));
        depth = 0.0;
    } else if (m < sWater) {
        // The pool: deep green water, the sky and the rim mirrored faintly.
        vec2 wq = p / sWater;
        float rip = noise2(wq * 8.0 + vec2(T * 0.1, 0.0)) + noise2(wq * 13.0 - vec2(0.0, T * 0.08));
        col = mix(vec3(0.05, 0.16, 0.1), vec3(0.14, 0.3, 0.2), 0.5 + 0.3 * (rip - 1.0));
        // Round glints of the sun on the ripples.
        vec2 gq = wq * 14.0, gi = floor(gq), gf = fract(gq);
        vec2 gc = 0.25 + 0.5 * vec2(hash21(gi), hash21(gi + 3.0));
        float tw = 0.5 + 0.5 * sin(T * 1.3 + hash21(gi + 7.0) * 40.0);
        col += vec3(1.0, 0.95, 0.8) * smoothstep(0.12, 0.0, length(gf - gc)) * step(0.8, hash21(gi + 5.0)) * tw * (0.2 + 0.9 * hi);
        depth = nLev + 0.5;
    } else {
        // The levels: which one, and where across its band (0 outer .. 1 inner).
        float fi = log(m / S0) / log(RK);
        float lev = floor(fi);
        float b = fract(fi);
        depth = fi;
        // Which side of the square, the coordinate along it and the
        // direction the steps face (inward, toward the pool).
        vec2 inward;
        float a;
        if (abs(p.x) > abs(p.y)) { inward = vec2(-sign(p.x), 0.0); a = p.y / m; }
        else                     { inward = vec2(0.0, -sign(p.y)); a = p.x / m; }
        // Double flights crossing in X patterns along the side.
        float K = max(2.0, floor(7.0 * pow(RK, lev) + 0.5)) * 2.0;
        float u = fract((a * 0.5 + 0.5) * K);
        float fw = 0.27;
        float f1 = abs(b - u), f2 = abs(b - (1.0 - u));
        float flightD = min(f1, f2);
        float aa = fwidth(fi) * 1.5 + 1e-4;
        float flight = smoothstep(fw + aa, fw - aa, flightD);
        // A walkway landing along the top of each level.
        float landing = smoothstep(0.1 + aa, 0.1 - aa, b);
        // Treads lit from above, risers facing the pool: lit only when the
        // sun stands on the far side.
        float nT = 6.0;
        float st = fract(b * nT);
        float sAA = fwidth(b * nT) * 1.5;
        float riser = smoothstep(0.6 - sAA, 0.6 + sAA, st) * smoothstep(1.0 + sAA, 1.0 - sAA, st);
        riser = mix(riser, 0.4, clamp(sAA * 2.0 - 0.3, 0.0, 1.0));   // fine steps far down blend out
        float riserLit = clamp(dot(inward, ld) * 1.4 + 0.25, 0.0, 1.0);
        float stairs = mix(1.0, mix(0.35, 1.05, riserLit), riser);
        // Between the flights: steep wall faces, lit by the side they face.
        float wallLit = mix(0.3, 0.8, clamp(dot(inward, ld) * 0.8 + 0.5, 0.0, 1.0));
        float lum = mix(wallLit, stairs, flight);
        lum = mix(lum, 1.05, landing);
        // The level's inner edge: a dark line where it drops to the next.
        lum *= mix(1.0, 0.55, smoothstep(0.93 - aa, 0.97, b));
        col = stone * (0.88 + 0.12 * noise2(p * 60.0 / max(pow(RK, lev), 0.2))) * lum * sunC;
        // Deeper levels are cooler and darker.
        col *= mix(1.0, 0.7, lev / nLev);
    }

    // The rim's hard shadow cast into the well: a point is in shadow when
    // the line toward the sun leaves the well below the rim.
    if (m <= S0) {
        vec2 dir = ld;
        float tx = (sign(dir.x) * S0 - p.x) / (dir.x + 1e-5 * sign(dir.x) + 1e-6);
        float ty = (sign(dir.y) * S0 - p.y) / (dir.y + 1e-5 * sign(dir.y) + 1e-6);
        float tExit = min(abs(tx), abs(ty));
        float reach = depth * 0.05;                          // shadow length per level of depth
        float sh = smoothstep(reach - 0.004, reach + 0.004, tExit);
        col = mix(col / max(sunC, 0.3) * shadeC * 0.8, col, sh);
    }

    col *= 0.9 + 0.2 * audioLevel;
    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
