#version 330 core
/**
 * @file BorromeanRingsOrbit.frag
 * @brief BORROMEAN RINGS ORBIT: two-pass shader.  Opaque pass: the wall
 * behind, the photo dim.  OIT pass: three glass rings, each tinted and lit
 * by a band group (low, mid, high), the photo refracted through the glass,
 * a Fresnel rim, a highlight; a pulse of light runs around each ring on
 * the scene clock; the kick sparks the highlights.  Weighted-blended OIT
 * as in CathedralGlass (tone-map before accumulating).
 *
 * Audio Reactivity: audioBass / audioMid / audioHigh -> ring light (light);
 *                   audioKick -> highlight; audioSwell -> wall light; audioLevel.
 */
layout(location = 0) out vec4 outAccum;
layout(location = 1) out vec4 outReveal;

in vec2  vTexCoord;
in vec3  vWorld;
in vec3  vNormal;
in float vKind;
in float vAlong;
in float vId;

uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;
uniform float time;
uniform float oitPass;
uniform vec2  nearFar;
uniform float sceneAdvance;
uniform float audioBass;
uniform float audioMid;
uniform float audioHigh;
uniform float audioKick;
uniform float audioSwell;
uniform float audioLevel;
uniform float audioChromaHue;
uniform float audioAdvance;
uniform float audioValence;
uniform float hueP;

vec3 img(vec2 uv) {
    return (interpolation * texture(tex0, uv) + (1.0 - interpolation) * texture(tex1, uv)).rgb;
}

vec3 imgPalette(float t)
{
    float ang = audioChromaHue + audioAdvance * 0.04 + t * 6.2831853;
    float rad = 0.16 + 0.08 * sin(audioAdvance * 0.013);
    vec3  col = img(clamp(vec2(0.5) + rad * vec2(cos(ang), sin(ang)), 0.0, 1.0));
    float g   = dot(col, vec3(0.333));
    return mix(vec3(g), col, 0.55 + 0.45 * audioValence);
}

void main()
{
    float hue = (hueP > 0.001) ? hueP : 0.0;
    float wallLight = 0.5 + 0.6 * clamp(audioSwell, 0.0, 1.0);
    if (oitPass < 0.5)
    {
        vec2 uv = vTexCoord;
        vec3 col = img(uv) * mix(vec3(1.0), imgPalette(hue * 0.159 + 0.6) * 1.5, 0.3) * wallLight * 0.5;
        col *= 0.4 + 0.7 * exp(-length(uv - 0.5) * 1.6);
        col *= 0.75 + 0.5 * audioLevel;
        outAccum  = vec4(col, interpolation);
        outReveal = vec4(0.0);
        return;
    }
    int ring = int(clamp(vId, 0.0, 2.0));
    float e = (ring == 0) ? clamp(audioBass, 0.0, 1.0) : ((ring == 1) ? clamp(audioMid * 1.3, 0.0, 1.0) : clamp(audioHigh * 2.0, 0.0, 1.0));
    vec3 n = normalize(vNormal);
    vec3 V = normalize(-vWorld);
    float c = clamp(dot(n, V), 0.0, 1.0);
    float fres = 0.04 + 0.96 * pow(1.0 - c, 4.0);
    vec3 Rf = refract(-V, n, 1.0 / 1.4);
    vec2 wuv = clamp(vec2(0.5 + (vWorld.x + Rf.x * 20.0) * 0.012, 0.5 + (vWorld.y + Rf.y * 20.0) * 0.02), 0.0, 1.0);
    vec3 through = img(wuv) * wallLight;
    vec3 tint = imgPalette(hue * 0.159 + float(ring) * 0.33) * 1.5 + 0.1;
    vec3 glass = mix(through, through * tint * 2.0, 0.6) + tint * 0.15;
    float pulse = pow(0.5 + 0.5 * sin(vAlong * 6.2831853 * 2.0 - sceneAdvance * 2.5 + float(ring) * 2.0), 8.0);
    glass += tint * (0.4 * e + pulse * (0.15 + 0.45 * e));
    vec3 R = reflect(-V, n);
    vec3 refl = img(clamp(vec2(0.5 + R.x * 0.4, 0.5 + R.y * 0.4), 0.0, 1.0)) * wallLight;
    glass = mix(glass, refl, fres * 0.6);
    vec3 L = normalize(vec3(-0.5, 0.7, -0.5));
    vec3 H = normalize(L + V);
    glass += vec3(1.0) * pow(max(dot(n, H), 0.0), 70.0) * (0.6 + 1.4 * audioKick);
    vec3 col = glass * (0.8 + 0.4 * audioLevel);
    col = col / (1.0 + col * 0.22);
    float alpha = clamp(0.3 + 0.45 * fres + 0.25 * e, 0.0, 0.9);
    float zn = nearFar.x, zf = nearFar.y;
    float ndc = gl_FragCoord.z * 2.0 - 1.0;
    float z = (2.0 * zn * zf) / (zf + zn - ndc * (zf - zn));
    float w = alpha * max(1e-2, 2.5e2 * pow(1.0 - z / zf, 3.0));
    w = clamp(w, 1e-2, 2.5e2);
    outAccum  = vec4(col * alpha, alpha) * w;
    outReveal = vec4(alpha);
}
