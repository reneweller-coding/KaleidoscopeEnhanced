#version 330 core
out vec4 fragColor;
// ClothDrape.frag — a curtain of light.  Blend/CfxCloth.comp solves a Verlet
// mass-spring sheet on a grid, one particle per texel, so the displacement
// field can be sampled directly here: the surface normal comes from the
// simulated shape, and the photo is the fabric's print.

uniform sampler2D tex0;
uniform sampler2D texCloth;      // <- requests the cloth sim (RGB = displacement)
uniform vec2  resolution;
uniform float time;
uniform float interpolation;

uniform float audioLevel;
uniform float audioBeat;
uniform float audioKick;
uniform float audioHigh;
uniform float audioChromaHue;
uniform float audioAmbient;

uniform float shineP;
uniform float printP;            // how much of the photo shows in the fabric

void main()
{
    vec2 uv = gl_FragCoord.xy / resolution;
    vec2 px = 1.0 / resolution;

    vec3 d = texture(texCloth, uv).rgb;

    // The sheet's own displacement warps the UV lookup: the print rides WITH
    // the fabric, which is what makes it read as cloth and not a flat image
    // with a lighting overlay.
    vec2 warp = uv + d.xy * 0.35;

    // Normal from the displacement field.
    vec3 dxv = texture(texCloth, uv + vec2(px.x * 2.0, 0.0)).rgb
             - texture(texCloth, uv - vec2(px.x * 2.0, 0.0)).rgb;
    vec3 dyv = texture(texCloth, uv + vec2(0.0, px.y * 2.0)).rgb
             - texture(texCloth, uv - vec2(0.0, px.y * 2.0)).rgb;
    vec3 T = normalize(vec3(2.0 * px.x + dxv.x, dxv.y, dxv.z * 18.0));
    vec3 B = normalize(vec3(dyv.x, 2.0 * px.y + dyv.y, dyv.z * 18.0));
    vec3 n = normalize(cross(T, B));
    if (n.z < 0.0) n = -n;

    vec3 V = vec3(0.0, 0.0, 1.0);
    vec3 L = normalize(vec3(0.45 * sin(time * 0.11), 0.55, 0.75));
    vec3 Hv = normalize(L + V);

    float diff = max(dot(n, L), 0.0);
    float spec = pow(max(dot(n, Hv), 0.0), 18.0 + 45.0 * shineP);
    // Silk sheen: a broad anisotropic-ish rim rather than a point highlight.
    float sheen = pow(1.0 - max(dot(n, V), 0.0), 2.0);

    vec3 fabric = texture(tex0, clamp(warp, 0.0, 1.0)).rgb;
    fabric = mix(vec3(dot(fabric, vec3(0.33))), fabric, 0.4 + 0.6 * printP);

    vec3 tint = 0.5 + 0.5 * cos(6.2831853 * (vec3(0.0, 0.33, 0.67))
                                + 0.6 * sin(audioChromaHue));

    vec3 col = fabric * (0.20 + 1.25 * diff)
             + tint * spec * (0.9 + 2.2 * audioKick)
             + tint * sheen * (0.18 + 0.35 * audioBeat);

    col += vec3(0.9, 0.95, 1.0) * spec * audioHigh * 0.6;
    col *= 0.85 + 0.35 * audioAmbient;

    col = col / (1.0 + col * 0.30);
    fragColor = vec4(col, interpolation);
}
