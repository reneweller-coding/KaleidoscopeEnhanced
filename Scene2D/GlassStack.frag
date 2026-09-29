#version 330 core
out vec4 fragColor;
/**
 * @file GlassStack.frag
 * @brief GLASS STACK: a sculpture of coloured glass slabs on a white light
 * table -- thick panes of cobalt, amber, ruby, emerald and violet glass
 * stacked and leaning at angles, turning very slowly on a turntable.  Where
 * the panes overlap their colours multiply into deeper ones; their edges
 * glow bright where light travels inside them; and the light from a lamp
 * above passes through them and throws coloured shadows across the white
 * table.  The turntable is steady; the music is the light.
 *
 * Each pane is intersected analytically (ray-box in its own frame), so the
 * absorption through every slab along a ray -- and along the shadow ray to
 * the lamp -- is exact and cheap.
 *
 * Replaces a Scene3D order-independent-transparency version (a dark block
 * in the catalogue).
 *
 * Audio Reactivity:
 *   audioSwell -> the lamp (slow)
 *   audioKick  -> the glowing edges flare (light only)
 *   audioHigh  -> the highlights sparkle (light)
 *   audioChromaHue -> photo tint of the glass
 *   sceneTime / sceneAdvance -> the turntable (continuous)
 *
 * Per-activation variety: camDistP, spreadP (how the panes lean),
 * shellsP (how many panes), glassP (glass density), glowP (edge glow).
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
uniform float audioHigh;
uniform float audioLevel;
uniform float audioValence;
uniform float audioChromaHue;

uniform float camDistP;
uniform float spreadP;
uniform float shellsP;
uniform float glassP;
uniform float glowP;

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

float hash11(float n) { return fract(sin(n * 127.1) * 43758.5453); }

const int NP = 7;
mat3  g_R[NP];
vec3  g_C[NP];
vec3  g_H[NP];
vec3  g_col[NP];
int   g_n = 7;

mat3 rotY(float a) { float c = cos(a), s = sin(a); return mat3(c, 0.0, -s, 0.0, 1.0, 0.0, s, 0.0, c); }
mat3 rotX(float a) { float c = cos(a), s = sin(a); return mat3(1.0, 0.0, 0.0, 0.0, c, s, 0.0, -s, c); }
mat3 rotZ(float a) { float c = cos(a), s = sin(a); return mat3(c, s, 0.0, -s, c, 0.0, 0.0, 0.0, 1.0); }

// Ray-box in the pane's frame: entry/exit distances and the entry normal.
vec2 boxHit(vec3 ro, vec3 rd, int i, out vec3 nEnt)
{
    vec3 o = transpose(g_R[i]) * (ro - g_C[i]);
    vec3 d = transpose(g_R[i]) * rd;
    vec3 inv = 1.0 / d;
    vec3 t1 = (-g_H[i] - o) * inv, t2 = (g_H[i] - o) * inv;
    vec3 tn = min(t1, t2), tf = max(t1, t2);
    float tN = max(max(tn.x, tn.y), tn.z), tF = min(min(tf.x, tf.y), tf.z);
    vec3 nl = -sign(d) * step(tn.yzx, tn.xyz) * step(tn.zxy, tn.xyz);
    nEnt = g_R[i] * nl;
    return vec2(tN, tF);
}

// Absorption along a ray through all panes (for the shadow on the table).
vec3 transmit(vec3 ro, vec3 rd, float dens)
{
    vec3 tr = vec3(1.0);
    for (int i = 0; i < NP; ++i) {
        if (i >= g_n) break;
        vec3 n;
        vec2 t = boxHit(ro, rd, i, n);
        if (t.y > max(t.x, 0.0)) {
            float len = t.y - max(t.x, 0.0);
            tr *= exp(-(1.0 - g_col[i]) * len * dens);
        }
    }
    return tr;
}

void main()
{
    vec2 uv = (gl_FragCoord.xy - 0.5 * resolution) / resolution.y;
    float T = sceneTime + sceneAdvance * 0.4;
    float swell = clamp(audioSwell, 0.0, 1.0);
    float kick = clamp(audioKick, 0.0, 1.0);
    float hi = clamp(audioHigh * 2.0, 0.0, 1.0);
    float camD = clamp((camDistP > 0.1) ? camDistP : 6.0, 5.0, 7.5);
    float spread = clamp((spreadP > 0.1) ? spreadP : 1.0, 0.7, 1.3);
    g_n = 4 + int(clamp((shellsP > 0.01) ? shellsP : 0.7, 0.45, 1.0) * 3.0 + 0.5);
    float dens = 2.0 + 3.5 * clamp((glassP > 0.01) ? glassP : 0.7, 0.4, 1.0);
    float glow = clamp((glowP > 0.01) ? glowP : 0.6, 0.35, 1.0);

    // The panes, turning together on the turntable.
    mat3 turn = rotY(T * 0.05);
    vec3 cols[7] = vec3[7](vec3(0.15, 0.35, 0.95), vec3(1.0, 0.65, 0.12), vec3(0.95, 0.12, 0.2),
                           vec3(0.15, 0.8, 0.4), vec3(0.6, 0.25, 0.9), vec3(0.2, 0.85, 0.9), vec3(1.0, 0.9, 0.3));
    for (int i = 0; i < NP; ++i) {
        float fi = float(i);
        float h1 = hash11(fi * 3.1), h2 = hash11(fi * 7.7), h3 = hash11(fi * 11.3);
        g_H[i] = vec3(0.55 + 0.35 * h1, 0.75 + 0.45 * h2, 0.07 + 0.03 * h3);
        // A fan of standing panes round the turntable, each leaning a little.
        float a = fi / 7.0 * 6.2831853;
        float lean = (h2 - 0.5) * 0.35 * spread;
        mat3 r = rotY(a + 1.2 + 0.3 * h1) * rotZ(lean);
        g_R[i] = turn * r;
        vec3 c = vec3(cos(a), 0.0, sin(a)) * (0.35 + 0.25 * h3) * spread;
        c.y = -1.0 + g_H[i].y * cos(lean) + g_H[i].x * abs(sin(lean)) + 0.01;   // standing on the table
        g_C[i] = turn * c;
        g_col[i] = mix(cols[i], imgPalette(fi / 7.0), 0.12);
    }

    vec3 ro = vec3(0.0, 1.2, -camD);
    vec3 ww = normalize(vec3(0.0, -0.2, 0.0) - ro);
    vec3 uu = normalize(cross(ww, vec3(0.0, 1.0, 0.0)));
    vec3 vv = cross(uu, ww);
    vec3 rd = normalize(uv.x * uu + uv.y * vv + 1.9 * ww);
    vec3 lampP = vec3(-1.2, 4.5, 0.8);
    vec3 lampC = vec3(1.0, 0.97, 0.92) * (0.9 + 0.35 * swell);

    // The white light table (y = -1) fading into a soft grey studio.
    vec3 bg = mix(vec3(0.85, 0.85, 0.88), vec3(0.45, 0.46, 0.52), smoothstep(-0.3, 0.6, uv.y)) * (0.8 + 0.3 * swell);
    vec3 col = bg;
    float tFloor = (rd.y < 0.0) ? (-1.0 - ro.y) / rd.y : 1e9;
    if (tFloor < 1e8) {
        vec3 fp = ro + rd * tFloor;
        vec3 L = normalize(lampP - fp);
        vec3 fcol = vec3(0.95, 0.95, 0.97) * lampC * (0.55 + 0.45 * L.y);
        // Coloured shadows: the lamp's light through every pane.
        fcol *= transmit(fp, L, dens);
        // The table glows faintly from below, too (light table).
        fcol += vec3(0.08, 0.08, 0.09);
        float fade = smoothstep(14.0, 5.0, tFloor);
        col = mix(bg, fcol, fade);
    }

    // The glass, seen through: absorption of every pane along the view ray,
    // plus reflections and glowing edges at the panes' surfaces.
    vec3 tr = vec3(1.0);
    vec3 add = vec3(0.0);
    for (int i = 0; i < NP; ++i) {
        if (i >= g_n) break;
        vec3 n;
        vec2 t = boxHit(ro, rd, i, n);
        if (t.y > max(t.x, 0.0) && t.x < tFloor) {
            t.y = min(t.y, tFloor);
            float len = t.y - t.x;
            tr *= exp(-(1.0 - g_col[i]) * len * dens);
            // Surface: a Fresnel sheen and the lamp's highlight.
            vec3 hp = ro + rd * t.x;
            vec3 V = -rd;
            float fres = 0.04 + 0.96 * pow(1.0 - abs(dot(n, V)), 5.0);
            vec3 Lh = normalize(lampP - hp);
            float spec = pow(max(dot(reflect(-Lh, n), V), 0.0), 120.0);
            add += (vec3(0.9, 0.92, 1.0) * fres * 0.35 + lampC * spec * (1.2 + 1.5 * hi)) * 0.8;
            // Edges glow: light trapped in the slab leaks out at its rims.
            vec3 lp = transpose(g_R[i]) * (hp - g_C[i]);
            vec3 q = abs(lp) / g_H[i];
            float e1 = max(q.x, q.y);
            float edge = smoothstep(0.93, 1.0, e1) * smoothstep(0.5, 1.0, q.z);
            add += g_col[i] * edge * (0.6 + 1.2 * kick) * glow * 1.5;
        }
    }
    col = col * tr + add;

    col *= 0.9 + 0.2 * audioLevel;
    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
