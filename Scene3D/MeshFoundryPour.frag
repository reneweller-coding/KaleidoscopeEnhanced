#version 330 core
out vec4 fragColor;
/**
 * @file MeshFoundryPour.frag
 * @brief MESH FOUNDRY POUR: a real sand mould (model=) on the foundry floor
 * and a real ladle (model2=) tipping molten metal into it on the scene
 * clock. The stream is painted on the shell along the line from the lip to
 * the pouring cup (there is no geometry for it, and everything the stream
 * crosses on screen is background); the melt spreads in the mould and cools
 * from white through orange to dull red; sparks fly from the cup; the glow
 * lights the whole shop. The bass is the furnace roar as light, the kick a
 * burst of sparks, the swell the pour's brightness. The mesh counterpart
 * of the procedural FoundryPour.
 *
 * Audio Reactivity:
 *   sceneProgress -> the pour, the melt, the cooling (the clock)
 *   audioKick     -> spark bursts (light)
 *   audioBass     -> furnace glow (light)
 *   audioSwell    -> the stream's brightness (slow)
 *
 * Per-instance: sizeP, ladleP, lipP. Per-activation variety: hueP.
 */

uniform sampler2DArray texMeshMaterial;     // the mould
uniform int   texMeshMaterialLayers;
uniform sampler2DArray texMeshMaterial2;    // the ladle
uniform int   texMeshMaterialLayers2;

uniform float time;
uniform float sceneTime;
uniform float sceneProgress;
uniform float audioKick;
uniform float audioBass;
uniform float audioSwell;

uniform float hueP;

in vec2  vUV;
in vec3  vNormal;
in vec3  vPos;
in vec3  vLocal;
in float vBg;
in float vLadle;
in float vPour;
in vec3  vLip;
in vec3  vCup;

const float kDist   = 48.0;
const float kGround = -18.0;

vec3 hueRot(vec3 c, float a) {
    vec3 k = vec3(0.57735026919);
    float cs = cos(a), sn = sin(a);
    return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
}
float hash21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float hash11(float p) { return fract(sin(p * 12.9898) * 43758.5453); }
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
vec3 lightAt(vec3 P, vec3 n, vec3 lp, vec3 lc, float range)
{
    vec3 d = lp - P;
    float dist = length(d);
    d /= max(dist, 1e-3);
    float att = 1.0 / (1.0 + (dist * dist) / (range * range));
    return lc * max(dot(n, d), 0.0) * att;
}

// Heat colour: white-hot down to dull red.
vec3 heatCol(float h)
{
    return mix(mix(vec3(0.25, 0.02, 0.0), vec3(1.0, 0.35, 0.05), smoothstep(0.0, 0.5, h)),
               vec3(1.0, 0.92, 0.75), smoothstep(0.5, 1.0, h));
}

// Distance from a direction to the great-circle segment between two directions.
float segDist(vec3 d, vec3 a, vec3 b, out float u)
{
    vec3 ab = b - a;
    u = clamp(dot(d - a, ab) / max(dot(ab, ab), 1e-6), 0.0, 1.0);
    return distance(d, normalize(a + ab * u));
}

