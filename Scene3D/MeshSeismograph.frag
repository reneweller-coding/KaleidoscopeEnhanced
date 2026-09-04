#version 330 core
out vec4 fragColor;
/**
 * @file MeshSeismograph.frag
 * @brief MESH SEISMOGRAPH: a real drum seismograph -- the cast-iron base
 * with its pen arm (model=) and the paper drum (model2=) turning under the
 * pen on time. The trace on the paper is REAL: the last revolution of the
 * drum carries the bass energy of the last eighteen seconds, read from the
 * engine's spectrogram ring (texSpectro) at the age each point on the
 * paper passed under the pen, drawn as a wandering ink line; older
 * revolutions are the faint helix of earlier traces. A desk lamp with the
 * swell; the kick makes the pen's ink bloom. The mesh counterpart of the
 * procedural SeismographDrum.
 *
 * Audio Reactivity:
 *   texSpectro (bass band history) -> the trace (light: ink on paper)
 *   audioKick  -> ink bloom at the pen (light)
 *   audioSwell -> lamp (slow)
 *   time       -> the drum turns (continuous, vertex stage)
 *
 * Per-instance: sizeP, drumP, drumXP/YP/ZP. Per-activation variety: hueP.
 */

uniform sampler2DArray texMeshMaterial;     // the base
uniform int   texMeshMaterialLayers;
uniform sampler2DArray texMeshMaterial2;    // the drum
uniform int   texMeshMaterialLayers2;

uniform sampler2D texSpectro;   // 32 log-spaced bands across, ~20 s of history down (ring)
uniform float spectroHead;      // T coordinate of "now"
uniform float spectroFill;

uniform float time;
uniform float audioKick;
uniform float audioSwell;
uniform float audioLevel;

uniform float hueP;

in vec2  vUV;
in vec3  vNormal;
in vec3  vPos;
in vec3  vLocal;
in float vBg;
in float vDrum;
in float vTurn;

const float kDist   = 46.0;
const float kGround = -16.0;
const float kRate   = 0.35;
const float kPenAngle = 1.2;   // where the pen touches the drum, in the drum's frame at turn 0

