#version 330 core
out vec4 fragColor;
// BloomSculpt.frag — a polished shell, lit so the silhouette reads.
// The whole point of the tessellation is the SHAPE, so the shading stays
// restrained: one key light, a broad fill, a hard rim to separate the lobes
// from the background, and the slideshow photo as the environment it mirrors.

in vec3  vObj;
in vec3  vNormal;
in vec3  vView;
in vec3  vWorld;
in float vSwell;
in vec2  vSurfUV;

uniform sampler2D tex0;
uniform sampler2DShadow texShadow;
uniform mat4  lightM;
uniform vec3  lightDir;
uniform float shadowPass;
uniform float shadowTexel;
uniform float shadowExtent;
uniform float interpolation;
uniform float time;

uniform float audioLevel;
uniform float audioBeat;
uniform float audioHigh;
uniform float audioKick;
uniform float audioChromaHue;
uniform float audioAmbient;

uniform float glossP;
uniform float bloomP;

vec3 hue2rgb(float h)
{
    return clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
}

float shadowAt(vec3 world, vec3 n, float ndl)
{
    float lift = (2.0 * shadowExtent * shadowTexel) * 2.2 / max(ndl, 0.15);
    vec4 lp = lightM * vec4(world + n * lift, 1.0);
    vec3 proj = lp.xyz / lp.w * 0.5 + 0.5;
    if (proj.z > 1.0)
        return 1.0;
    float bias = 0.0006 + 0.0030 * (1.0 - ndl);
    float s = 0.0;
    float r = shadowTexel * 1.6;
    for (int y = -1; y <= 1; ++y)
        for (int x = -1; x <= 1; ++x)
            s += texture(texShadow,
                         vec3(proj.xy + vec2(float(x), float(y)) * r, proj.z - bias));
    return s / 9.0;
}

void main()
{
    if (shadowPass > 0.5)
    {
        fragColor = vec4(0.0);
        return;
    }

    vec3 n = normalize(vNormal);
    vec3 V = normalize(vView);
    if (dot(n, V) < 0.0) n = -n;          // shade the backfaces of deep folds too

    vec3 L = normalize(lightDir);

    // Body colour follows the surface's own radius: the deep valleys between
    // lobes stay dark and saturated, the crests bleach toward the light.
    float rad = length(vObj);
    float hue = fract(0.52 + 0.30 * rad + 0.09 * sin(audioChromaHue));
    vec3 base = mix(vec3(0.10, 0.11, 0.17), hue2rgb(hue), 0.72);

    float diff = max(dot(n, L), 0.0);
    float wrap = 0.5 + 0.5 * dot(n, L);   // wrapped fill, keeps the shadow side readable

    // A convoluted body is exactly where shadowing earns its keep: the deep
    // folds between petals now go dark because a neighbouring lobe is in the
    // way, not merely because they face away from the light.
    float shadow = shadowAt(vWorld, n, diff);

    vec3 col = base * (0.20 + 0.95 * diff * shadow + 0.55 * wrap * wrap);

    // Second, cooler light from the opposite side.  One light on a shape this
    // convoluted leaves half the lobes as unreadable black.
    vec3 L2 = normalize(vec3(-0.7, -0.25, -0.6));
    col += base * vec3(0.55, 0.7, 1.0) * max(dot(n, L2), 0.0) * 0.45;

    // Environment mirror — equirect lookup along the reflected ray.
    vec3 R = reflect(-V, n);
    vec2 envUV = vec2(atan(R.x, R.z) / 6.2831853 + 0.5, clamp(R.y * 0.5 + 0.5, 0.0, 1.0));
    vec3 env = textureLod(tex0, fract(envUV), 0.0).rgb;
    env = mix(vec3(dot(env, vec3(0.333))), env, 0.7);

    float fres = pow(1.0 - clamp(dot(n, V), 0.0, 1.0), 4.0);
    col = mix(col, env * (0.6 + 0.8 * glossP), fres * (0.35 + 0.45 * glossP));

    vec3 H = normalize(L + V);
    float spec = pow(max(dot(n, H), 0.0), 40.0 + 260.0 * glossP);
    col += vec3(1.0, 0.96, 0.88) * spec * shadow * (0.9 + 2.2 * audioHigh);

    // Rim: without it the dark side of a lobe merges with the background and
    // the whole silhouette — the thing tessellation bought us — disappears.
    col += hue2rgb(fract(hue + 0.5)) * pow(fres, 1.6) * (0.35 + 0.9 * audioLevel);

    // The deepest-displaced ridges glow, so a loud chord literally lights up
    // the modes it grew.
    float seam = clamp(vSwell / max(bloomP * 1.6, 0.05) - 0.35, 0.0, 1.0);
    col += hue2rgb(fract(hue + 0.12)) * pow(seam, 2.0) * (0.5 + 1.8 * audioKick);

    col *= 1.0 + 0.20 * audioBeat + 0.25 * audioAmbient;
    col = col / (1.0 + col * 0.28);
    fragColor = vec4(col, interpolation);
}