vec3 renderSky(vec3 dir)
{
    float bass  = clamp(audioBass, 0.0, 1.0);
    float kick  = clamp(audioKick, 0.0, 1.0);
    float swell = clamp(audioSwell, 0.0, 1.0);
    float pour  = vPour;
    vec3 col;
    float az = atan(dir.x, dir.z);
    if (dir.y < -0.004)
    {
        float t = kGround / dir.y;
        vec3 P = dir * t;
        float haze = exp(-t * 0.008);
        col = vec3(0.12, 0.10, 0.08) * (0.6 + 0.6 * noise2(P.xz * 0.15));
        col += vec3(1.0, 0.45, 0.12) * exp(-length(P.xz - vCup.xz) * 0.05) * (0.3 + 1.2 * pour);
        col = mix(vec3(0.02), col, haze);
    }
    else
    {
        float h = clamp(dir.y, 0.0, 1.0);
        col = vec3(0.10, 0.08, 0.07) * (0.6 + 0.5 * noise2(vec2(az * 6.0, dir.y * 8.0))) * exp(-h * 2.5);
        // The furnace mouth, low on the right: the bass is its roar as light.
        float mouth = step(abs(az - 0.95), 0.10) * step(0.0, dir.y) * step(dir.y, 0.14);
        col += vec3(1.0, 0.45, 0.10) * mouth * (0.5 + 1.2 * bass);
        col += vec3(1.0, 0.4, 0.1) * exp(-distance(dir, normalize(vec3(sin(0.95), 0.07, cos(0.95)))) * 5.0) * (0.15 + 0.35 * bass);
    }
    // The stream: from the lip to the cup, wavering, bright.
    if (pour > 0.01)
    {
        vec3 a = normalize(vLip), b = normalize(vCup);
        float u;
        float d = segDist(dir, a, b, u);
        float waver = 0.004 * sin(u * 40.0 - sceneTime * 12.0) * (1.0 - u);
        float w = 0.010 + 0.006 * u;
        float core = 1.0 - smoothstep(w * 0.5, w, abs(d - waver));
        float glow = exp(-d * 90.0);
        col += heatCol(0.9) * core * pour * (2.0 + 1.0 * swell);
        col += vec3(1.0, 0.5, 0.15) * glow * pour * 0.6;
    }
    // Sparks from the cup: round points on their own arcs, the kick a burst.
    vec3 c = normalize(vCup);
    for (int i = 0; i < 24; i++)
    {
        float fi = float(i);
        float life = fract(sceneTime * (0.5 + 0.4 * hash11(fi)) + hash11(fi + 7.0));
        float ang = hash11(fi + 3.0) * 3.14159 - 1.57;
        float r = life * (0.06 + 0.08 * hash11(fi + 9.0));
        vec3 sp = normalize(c + vec3(sin(ang) * r, r * 1.4 - life * life * 0.12, 0.0));
        float dd = distance(dir, sp);
        col += vec3(1.0, 0.7, 0.3) * (1.0 - smoothstep(0.0025, 0.004, dd)) * (1.0 - life) * (0.4 + 1.2 * kick) * pour;
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
    float bass  = clamp(audioBass, 0.0, 1.0);
    float kick  = clamp(audioKick, 0.0, 1.0);
    float pour  = vPour;
    bool ladle = vLadle > 0.5;

    vec4 base;
    float roughness = 0.7, metallic = 0.2;
    float expose;
    if (ladle)
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

    // The shop's light: a dim lamp, the furnace from the right, and the
    // melt itself as two point lights (the lip and the cup).
    vec3 lampDir = normalize(vec3(-0.2, 0.8, -0.5));
    vec3 col = alb * vec3(0.7, 0.7, 0.75) * max(dot(n, lampDir), 0.0) * 0.5;
    col += alb * vec3(1.0, 0.45, 0.15) * max(dot(n, normalize(vec3(0.8, 0.1, 0.5))), 0.0) * (0.2 + 0.6 * bass);
    col += alb * vec3(0.10, 0.09, 0.10) * 0.5;
    vec3 meltCol = vec3(1.0, 0.55, 0.2) * (3.0 + 2.0 * pour);
    col += alb * lightAt(vPos, n, vCup + vec3(0.0, 2.0, 0.0), meltCol * pour, 22.0);
    col += alb * lightAt(vPos, n, vLip, meltCol * (0.4 + 0.6 * pour), 18.0);

    vec3 halfV = normalize(lampDir + viewDir);
    float spec = pow(max(dot(n, halfV), 0.0), mix(60.0, 8.0, roughness));
    col += mix(vec3(1.0), base.rgb, metallic) * spec * 0.2;

    float luma = dot(base.rgb, vec3(0.299, 0.587, 0.114));
    if (ladle)
    {
        // The lining glows from inside: the upward-facing interior.
        float inside = smoothstep(0.1, 0.6, vLocal.y) * smoothstep(0.0, 0.5, n.y);
        col += heatCol(0.85) * inside * (0.6 + 0.8 * pour) * (0.7 + 0.5 * bass);
    }
    else
    {
        // The melt in the mould: the cavity (the dark texels on the top)
        // fills as the pour runs and cools from the edges afterwards.
        float top = smoothstep(0.55, 0.85, vLocal.y) * smoothstep(0.3, 0.8, n.y);
        float cavity = top * (1.0 - smoothstep(0.25, 0.45, luma));
        float fill = smoothstep(0.20, 0.55, sceneProgress);
        float cool = smoothstep(0.55, 1.0, sceneProgress);
        float heat = fill * (1.0 - 0.8 * cool);
        col = mix(col, heatCol(heat) * (1.5 + 0.6 * bass), cavity * fill);
    }

    float fres = pow(1.0 - max(dot(n, viewDir), 0.0), 4.0);
    col += vec3(1.0, 0.5, 0.2) * fres * (0.1 + 0.3 * pour);

    if (hue > 0.001) col = hueRot(col, 0.06 * sin(hue));

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.30 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
