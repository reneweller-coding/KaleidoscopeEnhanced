#version 330 core
out vec4 fragColor;
// PhotoSphere.frag — the image wraps the planet twice around (mirror-folded
// so the seam never shows); day-side lighting, a key-coloured rim, and an
// equator flash band on the kick.
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;
uniform float time;
uniform float audioKick;
uniform float audioDrop;
uniform float audioChromaHue;
uniform float audioCentroid;

in vec2  vUV;
in vec3  vN;
in vec3  vView;

vec3 hueRot(vec3 c, float a)
{
    vec3  k = vec3(0.57735026919);
    float cs = cos(a), sn = sin(a);
    return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
}
vec2 mfold(vec2 uv) { return abs(fract(uv * 0.5) * 2.0 - 1.0); }

void main()
{
    vec2 uv = vec2(vUV.x * 2.0, vUV.y);
    // Blend tex0/tex1 by interpolation — sampling tex0 alone showed the
    // WRONG slot for half the crossfade (user: no photo on the sphere).
    vec2 fuv = mfold(uv);
    vec3 col = mix(texture(tex1, fuv).rgb, texture(tex0, fuv).rgb, interpolation);

    // Day side toward a fixed sun; soft terminator.
    float lit = clamp(dot(vN, normalize(vec3(0.7, 0.45, -0.55))), 0.0, 1.0);
    col *= 0.18 + 1.15 * lit;

    // Atmosphere rim in the music's key colour.
    float rim = pow(1.0 - clamp(dot(vN, -vView), 0.0, 1.0), 3.0);
    col += hueRot(vec3(0.25, 0.5, 0.9), audioChromaHue) * rim
         * (0.8 + 0.5 * audioCentroid);

    // Equator flash band on the kick; a drop lights the whole globe.
    float eq = exp(-abs(vUV.y - 0.5) * 14.0);
    col *= 1.0 + 1.2 * eq * audioKick + 0.9 * audioDrop;

    fragColor = vec4(col * 1.25, 1.0);
}
