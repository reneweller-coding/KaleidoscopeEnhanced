#version 330 core
out vec4 fragColor;
// ShadowForest.frag — the ground is the canvas and the trunks are the brush.
// The ground gets a bright, warm direct term so every shadow crossing it reads
// hard; the trunks get almost none, so they stay as silhouettes and do not
// compete with the pattern they are casting.

in vec3  vObj;
in vec3  vNormal;
in vec3  vView;
in vec3  vWorld;
in float vKind;
in float vVar;

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
uniform float audioSubBass;
uniform float audioChromaHue;
uniform float audioAmbient;

uniform float glowP;
uniform float hueP;
uniform float mistP;

vec3 hue2rgb(float h)
{
    return clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
}

float shadowAt(vec3 world, vec3 n, float ndl)
{
    float lift = (2.0 * shadowExtent * shadowTexel) * 2.2 / max(ndl, 0.15);
    vec4 lp = lightM * vec4(world + n * lift, 1.0);
    vec3 proj = lp.xyz / lp.w * 0.5 + 0.5;
    if (proj.z > 1.0 || any(lessThan(proj.xy, vec2(0.0))) ||
        any(greaterThan(proj.xy, vec2(1.0))))
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
    if (dot(n, V) < 0.0) n = -n;

    vec3 L = normalize(lightDir);
    float ndl = max(dot(n, L), 0.0);
    float sh = shadowAt(vWorld, n, ndl);

    float hue = fract(0.09 + 0.16 * hueP + 0.04 * sin(audioChromaHue));
    vec3 sun = mix(vec3(1.0, 0.86, 0.62), hue2rgb(hue), 0.28);
    vec3 sky = vec3(0.26, 0.36, 0.52);

    vec3 col;
    if (vKind < 0.5)
    {
        // ---- forest floor ----
        vec3 ground = vec3(0.30, 0.27, 0.22);
        // Shadowed ground keeps a real sky term rather than going to black:
        // a shadow on a sunlit floor is blue, not absent.
        col = ground * sky * (0.55 + 0.5 * audioAmbient);
        col += ground * sun * ndl * sh * (1.7 + 0.5 * audioLevel);
        // The litter breaks the plane up so the shadows have something to lie on.
        float grain = fract(sin(dot(floor(vWorld.xz * 6.0), vec2(12.99, 78.23)))
                            * 43758.5453);
        col *= 0.93 + 0.14 * grain;
    }
    else
    {
        // ---- trunks ----
        vec3 bark = mix(vec3(0.13, 0.11, 0.10), vec3(0.22, 0.18, 0.15), vVar);
        col = bark * sky * 0.55;
        col += bark * sun * ndl * sh * 0.85;
        // A rim off the sun side so the silhouettes separate from each other.
        float rim = pow(1.0 - clamp(dot(n, V), 0.0, 1.0), 2.6);
        col += sun * rim * max(dot(n, L) * 0.5 + 0.5, 0.0)
             * (0.30 + 0.7 * glowP) * (0.5 + 1.0 * audioKick);
    }

    // Depth haze: the stand has to fade or the far trunks pile into a black wall.
    float dist = length(vec3(vWorld.x, vWorld.y - 1.0, vWorld.z + 7.0));
    float haze = 1.0 - exp(-dist * 0.035 * clamp(mistP, 0.2, 2.0));
    vec3 air = mix(sky * 0.55, sun * 0.5, 0.35) * (0.6 + 0.6 * audioAmbient);
    col = mix(col, air, clamp(haze, 0.0, 0.92));

    col *= 1.0 + 0.16 * audioBeat + 0.12 * audioSubBass;
    col += sun * 0.05 * audioHigh;
    col = col / (1.0 + col * 0.30);
    fragColor = vec4(col, interpolation);
}
