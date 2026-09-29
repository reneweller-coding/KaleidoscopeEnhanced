#version 330 core
out vec4 fragColor;
/**
 * @file SeaStacksFlight.frag
 * @brief SEA STACKS FLIGHT: a low glide over the sea at sunset between
 * towering sea stacks -- sheer rock pillars rising out of the swell, their
 * sunward faces glowing orange, their shadow sides deep violet, surf
 * foaming at their feet.  The sun hangs low ahead, laying a glittering road
 * across the water; spray haze hangs between the pillars; gulls wheel as
 * round dark specks.  The glide is steady and level; the music is the
 * light: the sun's glow and the glitter on the sea.
 *
 * Audio Reactivity:
 *   audioSwell  -> the sun's glow and the haze (slow)
 *   audioHigh   -> glitter on the water (light)
 *   audioKick   -> the surf flares white at the pillars' feet (light)
 *   audioLevel  -> brightness
 *   sceneTime / sceneAdvance -> the glide, the swell (continuous)
 *
 * Per-activation variety: stacksP (density of the pillars), hazeP, hueP.
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
uniform float audioKick;
uniform float audioLevel;
uniform float audioValence;
uniform float audioChromaHue;

uniform float stacksP;
uniform float hazeP;
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
float noise3(vec3 p)
{
    vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    float n = dot(i, vec3(1.0, 57.0, 113.0));
    vec4 h = fract(sin(vec4(n, n + 1.0, n + 57.0, n + 58.0)) * 43758.5453);
    vec4 h2 = fract(sin(vec4(n + 113.0, n + 114.0, n + 170.0, n + 171.0)) * 43758.5453);
    return mix(mix(mix(h.x, h.y, f.x), mix(h.z, h.w, f.x), f.y), mix(mix(h2.x, h2.y, f.x), mix(h2.z, h2.w, f.x), f.y), f.z);
}

float g_dens = 1.0;

// The stacks: one per cell on a jittered grid in the sea plane, avoiding a
// clear lane down the flight path.  Tapered, rough, flat-topped pillars.
float map(vec3 p)
{
    vec2 cell = floor(p.xz / 22.0);
    float d = 1e9;
    for (int j = 0; j <= 1; ++j)
    for (int i = -1; i <= 1; ++i) {
        vec2 c = cell + vec2(i, j);
        float h = hash21(c);
        if (h > 0.25 + 0.35 * g_dens) continue;
        vec2 ctr = (c + 0.25 + 0.5 * vec2(hash21(c + 3.1), hash21(c + 7.3))) * 22.0;
        if (abs(ctr.x) < 12.0) ctr.x += sign(ctr.x + 0.01) * 12.0;          // keep the lane open
        float ht = 12.0 + 34.0 * hash21(c + 1.7);
        float r0 = 2.0 + 3.5 * hash21(c + 5.5);
        vec3 q = p - vec3(ctr.x, 0.0, ctr.y);
        float taper = r0 * (1.0 - 0.25 * clamp(q.y / ht, 0.0, 1.0));
        // Blocky, fractured rock: stepped ledges plus fracture noise.
        float ledge = 0.6 * pow(max(sin(q.y * 0.9 + 2.0 * noise3(q * 0.15)), 0.0), 4.0);   // smooth ledges (a stepped one broke the distance field)
        float rough = 1.2 * noise3(q * 0.25) + 0.35 * noise3(q * 1.1) + ledge;
        float cyl = length(q.xz) - taper - rough;
        float body = max(cyl, max(q.y - ht - 1.5 * noise3(q * 0.3), -q.y - 5.0));
        d = min(d, body);
    }
    return d;
}

vec3 calcNormal(vec3 p)
{
    vec2 e = vec2(0.05, 0.0);
    return normalize(vec3(map(p + e.xyy) - map(p - e.xyy), map(p + e.yxy) - map(p - e.yxy), map(p + e.yyx) - map(p - e.yyx)));
}

void main()
{
    vec2 uv = (gl_FragCoord.xy - 0.5 * resolution) / resolution.y;
    float hue = (hueP > 0.001) ? hueP : 0.0;
    float swell = clamp(audioSwell, 0.0, 1.0);
    float T = sceneTime + sceneAdvance * 0.5;
    g_dens = clamp(stacksP, 0.0, 1.0);
    float haze = 0.6 + 0.8 * clamp(hazeP, 0.0, 1.0);

    vec3 ro = vec3(2.0 * sin(T * 0.02), 7.0 + 0.8 * sin(T * 0.03), T * 3.0);
    vec3 rd = normalize(vec3(uv.x, uv.y + 0.06, 1.6));
    vec3 sunDir = normalize(vec3(0.15, 0.08, 1.0));
    vec3 sunC = mix(vec3(1.0, 0.6, 0.3), imgPalette(0.07 + hue * 0.159), 0.12) * (1.0 + 0.4 * swell);

    // Sky: gold near the sun, rose, then violet-blue above.
    float sa = max(dot(rd, sunDir), 0.0);
    vec3 sky = mix(vec3(1.0, 0.62, 0.38), vec3(0.3, 0.3, 0.55), smoothstep(0.0, 0.35, rd.y));
    sky = mix(sky, vec3(0.9, 0.45, 0.45), exp(-abs(rd.y - 0.06) * 12.0) * 0.3);
    sky += sunC * (pow(sa, 600.0) * 3.0 + pow(sa, 24.0) * 0.5 + pow(sa, 4.0) * 0.15);
    vec3 col = sky;
    vec3 fogC = mix(vec3(1.0, 0.62, 0.38), vec3(0.6, 0.45, 0.55), smoothstep(0.0, 0.3, rd.y)) * 0.9;

    // March the stacks.
    float t = 0.5, hit = 0.0;
    for (int i = 0; i < 120; ++i) {
        float d = map(ro + rd * t);
        if (d < 0.02) { hit = 1.0; break; }
        t += d * 0.6;
        if (t > 260.0) break;
    }
    float tSea = (rd.y < 0.0) ? -ro.y / rd.y : 1e9;

    if (hit > 0.5 && t < tSea) {
        vec3 p = ro + rd * t;
        vec3 n = calcNormal(p);
        float dif = max(dot(n, sunDir), 0.0);
        float strata = 0.8 + 0.2 * sin(p.y * 2.5 + noise3(p * 0.4) * 3.0);
        vec3 rock = vec3(0.45, 0.33, 0.26) * strata;
        vec3 c = rock * (sunC * dif * 1.5 + vec3(0.25, 0.2, 0.4) * (0.35 + 0.25 * n.y));
        // Rim light where the sun grazes the edge.
        c += sunC * pow(1.0 - max(dot(n, -rd), 0.0), 3.0) * dif * 0.6;
        // Seabirds' white streaks and green tops.
        c = mix(c, vec3(0.25, 0.35, 0.15) * (0.4 + dif), smoothstep(0.6, 0.9, n.y) * 0.8);
        // Surf at the foot.
        float foot = exp(-max(p.y, 0.0) * 3.0);
        c = mix(c, vec3(0.95, 0.93, 0.9) * (0.7 + 0.5 * dif + 0.6 * clamp(audioKick, 0.0, 1.0)), foot * smoothstep(0.4, 0.7, noise3(p * 1.5 + vec3(0.0, T, 0.0))));
        float fog = 1.0 - exp(-t * 0.006 * haze);
        col = mix(c, fogC, fog);
    } else if (tSea < 1e8) {
        // The sea: swell normals, sky reflection, the sun's glitter road.
        vec3 p = ro + rd * tSea;
        vec2 w = p.xz;
        float h1 = noise2(w * 0.15 + vec2(0.0, T * 0.15)), h2 = noise2(w * 0.6 - vec2(T * 0.3, 0.0));
        vec3 n = normalize(vec3((h1 - 0.5) * 0.25 + (h2 - 0.5) * 0.15, 1.0, (noise2(w * 0.15 + 9.0) - 0.5) * 0.25 + (noise2(w * 0.6 + 4.0) - 0.5) * 0.15));
        vec3 R = reflect(rd, n);
        float ra = max(dot(R, sunDir), 0.0);
        vec3 rsky = mix(vec3(1.0, 0.62, 0.38), vec3(0.3, 0.3, 0.55), smoothstep(0.0, 0.35, R.y));
        float fres = 0.02 + 0.98 * pow(1.0 - max(dot(n, -rd), 0.0), 5.0);
        vec3 c = mix(vec3(0.03, 0.06, 0.1), rsky, fres);
        float glit = pow(ra, 300.0) * (1.5 + 3.0 * clamp(audioHigh * 2.0, 0.0, 1.0));
        c += sunC * (glit + pow(ra, 30.0) * 0.25);
        // Reflections of the stacks: darken where a stack stands between
        // the water and the sun-lit sky (cheap: march the reflected ray a bit).
        float tr = 0.3, occ = 0.0;
        for (int k = 0; k < 24; ++k) {
            float d = map(p + R * tr);
            if (d < 0.05) { occ = 1.0; break; }
            tr += d;
            if (tr > 80.0) break;
        }
        c = mix(c, vec3(0.08, 0.05, 0.08) + sunC * 0.05, occ * 0.8);
        float fog = 1.0 - exp(-tSea * 0.006 * haze);
        col = mix(c, fogC, fog);
    }

    // Spray haze drifting low over the water.
    float sp = smoothstep(0.1, -0.1, rd.y) * smoothstep(0.35, 0.8, noise2(uv * vec2(3.0, 10.0) + vec2(T * 0.05, 0.0)));
    col = mix(col, sunC * 0.7, sp * 0.15 * haze);
    // Gulls: round specks wheeling slowly.
    for (int k = 0; k < 6; ++k) {
        float fk = float(k);
        vec2 gc = vec2(0.5 * sin(T * 0.07 + fk * 1.7), 0.18 + 0.12 * sin(T * 0.05 + fk * 2.3));
        float wing = 0.004 + 0.003 * sin(T * 4.0 + fk);
        vec2 d = uv - gc;
        float bird = smoothstep(0.004, 0.001, abs(d.y - abs(d.x) * 0.5 + wing) ) * step(abs(d.x), 0.012);
        col = mix(col, vec3(0.1, 0.07, 0.1), bird * 0.8);
    }

    col *= 0.9 + 0.2 * audioLevel;
    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
