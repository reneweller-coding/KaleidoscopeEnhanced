#version 330 core
out vec4 fragColor;
/**
 * @file BrutalistAtriumWaterfall.frag
 * @brief BRUTALIST ATRIUM WATERFALL: a tall concrete atrium, galleries on both
 * sides stacked floor over floor, their board-marked slabs carrying
 * planters from which green vines hang down, and at the far end a
 * waterfall pouring over the whole height of the end wall into a pool.
 * Daylight falls from a skylight high above, straight into the spray, so
 * the mist glows and shafts of light stand in it; droplets glitter.  The
 * camera is still; the water falls and the mist drifts.
 *
 * The galleries are traced analytically (slabs as boxes, the vines as a
 * hanging curtain plane in front of each).
 *
 * Audio Reactivity:
 *   audioSwell  -> the mist and its glow (slow)
 *   audioBass   -> the brightness of the falling water (light)
 *   audioHigh   -> glittering droplets in the spray (light)
 *   audioLevel  -> brightness
 *   sceneTime / sceneAdvance -> the falling water, the drifting mist
 *
 * Per-activation variety: plantsP (how green the galleries are), hueP.
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
uniform float audioBass;
uniform float audioHigh;
uniform float audioLevel;
uniform float audioValence;
uniform float audioChromaHue;

uniform float plantsP;
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
float fbm(vec2 p)
{
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 4; ++i) { v += a * noise2(p); p = mat2(1.6, 1.2, -1.2, 1.6) * p + 2.3; a *= 0.5; }
    return v;
}

const float AW = 6.0;      // half width of the atrium (the gallery walls)
const float SE = 4.4;      // slab edge
const float FH = 3.6;      // floor height
const float ZF = 26.0;     // the end wall
const int   NF = 10;       // floors

void main()
{
    float aspect = resolution.x / resolution.y;
    vec2 uv = gl_FragCoord.xy / resolution;
    vec2 p = (uv - 0.5) * vec2(aspect, 1.0);
    float swell = clamp(audioSwell, 0.0, 1.0);
    float bass = clamp(audioBass, 0.0, 1.0);
    float hi = clamp(audioHigh * 2.0, 0.0, 1.0);
    float T = sceneTime + sceneAdvance * 0.4;
    float plants = 0.4 + 0.6 * clamp(plantsP, 0.0, 1.0);

    // Standing on the ground floor, looking down the atrium and up.
    vec3 ro = vec3(0.3, 1.6, 0.0);
    vec3 rd = normalize(vec3(p.x, p.y + 0.28, 0.95));

    vec3 concrete = vec3(0.56, 0.54, 0.5);
    float tHit = (ZF - ro.z) / rd.z;
    int mat = 0;                           // 0 end wall, 1 slab edge, 2 slab under, 3 slab top, 4 gallery wall, 5 vines, 6 floor, 7 sky
    float vineShade = 0.0;
    // The ground and the skylight.
    if (rd.y < 0.0) { float t = -ro.y / rd.y; if (t < tHit) { tHit = t; mat = 6; } }
    float yTop = float(NF) * FH;
    if (rd.y > 0.0) { float t = (yTop - ro.y) / rd.y; if (t < tHit) { tHit = t; mat = 7; } }
    // The side the ray heads to: gallery wall and slabs.
    float sx = sign(rd.x);
    {
        float t = (sx * AW - ro.x) / rd.x;
        if (t > 0.0 && t < tHit) { tHit = t; mat = 4; }
    }
    float tEdge = (sx * SE - ro.x) / rd.x;
    if (tEdge > 0.0 && tEdge < tHit) {
        // At the slab edge plane: which floor, and is the ray inside a slab?
        vec3 E = ro + rd * tEdge;
        float fl = floor(E.y / FH + 0.5);
        float dy = E.y - fl * FH;
        if (fl >= 1.0 && fl < float(NF) && dy < 0.05 && dy > -0.45) { tHit = tEdge; mat = 1; }
        else if (fl >= 1.0 && fl < float(NF)) {
            // Between the edge and the wall the ray may hit a slab's top or underside.
            float yS = (dy > 0.0) ? fl * FH + 0.05 : fl * FH - 0.45;
            float t = (yS - ro.y) / rd.y;
            float tw = (sx * AW - ro.x) / rd.x;
            if (t > tEdge && t < tw && t < tHit) { tHit = t; mat = dy > 0.0 ? 3 : 2; }
            // Vines hanging from the planter on the slab above, just in front of the edge.
            float tv = (sx * (SE - 0.1) - ro.x) / rd.x;
            vec3 V = ro + rd * tv;
            float flA = floor(V.y / FH) + 1.0;
            float hang = flA * FH - 0.45 - V.y;                       // how far below the slab
            // Individual strands, each with its own length, leaves clumped on it.
            float sz = V.z * 6.0;
            float si = floor(sz);
            float sh = hash21(vec2(si, flA * 7.0));
            float sw = abs(fract(sz) - 0.5 - 0.2 * (sh - 0.5));
            float fwz = fwidth(sz) + 1e-3;
            float strand = smoothstep(0.22 + fwz, 0.22 - fwz, sw + 0.06 * sin(hang * 9.0 + sh * 20.0));
            float len = (0.3 + 2.6 * plants * sh * sh) * step(0.45 - 0.35 * plants, hash21(vec2(si, flA * 7.0 + 3.0)));
            float clump = 0.6 + 0.4 * noise2(vec2(sz * 2.0, hang * 6.0));
            float cov = strand * smoothstep(len, len - 0.25, hang) * step(0.0, hang) * clump;
            if (cov > 0.3 && tv < tHit && flA < float(NF) + 0.5 && flA >= 1.0) { tHit = tv; mat = 5; vineShade = cov * (0.6 + 0.4 * noise2(V.zy * 6.0)); }
        }
    }
    vec3 P = ro + rd * tHit;

    // Light: the skylight above; up-facing surfaces bright, undersides dim.
    float hLight = 0.35 + 0.65 * smoothstep(0.0, yTop, P.y);
    vec3 col;
    float board = 0.9 + 0.1 * sin(P.y * 18.0 + noise2(P.xz * 2.0) * 2.0) * 0.5 + 0.1 * noise2(P.zy * vec2(3.0, 0.5));
    if (mat == 1)      col = concrete * board * 0.55 * hLight;
    else if (mat == 2) col = concrete * 0.18 * hLight;
    else if (mat == 3) col = concrete * 0.8 * hLight;
    else if (mat == 4) {
        // Deep inside the galleries: dark, with lit windows of the offices.
        float fl = floor(P.y / FH);
        float wz = fract(P.z / 2.5);
        float win = step(abs(wz - 0.5), 0.3) * step(0.9, P.y - fl * FH) * step(P.y - fl * FH, 2.6);
        float wlit = step(0.55, hash21(vec2(floor(P.z / 2.5), fl)));
        col = concrete * 0.07 * (1.0 - 0.5 * win) + vec3(1.0, 0.82, 0.55) * win * 0.1 * wlit;
    } else if (mat == 5) {
        vec3 leaf = mix(vec3(0.12, 0.3, 0.08), vec3(0.3, 0.5, 0.15), vineShade);
        leaf = mix(leaf, imgPalette(0.3 + hueP * 0.159) * vec3(0.4, 0.7, 0.3), 0.15);
        col = leaf * (0.4 + 0.7 * hLight);
    } else if (mat == 6) {
        // The pool in front of the waterfall and the stone floor.
        float pool = step(ZF - 5.0, P.z) * step(abs(P.x), 3.2);
        col = concrete * 0.3;
        if (pool > 0.5) {
            float rip = noise2(P.xz * vec2(4.0, 2.0) + vec2(0.0, -T * 0.6));
            col = mix(vec3(0.1, 0.14, 0.15), vec3(0.8, 0.9, 1.0) * 0.7, 0.3 + 0.3 * rip);
        }
    } else if (mat == 7) {
        col = vec3(1.0, 1.0, 0.97) * 2.2;
    } else {
        // The end wall and the waterfall pouring down its middle.
        float wf = smoothstep(3.0, 2.6, abs(P.x)) * step(P.y, yTop);
        col = concrete * 0.5 * hLight * board;
        if (wf > 0.0) {
            // Streaks of water falling, the sheet torn into ropes and veils.
            float fall = P.y + T * 3.0;
            float ropes = noise2(vec2(P.x * 14.0, fall * 0.4)) * 0.6 + noise2(vec2(P.x * 40.0, fall * 1.2)) * 0.4;
            vec3 water = mix(vec3(0.5, 0.62, 0.7), vec3(1.0), smoothstep(0.35, 0.85, ropes));
            water *= (0.8 + 0.5 * hLight) * (0.9 + 0.5 * bass);
            col = mix(col, water, wf * (0.6 + 0.4 * ropes));
        }
    }

    // Distance haze toward the bright end of the atrium.
    col = mix(col, vec3(0.75, 0.78, 0.8) * (0.6 + 0.6 * hLight), 1.0 - exp(-tHit * 0.02));

    // The spray: glowing mist in front of the waterfall, rising and drifting,
    // lit from above; shafts of light standing in it.
    {
        vec2 sp = p - vec2(0.0, -0.05);
        float mistZone = exp(-pow(sp.x / 0.28, 2.0)) * smoothstep(0.35, -0.3, sp.y);
        float mist = fbm(vec2(p.x * 4.0, p.y * 3.0 - T * 0.08)) * mistZone;
        col += vec3(0.95, 0.97, 1.0) * mist * (0.25 + 0.4 * swell);
        float shafts = pow(0.5 + 0.5 * sin(p.x * 30.0 + 2.0 * fbm(vec2(p.x * 3.0, 0.0))), 6.0);
        col += vec3(1.0, 0.98, 0.9) * shafts * mistZone * smoothstep(-0.4, 0.4, p.y) * 0.12 * (0.5 + 0.8 * swell);
        // Droplets glittering in the spray: round, winking.
        vec2 g = p * 90.0 + vec2(0.0, T * 3.0), gi = floor(g), gf = fract(g);
        vec2 gc = 0.25 + 0.5 * vec2(hash21(gi), hash21(gi + 3.0));
        float tw = 0.5 + 0.5 * sin(T * 3.0 + hash21(gi + 7.0) * 40.0);
        col += vec3(1.0) * smoothstep(0.13, 0.0, length(gf - gc)) * step(0.85, hash21(gi + 5.0)) * tw * mistZone * (0.2 + 1.0 * hi);
    }

    col *= 0.9 + 0.2 * audioLevel;
    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
