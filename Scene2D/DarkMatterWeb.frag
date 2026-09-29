#version 330 core
out vec4 fragColor;
/**
 * @file DarkMatterWeb.frag
 * @brief DARK MATTER WEB: the cosmic web as the big simulations draw it --
 * filaments of dark matter strung between bright halos where they cross,
 * voids of near-black between them, galaxies strung along the threads
 * like dew.  Three depths of the web lie behind one another and drift at
 * their own slow speeds (parallax), the nearest brightest: gold-white
 * cores, a violet-blue dark-matter glow around them.  Knots of light
 * travel along the filaments toward the halos, the way matter flows.
 *
 *   sceneTime/sceneAdvance -> drift of the layers, flow along the threads
 *   audioSwell    -> halo brightness (slow)
 *   audioKick     -> the halos flare (light only)
 *   audioChromaHue-> photo tint of the glow
 *
 * Per-activation variety:
 *   webP float density of the web (0.85..1.5)
 *   glowP float brightness of the flow (0.5..2.0)
 *   hueP float palette offset (0..6.28)
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
uniform float audioLevel;
uniform float audioKick;
uniform float audioValence;
uniform float audioChromaHue;

uniform float webP;
uniform float glowP;
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
vec2 hash22(vec2 p)
{
    vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.xx + p3.yz) * p3.zy);
}
float noise2(vec2 p)
{
    vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x),
               mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), f.x), f.y);
}

// Voronoi on a jittered lattice: distance to the nearest edge (the
// filament), distance to the nearest vertex region (the halo) and the
// position along the edge for the flow.
vec4 web(vec2 p, float seed)
{
    vec2 gi = floor(p), gf = fract(p);
    float d1 = 1e9, d2 = 1e9, d3 = 1e9;
    vec2 c1 = vec2(0.0), c2 = vec2(0.0);
    for (int j = -2; j <= 2; ++j)
    for (int i = -2; i <= 2; ++i) {
        vec2 o = vec2(i, j);
        vec2 c = o + 0.15 + 0.7 * hash22(gi + o + seed);
        float d = length(gf - c);
        if (d < d1) { d3 = d2; d2 = d1; c2 = c1; d1 = d; c1 = c; }
        else if (d < d2) { d3 = d2; d2 = d; c2 = c; }
        else if (d < d3) { d3 = d; }
    }
    float edge = d2 - d1;                 // 0 on the filament
    float node = d3 - d1;                 // small where three cells meet
    // Position along the filament: projection onto the edge direction.
    vec2 e = normalize(c2 - c1);
    float along = dot(gf - 0.5 * (c1 + c2), vec2(-e.y, e.x));
    return vec4(edge, node, along, hash21(floor(c1 + gi) + floor(c2 + gi) * 7.0 + seed));
}

void main()
{
    float aspect = resolution.x / resolution.y;
    vec2 uv = gl_FragCoord.xy / resolution;
    vec2 p = (uv - 0.5) * vec2(aspect, 1.0);
    float wp = (webP > 0.01) ? webP : 1.0;
    float gp = (glowP > 0.01) ? glowP : 1.0;
    float hue = (hueP > 0.001) ? hueP : 0.0;
    float swell = clamp(audioSwell, 0.0, 1.0);
    float kick = clamp(audioKick, 0.0, 1.0);
    float T = sceneTime + sceneAdvance * 0.5;

    vec3 coreC = mix(vec3(1.0, 0.82, 0.5), imgPalette(0.1 + hue * 0.159), 0.2);
    vec3 glowC = mix(vec3(0.35, 0.3, 0.9), imgPalette(0.65 + hue * 0.159), 0.25);
    vec3 col = vec3(0.004, 0.004, 0.012);

    // Far to near.
    for (int L = 0; L < 3; ++L) {
        float fl = float(L);
        float scale = (7.0 - 2.2 * fl) * wp;
        vec2 drift = vec2(T * (0.004 + 0.005 * fl), T * 0.0015 * (1.0 - fl));
        vec2 q = (p + drift) * scale + fl * 13.7;
        // Filaments bend: warp the lattice with smooth noise.
        q += 0.35 * (vec2(noise2(q * 0.5 + 3.0), noise2(q * 0.5 + 9.0)) - 0.5);
        vec4 w = web(q, fl * 31.0);
        float bright = 0.35 + 0.35 * fl;
        // Filament core and its dark-matter sheath.
        float thin = 0.035 + 0.02 * w.w;
        // Most threads are faint, a few carry the mass; all are clumpy.
        // Smooth in space: a per-edge hash jumps at the Voronoi vertices and
        // drew faceted wedges of light.
        float sn = noise2(q * 0.45 + fl * 7.0);
        float strength = 0.12 + 2.2 * sn * sn * sn;
        float clump = 0.35 + 0.9 * noise2(q * 6.0 + fl * 5.0);
        float core = exp(-w.x / thin) * strength * clump;
        // (strength jumps between cell pairs, so only the thin core may use it)
        float sheath = exp(-w.x * 6.0) * 0.14;
        // Density grows toward the halos along each filament.
        float halo = exp(-w.y * 6.0) * 0.6;
        float haloCore = exp(-w.y * 20.0) * exp(-w.x * 10.0);
        // Flow: knots of matter travelling along the thread.
        float flow = pow(0.5 + 0.5 * sin(w.z * 18.0 - T * 0.8 * (w.w > 0.5 ? 1.0 : -1.0) + w.w * 6.28), 8.0) * exp(-w.x * 30.0);
        // Galaxies strung along the threads: round points.
        vec2 gq = q * 7.0;
        vec2 gi = floor(gq), gf = fract(gq);
        vec2 gc = 0.25 + 0.5 * hash22(gi + 5.0);
        float gal = smoothstep(0.12, 0.02, length(gf - gc)) * step(0.5, hash21(gi + fl)) * exp(-w.x * 28.0) * strength;

        vec3 c = glowC * (sheath + halo * 0.4) + coreC * (core * 0.8 + haloCore * (1.4 + 1.2 * kick) * (0.8 + 0.5 * swell));
        c += coreC * flow * 0.6 * gp + vec3(1.0, 0.95, 0.9) * gal * 0.8;
        col += c * bright * (0.7 + 0.35 * swell);
    }

    col *= 0.9 + 0.2 * audioLevel;
    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
