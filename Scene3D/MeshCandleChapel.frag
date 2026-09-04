#version 330 core
out vec4 fragColor;
/**
 * @file MeshCandleChapel.frag
 * @brief MESH CANDLE CHAPEL: three hundred real candles (one model,
 * instances="300") on a tiered stand in a dark chapel. Every flame
 * flickers on its own, and all of them breathe together with the swell --
 * the chapel brightens and dims as the music does; the kick makes a few
 * flames flare; high on the wall a window whose twelve panes are the
 * twelve pitch classes. The mesh counterpart of CandleForestBreath.
 *
 * Audio Reactivity:
 *   audioSwell      -> the breath of all the flames (slow)
 *   audioKick       -> a few flames flare (light)
 *   audioChroma[12] -> the window's panes (light)
 *   time            -> the flicker (continuous)
 *
 * Per-instance: sizeP. Per-activation variety: hueP.
 */

uniform sampler2DArray texMeshMaterial;
uniform int   texMeshMaterialLayers;

uniform float time;
uniform float audioSwell;
uniform float audioKick;
uniform float audioChroma[12];

uniform float hueP;

in vec2  vUV;
in vec3  vNormal;
in vec3  vPos;
in vec3  vLocal;
in float vBg;
in float vHash;

const float kGround = -13.0;

vec3 hueRot(vec3 c, float a) {
    vec3 k = vec3(0.57735026919);
    float cs = cos(a), sn = sin(a);
    return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
}
vec3 hsv2rgb(vec3 c) {
    vec3 p = abs(fract(c.xxx + vec3(0.0, 2.0 / 3.0, 1.0 / 3.0)) * 6.0 - 3.0);
    return c.z * mix(vec3(1.0), clamp(p - 1.0, 0.0, 1.0), c.y);
}
float hash21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise2(vec2 x) {
    vec2 i = floor(x), f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    float a = hash21(i), b = hash21(i + vec2(1.0, 0.0));
    float c = hash21(i + vec2(0.0, 1.0)), d = hash21(i + vec2(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
float fbm2(vec2 p) {
    float v = 0.0, a = 0.5;
    const mat2 R = mat2(0.80, 0.60, -0.60, 0.80);
    for (int i = 0; i < 4; i++) { v += a * noise2(p); p = R * p * 2.03 + 7.1; a *= 0.5; }
    return v;
}
float materialExposure(sampler2DArray tex)
{
    vec3 avg = textureLod(tex, vec3(0.5, 0.5, 0.0), 20.0).rgb;
    float l = dot(avg, vec3(0.299, 0.587, 0.114));
    return clamp(0.28 / max(l, 0.02), 0.60, 1.8);
}

vec3 renderSky(vec3 dir)
{
    float swell = clamp(audioSwell, 0.0, 1.0);
    float breath = 0.45 + 0.55 * swell;
    float az = atan(dir.x, dir.z);
    vec3 col;
    if (dir.y < -0.004)
    {
        float t = kGround / dir.y;
        vec3 P = dir * t;
        float haze = exp(-t * 0.012);
        float flag = smoothstep(0.0, 0.03, min(abs(fract(P.x / 6.0) - 0.5), abs(fract(P.z / 6.0) - 0.5)) - 0.46);
        col = vec3(0.16, 0.13, 0.10) * (0.6 + 0.4 * flag) * (0.7 + 0.4 * noise2(P.xz * 0.3));
        col *= 0.3 + 0.9 * breath * exp(-length(P.xz - vec2(0.0, 45.0)) * 0.015);
        col = mix(vec3(0.01), col, haze);
    }
    else
    {
        float h = clamp(dir.y, 0.0, 1.0);
        vec3 stone = vec3(0.22, 0.18, 0.14) * (0.6 + 0.6 * fbm2(vec2(az * 6.0, dir.y * 9.0)));
        col = stone * (0.08 + 0.7 * breath * exp(-h * 4.0));
        // The window: a tall arch, twelve panes, one per pitch class.
        float dx = az / 0.09;
        float dy = (dir.y - 0.30) / 0.12;
        float arch = (dy < 1.0) ? step(abs(dx), 1.0) * step(-1.2, dy) : step(dx * dx + (dy - 1.0) * (dy - 1.0), 1.0);
        int pane = int(clamp((dy + 1.2) / 2.2 * 4.0, 0.0, 3.99)) * 3 + int(clamp((dx + 1.0) * 1.5, 0.0, 2.99));
        float speak = clamp(audioChroma[pane] * 1.3, 0.0, 1.0);
        vec3 paneCol = hsv2rgb(vec3(float(pane) / 12.0, 0.7, 1.0));
        float lead = smoothstep(0.02, 0.06, abs(fract(dx * 1.5) - 0.5)) * smoothstep(0.02, 0.06, abs(fract((dy + 1.2) / 2.2 * 4.0) - 0.5));
        col = mix(col, paneCol * (0.10 + 0.9 * speak) * lead, arch);
    }
    return col;
}

void main()
{
    if (vBg > 0.5)
    {
        fragColor = vec4(renderSky(normalize(vPos)), 1.0);
        return;
    }

    float hue   = (hueP > 0.01 ? hueP : 0.0);
    float swell = clamp(audioSwell, 0.0, 1.0);
    float kick  = clamp(audioKick, 0.0, 1.0);
    float breath = 0.45 + 0.55 * swell;

    vec4 base = texture(texMeshMaterial, vec3(vUV, 0.0));
    if (base.a < 0.1) discard;
    vec3 n = normalize(vNormal);
    vec3 viewDir = normalize(-vPos);
    vec3 alb = base.rgb * materialExposure(texMeshMaterial);

    // Lit by the flames all round: warm from every side, most from above.
    vec3 col = alb * vec3(1.0, 0.72, 0.42) * (0.30 + 0.45 * breath) * (0.6 + 0.4 * n.y);
    col += alb * vec3(1.0, 0.8, 0.55) * max(n.y, 0.0) * 0.35 * breath;
    col += alb * vec3(0.10, 0.08, 0.10) * 0.4;

    // The flame: the bright warm texels at the top of the candle.
    float luma = dot(base.rgb, vec3(0.299, 0.587, 0.114));
    float flame = smoothstep(0.55, 0.8, luma) * smoothstep(0.05, 0.25, base.r - base.b) * smoothstep(0.55, 0.85, vLocal.y);
    float flick = 0.78 + 0.22 * sin(time * 7.3 + vHash * 40.0) * sin(time * 11.1 + vHash * 13.0);
    float flare = (vHash < 0.12) ? kick : 0.0;
    col += vec3(1.0, 0.85, 0.5) * flame * (1.4 + 2.2 * breath + 2.0 * flare) * flick;
    // A little glow round the flame on the wax.
    float nearFlame = smoothstep(0.45, 0.8, vLocal.y) * (1.0 - flame);
    col += alb * vec3(1.0, 0.7, 0.35) * nearFlame * (0.4 + 0.5 * breath) * flick;

    float fres = pow(1.0 - max(dot(n, viewDir), 0.0), 4.0);
    col += vec3(1.0, 0.7, 0.4) * fres * 0.15 * breath;

    if (hue > 0.001) col = hueRot(col, 0.06 * sin(hue));

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.30 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
