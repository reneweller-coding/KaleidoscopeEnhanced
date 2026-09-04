#version 330 core
out vec4 fragColor;
/**
 * @file MeshMetronomes.frag
 * @brief MESH METRONOMES: twelve real metronomes (body model= and a rod
 * from model2=, instances="12") on a bench in two rows, each ticking at
 * its own tempo, their rods swinging on time. Each body answers a spectrum
 * band, glowing on its scale plate; the brass weights glint on the kick
 * and flash at the ends of their swings (the tick); the swell is the lamp.
 * The mesh counterpart of the procedural MetronomeForest.
 *
 * Audio Reactivity:
 *   audioSpectrum[32] -> each body's band glow (light)
 *   audioKick         -> weights glint (light)
 *   audioSwell        -> lamp (slow)
 *   time              -> the swings and the ticks (continuous)
 *
 * Per-instance: sizeP, armP, pivotP, frontP. Per-activation variety: hueP.
 */

uniform sampler2DArray texMeshMaterial;     // the body
uniform int   texMeshMaterialLayers;
uniform sampler2DArray texMeshMaterial2;    // the rod
uniform int   texMeshMaterialLayers2;

uniform float time;
uniform float audioSpectrum[32];
uniform float audioKick;
uniform float audioSwell;

uniform float hueP;

in vec2  vUV;
in vec3  vNormal;
in vec3  vPos;
in vec3  vLocal;
in float vBg;
in float vInst;
in float vArm;
in float vSwing;

const float kGround = -14.0;

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
float materialExposure(sampler2DArray tex)
{
    vec3 avg = textureLod(tex, vec3(0.5, 0.5, 0.0), 20.0).rgb;
    float l = dot(avg, vec3(0.299, 0.587, 0.114));
    return clamp(0.28 / max(l, 0.02), 0.60, 1.8);
}

vec3 renderSky(vec3 dir)
{
    float swell = clamp(audioSwell, 0.0, 1.0);
    float lamp = 0.45 + 0.6 * swell;
    vec3 col;
    if (dir.y < -0.004)
    {
        // The bench: oak boards.
        float t = kGround / dir.y;
        vec3 P = dir * t;
        float haze = exp(-t * 0.010);
        float board = smoothstep(0.0, 0.03, abs(fract(P.z / 8.0) - 0.5) - 0.46);
        float grain = 0.7 + 0.4 * noise2(vec2(P.x * 0.4, P.z * 3.0));
        col = vec3(0.40, 0.28, 0.15) * grain * (0.6 + 0.4 * board) * lamp;
        col = mix(vec3(0.02), col, haze);
    }
    else
    {
        float h = clamp(dir.y, 0.0, 1.0);
        col = vec3(0.20, 0.18, 0.16) * (0.6 + 0.5 * noise2(vec2(atan(dir.x, dir.z) * 6.0, dir.y * 8.0))) * exp(-h * 3.0) * lamp;
        col += vec3(1.0, 0.85, 0.6) * exp(-distance(dir, normalize(vec3(0.3, 0.7, 1.0))) * 4.0) * 0.15 * lamp;
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
    float lamp  = 0.45 + 0.6 * swell;
    int   i     = int(vInst + 0.5);
    float band  = clamp(audioSpectrum[(i * 2 + 3) % 32] * 1.5, 0.0, 1.0);
    bool arm = vArm > 0.5;

    vec4 base;
    float roughness = 0.5, metallic = 0.2;
    float expose;
    if (arm)
    {
        base = texture(texMeshMaterial2, vec3(vUV, 0.0));
        if (texMeshMaterialLayers2 >= 2) { vec4 mr = texture(texMeshMaterial2, vec3(vUV, 1.0)); roughness = mr.g; metallic = mr.b; }
        expose = materialExposure(texMeshMaterial2);
    }
    else
    {
        base = texture(texMeshMaterial, vec3(vUV, 0.0));
        if (texMeshMaterialLayers >= 2) { vec4 mr = texture(texMeshMaterial, vec3(vUV, 1.0)); roughness = mr.g; metallic = mr.b; }
        expose = materialExposure(texMeshMaterial);
    }
    if (base.a < 0.1) discard;
    vec3 n = normalize(vNormal);
    vec3 viewDir = normalize(-vPos);
    vec3 alb = base.rgb * expose;

    vec3 lampDir = normalize(vec3(0.3, 0.7, -0.55));
    vec3 col = alb * vec3(1.0, 0.88, 0.7) * max(dot(n, lampDir), 0.0) * 1.2 * lamp;
    col += alb * vec3(0.20, 0.18, 0.20) * (0.55 + 0.45 * n.y) * 0.6;
    col += alb * 0.05;

    vec3 halfV = normalize(lampDir + viewDir);
    float spec = pow(max(dot(n, halfV), 0.0), mix(90.0, 8.0, roughness));
    col += mix(vec3(1.0, 0.95, 0.85), base.rgb, metallic) * spec * (0.3 + 0.7 * metallic) * lamp;

    if (arm)
    {
        // The weight (the sphere, now at the top): the kick's glint, and the
        // tick at the ends of the swing.
        float weight = smoothstep(0.2, 0.55, -vLocal.y);   // the sphere is the model's bottom, flipped up
        float tick = pow(abs(vSwing), 14.0);
        col += vec3(1.0, 0.9, 0.7) * weight * (0.6 * kick + 0.5 * tick);
    }
    else
    {
        // The scale plate (pale texels on the front) glows with the band.
        float luma = dot(base.rgb, vec3(0.299, 0.587, 0.114));
        float plate = smoothstep(0.35, 0.6, luma);
        col += hsv2rgb(vec3(float(i) / 12.0, 0.45, 1.0)) * plate * band * 0.7;
    }

    float fres = pow(1.0 - max(dot(n, viewDir), 0.0), 4.0);
    col += vec3(1.0, 0.85, 0.65) * fres * 0.12 * lamp;

    if (hue > 0.001) col = hueRot(col, 0.06 * sin(hue));

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.30 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
