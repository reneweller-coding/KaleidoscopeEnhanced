#version 330 core
out vec4 fragColor;

/**
 * @file ChromeForm.frag
 * @brief The model as polished metal: it shows almost nothing of itself and
 * almost everything of the room around it. The environment it reflects is the
 * same one drawn on the sky shell, and the warm part of it is taken from the
 * CURRENT PHOTOGRAPH -- so the object mirrors the picture the rest of the show
 * is built on, and changes colour when the picture does.
 *
 * A mirror is defined by what it borrows, which makes this family unusually
 * dependent on having something worth reflecting: the sky is deliberately
 * structured (a horizon, a light source, banding) rather than a smooth
 * gradient, because a mirror pointed at a featureless room reads as flat grey
 * paint. Both the shell and the surface call the SAME environment function, so
 * the reflection is always consistent with the visible background.
 *
 *   audioAdvance -> the environment drifts past the surface
 *   audioKick    -> the light source flares
 *   audioSwell   -> reflection strength
 *   audioHigh    -> anisotropic streaking (brushed rather than mirrored)
 *
 * Per-instance: sizeP, spinP, brushP (0 = mirror, 1 = brushed), tintP.
 * Per-activation variety: hueP float palette offset (0..6.28).
 */

uniform sampler2D tex0;
uniform sampler2D tex1;

uniform float time;
uniform float interpolation;
uniform float audioAdvance;
uniform float audioKick;
uniform float audioSwell;
uniform float audioHigh;

uniform float hueP;
uniform float tintP;
uniform float brushP;

in vec2  vUV;
in vec3  vNormal;
in vec3  vPos;
in float vBg;

vec3 hueRot(vec3 c, float a)
{
    const vec3 k = vec3(0.57735);
    float ca = cos(a);
    return c * ca + cross(k, c) * sin(a) + k * dot(k, c) * (1.0 - ca);
}

float hash11(float n) { return fract(sin(n * 12.9898) * 43758.5453); }

float noise2(vec2 p)
{
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float n = i.x + i.y * 57.0;
    return mix(mix(hash11(n), hash11(n + 1.0), f.x),
               mix(hash11(n + 57.0), hash11(n + 58.0), f.x), f.y);
}

vec3 photo(vec2 uv)
{
    uv = clamp(uv, 0.0, 1.0);
    return mix(texture(tex1, uv).rgb, texture(tex0, uv).rgb, 1.0 - interpolation);
}

// THE room. Called for both the sky shell and the reflection, so what the
// object mirrors is provably the background the viewer can see -- if these
// were two different functions the metal would reflect a place that is not
// there, which is exactly what makes cheap chrome look wrong.
vec3 environment(vec3 dir, vec3 tint)
{
    float h = dir.y;

    // Ground below, sky above, a hard horizon between: the horizon line is the
    // single most useful feature a reflective surface can have, because it is
    // what lets the eye read the curvature.
    vec3 sky    = mix(vec3(0.10, 0.13, 0.20), vec3(0.02, 0.03, 0.06),
                      smoothstep(0.0, 0.9, h));
    vec3 ground = mix(vec3(0.05, 0.045, 0.05), vec3(0.010, 0.010, 0.014),
                      smoothstep(0.0, -0.7, h));
    vec3 col = (h > 0.0) ? sky : ground;
    col += tint * 0.30 * exp(-abs(h) * 26.0);          // horizon glow

    // Slow horizontal banding: gives the reflection something to slide along,
    // which is how a curved mirror shows that it is turning.
    float band = 0.5 + 0.5 * sin(h * 15.0 - time * 0.25 - audioAdvance * 0.12);
    col += tint * pow(band, 8.0) * 0.16;

    // A light source, and its flare on the beat.
    vec3 key = normalize(vec3(-0.45, 0.42, 0.79));
    float d = max(dot(dir, key), 0.0);
    col += vec3(1.0, 0.94, 0.86) * pow(d, 900.0) * (5.0 + 9.0 * audioKick);
    col += tint * pow(d, 14.0) * (0.35 + 0.5 * audioKick);

    // The current photograph, wrapped around the upper half. This is the point
    // of the family: the metal carries the colour of the picture on screen.
    vec2 pu = vec2(atan(dir.z, dir.x) / 6.2831853 + 0.5, clamp(h * 0.5 + 0.5, 0.0, 1.0));
    col = mix(col, col + photo(pu) * 0.55, smoothstep(-0.1, 0.5, h));

    return col;
}

void main()
{
    float hue = (hueP > 0.01 ? hueP : 0.0);
    vec3 tint = hueRot(vec3(0.55, 0.75, 1.0), tintP);

    if( vBg > 0.5 )
    {
        fragColor = vec4(environment(normalize(vPos), tint) * 0.85, 1.0);
        return;
    }

    vec3 n = normalize(vNormal);
    vec3 viewDir = normalize(-vPos);

    // Brushed metal: perturb the normal along one surface direction only, so
    // the reflection smears into streaks instead of blurring evenly. Anisotropy
    // is what separates "brushed" from "dirty".
    float brush = clamp(brushP, 0.0, 1.0);
    if( brush > 0.001 )
    {
        float g = noise2(vUV * vec2(220.0, 6.0)) - 0.5;
        vec3 t = normalize(cross(n, vec3(0.0, 1.0, 0.0)) + 1e-5);
        n = normalize(n + t * g * brush * (0.35 + 0.5 * audioHigh));
    }

    vec3 r = reflect(-viewDir, n);
    vec3 col = environment(r, tint) * (0.85 + 0.55 * audioSwell);

    // Fresnel: grazing angles reflect nearly everything, which is what gives
    // polished metal its bright edges. A constant reflectivity looks like
    // plastic.
    float f = pow(1.0 - max(dot(n, viewDir), 0.0), 4.0);
    col = mix(col * 0.72, col * 1.5 + tint * 0.35, f);

    // A trace of the body's own colour, so it is metal rather than a soap
    // bubble -- a perfect mirror has no identity at all.
    col *= mix(vec3(1.0), tint * 0.6 + 0.6, 0.35);

    if( hue > 0.001 ) col = hueRot(col, 0.12 * sin(hue));

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.30 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