vec3 hueRot(vec3 c, float a) {
    vec3 k = vec3(0.57735026919);
    float cs = cos(a), sn = sin(a);
    return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
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
        float t = kGround / dir.y;
        vec3 P = dir * t;
        float haze = exp(-t * 0.010);
        float grain = 0.7 + 0.4 * noise2(vec2(P.x * 0.4, P.z * 3.0));
        col = vec3(0.32, 0.24, 0.14) * grain * lamp;
        col += vec3(1.0, 0.85, 0.6) * exp(-length(P.xz - vec2(6.0, 40.0)) * 0.05) * 0.3 * lamp;
        col = mix(vec3(0.02), col, haze);
    }
    else
    {
        float h = clamp(dir.y, 0.0, 1.0);
        float az = atan(dir.x, dir.z);
        col = vec3(0.18, 0.19, 0.17) * (0.6 + 0.5 * noise2(vec2(az * 6.0, dir.y * 8.0))) * exp(-h * 3.0) * lamp;
        // A shelf of instruments behind: dark shapes.
        float shelf = step(0.10, dir.y) * step(dir.y, 0.13) * step(abs(az), 0.8);
        col += vec3(0.3, 0.25, 0.18) * shelf * lamp * 0.4;
        col += vec3(1.0, 0.85, 0.6) * exp(-distance(dir, normalize(vec3(0.35, 0.65, 1.0))) * 4.0) * 0.18 * lamp;
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
    bool drum = vDrum > 0.5;

    vec4 base;
    float roughness = 0.5, metallic = 0.3;
    float expose;
    if (drum)
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

    if (drum)
    {
        // The paper: the pale unsaturated texels round the cylinder.
        float luma = dot(base.rgb, vec3(0.299, 0.587, 0.114));
        float mx = max(base.r, max(base.g, base.b));
        float mn = min(base.r, min(base.g, base.b));
        float paper = smoothstep(0.45, 0.7, luma) * (1.0 - smoothstep(0.15, 0.35, (mx - mn) / max(mx, 1e-3)));
        // Where on the cylinder: the angle round the axle, and the position along it.
        float phi = atan(vLocal.y, vLocal.z);
        // This point passed under the pen when the drum had turned by (kPenAngle - phi).
        float since = mod(vTurn - (kPenAngle - phi), 6.2831853) / kRate;     // seconds ago, one revolution at most
        float age01 = clamp(since / 20.0, 0.0, 0.95);
        float e = texture(texSpectro, vec2(0.08, fract(spectroHead - age01))).r;
        float fine = texture(texSpectro, vec2(0.45, fract(spectroHead - age01))).r;
        e = clamp(e * 1.4, 0.0, 1.0) * min(spectroFill * 4.0, 1.0);
        // The pen creeps along the drum as it turns, so the trace is a helix.
        float slow = fract((time - since) / 140.0);
        float xPen = -0.70 + 1.40 * slow;
        float wiggle = (e - 0.12) * 0.35 * sin(since * 9.0 + phi * 3.0) + (fine - 0.1) * 0.12 * sin(since * 31.0);
        float ink = 1.0 - smoothstep(0.010, 0.022, abs(vLocal.x - (xPen + wiggle)));
        ink *= paper * smoothstep(0.0, 0.06, age01);
        // Older revolutions: the faint helix of earlier traces.
        float older = 0.0;
        for (int k = 1; k < 5; k++)
        {
            float xk = xPen - float(k) * (6.2831853 / kRate) / 140.0 * 1.40;
            float wk = 0.08 * sin(phi * 7.0 + float(k) * 2.0) * (0.3 + 0.7 * noise2(vec2(phi * 3.0, float(k))));
            older += (1.0 - smoothstep(0.008, 0.018, abs(vLocal.x - (xk + wk)))) * 0.45;
        }
        older *= paper;
        vec3 col = alb * vec3(1.0, 0.92, 0.78) * (0.5 + 0.5 * max(dot(n, normalize(vec3(0.3, 0.7, -0.5))), 0.0)) * 1.2 * lamp;
        col += alb * 0.08;
        col = mix(col, vec3(0.04, 0.04, 0.06), clamp(ink + older, 0.0, 1.0));
        // The ink blooms at the pen on the kick.
        float atPen = 1.0 - smoothstep(0.0, 0.15, abs(atan(sin(phi - (kPenAngle - mod(vTurn, 6.2831853))), cos(phi - (kPenAngle - mod(vTurn, 6.2831853))))));
        col = mix(col, vec3(0.05, 0.05, 0.10), atPen * paper * kick * 0.6);
        if (hue > 0.001) col = hueRot(col, 0.05 * sin(hue));
        vec3 _t = max(col, 0.0);
        _t /= 1.0 + 0.30 * max(_t.r, max(_t.g, _t.b));
        fragColor = vec4(clamp(_t, 0.0, 1.0), 1.0);
        return;
    }

    vec3 lampDir = normalize(vec3(0.3, 0.7, -0.5));
    vec3 col = alb * vec3(1.0, 0.9, 0.75) * max(dot(n, lampDir), 0.0) * 1.2 * lamp;
    col += alb * vec3(0.18, 0.18, 0.20) * (0.55 + 0.45 * n.y) * 0.6;
    col += alb * 0.05;
    vec3 halfV = normalize(lampDir + viewDir);
    float spec = pow(max(dot(n, halfV), 0.0), mix(80.0, 8.0, roughness));
    col += mix(vec3(1.0, 0.95, 0.85), base.rgb, metallic) * spec * (0.3 + 0.7 * metallic) * lamp;
    float fres = pow(1.0 - max(dot(n, viewDir), 0.0), 4.0);
    col += vec3(1.0, 0.85, 0.65) * fres * 0.12 * lamp;

    if (hue > 0.001) col = hueRot(col, 0.06 * sin(hue));

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.30 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
