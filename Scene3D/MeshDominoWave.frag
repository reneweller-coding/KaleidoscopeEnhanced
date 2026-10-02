#version 330 core
out vec4 fragColor;   ///< The pixel's colour (output).
/**
 * @file MeshDominoWave.frag
 * @brief MESH DOMINO WAVE: 224 real dominoes (one model, instances="224")
 * standing in serpentine lanes on a table, seen low, and the wave of
 * toppling running along them on the scene clock. A spotlight follows the
 * front; the tiles' faces catch the lamp as they turn; the kick is a
 * glint on the standing tiles, the swell the room light. The mesh
 * counterpart of the procedural DominoCascadeWave.
 *
 * Audio Reactivity:
 *   sceneProgress -> the wave (vertex stage, the clock)
 *   audioKick     -> glints (light)
 *   audioSwell    -> room light (slow)
 *
 * Per-instance: sizeP. Per-activation variety: hueP.
 */

uniform sampler2DArray texMeshMaterial;   ///< The mesh's material textures (albedo, roughness, normal ...).
uniform int   texMeshMaterialLayers;   ///< Number of layers in texMeshMaterial.

uniform float time;   ///< Seconds since the program started (never reset; see sceneTime).
uniform float audioKick;   ///< Kick-drum envelope, 0..1 (fast attack, short decay).
uniform float audioSwell;   ///< Slow loudness envelope, 0..1 (seconds).

uniform float hueP;   ///< Hue knob (radians), usually the music's chroma hue plus a rolled offset.

in vec2  vUV;   ///< Texture coordinate 0..1 over the screen (from the vertex stage).
in vec3  vNormal;   ///< Surface normal (from the vertex stage).
in vec3  vPos;   ///< Position (from the vertex stage).
in vec3  vLocal;   ///< Object-space position (from the vertex stage).
in float vBg;   ///< Background flag (from the vertex stage).
in float vInst;
in float vFall;
in vec3  vFront;

const float kGround = -8.0;

/// @brief Rotates a colour's hue by an angle (about the grey axis).
vec3 hueRot(vec3 c, float a) {
    vec3 k = vec3(0.57735026919);
    float cs = cos(a), sn = sin(a);
    return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
}
/// @brief Pseudo-random number 0..1 from a 2D point.
float hash21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
/// @brief Smooth 2D value noise, 0..1.
float noise2(vec2 x) {
    vec2 i = floor(x), f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    float a = hash21(i), b = hash21(i + vec2(1.0, 0.0));
    float c = hash21(i + vec2(0.0, 1.0)), d = hash21(i + vec2(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
/// @brief Exposure that brings the material's average brightness to a common level.
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

/// @brief The sky colour for a direction.
vec3 renderSky(vec3 dir)
{
    float swell = clamp(audioSwell, 0.0, 1.0);
    float light = 0.4 + 0.6 * swell;
    vec3 col;
    if (dir.y < -0.004)
    {
        // The table: dark walnut, and the spotlight's pool on it.
        float t = kGround / dir.y;
        vec3 P = dir * t;
        float haze = exp(-t * 0.007);
        float grain = 0.7 + 0.4 * noise2(vec2(P.x * 0.3, P.z * 2.5));
        col = vec3(0.24, 0.15, 0.09) * grain * light;
        float pool = exp(-length(P.xz - vFront.xz) * 0.06);
        col += vec3(1.0, 0.9, 0.7) * pool * 0.35;
        col = mix(vec3(0.02), col, haze);
    }
    else
    {
        float h = clamp(dir.y, 0.0, 1.0);
        col = vec3(0.09, 0.08, 0.10) * (0.6 + 0.5 * noise2(vec2(atan(dir.x, dir.z) * 6.0, dir.y * 8.0))) * exp(-h * 3.0) * light;
        col += vec3(1.0, 0.85, 0.6) * exp(-distance(dir, normalize(vec3(0.2, 0.7, 1.0))) * 3.5) * 0.12 * light;
    }
    return col;
}

/// @brief Entry point of this shader stage (the file description says what it draws).
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
    float light = 0.4 + 0.6 * swell;

    vec4 base = texture(texMeshMaterial, vec3(vUV, 0.0));
    if (base.a < 0.1) discard;
    float roughness = 0.35, metallic = 0.0;
    if (texMeshMaterialLayers >= 2)
    {
        vec4 mr = texture(texMeshMaterial, vec3(vUV, 1.0));
        roughness = mr.g; metallic = mr.b;
    }
    vec3 n = normalize(vNormal);
    vec3 viewDir = normalize(-vPos);
    vec3 alb = base.rgb * materialExposure(texMeshMaterial);

    vec3 lampDir = normalize(vec3(0.2, 0.7, -0.5));
    vec3 col = alb * vec3(1.0, 0.9, 0.75) * max(dot(n, lampDir), 0.0) * 1.0 * light;
    col += alb * vec3(0.18, 0.16, 0.20) * (0.55 + 0.45 * n.y) * 0.6;
    col += alb * 0.05;
    // The spotlight on the front.
    col += alb * lightAt(vPos, n, vFront + vec3(0.0, 9.0, -6.0), vec3(1.0, 0.92, 0.75) * 4.0, 16.0);

    vec3 halfV = normalize(lampDir + viewDir);
    float spec = pow(max(dot(n, halfV), 0.0), mix(90.0, 10.0, roughness));
    col += vec3(1.0) * spec * (0.25 + 0.6 * kick * (1.0 - vFall)) * light;

    float fres = pow(1.0 - max(dot(n, viewDir), 0.0), 4.0);
    col += vec3(1.0, 0.9, 0.8) * fres * 0.10 * light;

    if (hue > 0.001) col = hueRot(col, 0.06 * sin(hue));

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.30 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
