#version 330 core
out vec4 fragColor;
/**
 * @file ShipDocking.frag
 * @brief GEOM="MESH" FAMILY: a small ship flies an approach and comes
 * alongside a far larger station. Two loaded meshes in one scene (model= is
 * the station, model2= the ship) -- see ShipDocking.vert for the buffer
 * layout and the eased approach path.
 *
 * The two hulls are shaded from SEPARATE material textures: texMeshMaterial
 * is the station's, texMeshMaterial2 the ship's. Sampling one for both would
 * stretch whichever atlas happened to load first across the other hull.
 *
 *   sceneProgress -> the approach itself (vertex stage) and everything that
 *                    ramps with it: thrusters, floodlights, docking beacons
 *   audioKick     -> thruster pulses
 *   audioSwell    -> station lighting and beacon strength
 *
 * Per-instance: sizeP (station scale), shipScaleP (ship size as a FRACTION of
 *               the station), spinP (station spin, 0 = none), tintP (nebula).
 * Per-activation variety: hueP float palette offset (0..6.28).
 */

uniform sampler2DArray texMeshMaterial;    // station
uniform int texMeshMaterialLayers;
uniform sampler2DArray texMeshMaterial2;   // ship
uniform int texMeshMaterialLayers2;

uniform float time;
uniform float sceneProgress;
uniform float audioAdvance;
uniform float audioKick;
uniform float audioSwell;

uniform float hueP;
uniform float tintP;

in vec2  vUV;
in vec3  vNormal;
in vec3  vPos;
in vec3  vLocalPos;
in float vBg;
in float vShip;
in float vApproach;

vec3 hueRot(vec3 c, float a) {
    vec3 k = vec3(0.57735026919);
    float cs = cos(a), sn = sin(a);
    return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
}
vec3 hsv2rgb(vec3 c) {
    vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
    vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
    return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}
float hash13(vec3 p) {
    p = fract(p * 0.3183099 + vec3(0.71, 0.113, 0.419));
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float noise3(vec3 x) {
    vec3 i = floor(x), f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    float n000 = hash13(i + vec3(0.0,0.0,0.0)), n100 = hash13(i + vec3(1.0,0.0,0.0));
    float n010 = hash13(i + vec3(0.0,1.0,0.0)), n110 = hash13(i + vec3(1.0,1.0,0.0));
    float n001 = hash13(i + vec3(0.0,0.0,1.0)), n101 = hash13(i + vec3(1.0,0.0,1.0));
    float n011 = hash13(i + vec3(0.0,1.0,1.0)), n111 = hash13(i + vec3(1.0,1.0,1.0));
    return mix(mix(mix(n000,n100,f.x), mix(n010,n110,f.x), f.y),
               mix(mix(n001,n101,f.x), mix(n011,n111,f.x), f.y), f.z);
}
float fbm(vec3 p) {
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 5; i++) { v += a * noise3(p); p = p * 2.03 + 7.1; a *= 0.5; }
    return v;
}
float starsField(vec3 dir, float density) {
    return smoothstep(1.0 - density, 1.0, hash13(floor(dir * 500.0)));
}

vec3 renderSky(vec3 dir, vec3 tint)
{
    float n1 = fbm(dir * 2.0 + vec3(time * 0.003, 0.0, 0.0));
    float n2 = fbm(dir * 5.0 - vec3(0.0, time * 0.002, 0.0));
    vec3 cloud = mix(tint * 0.08, tint * 1.05, smoothstep(0.38, 0.80, n1)) * (0.5 + 0.5 * n2);
    return cloud + vec3(1.0) * starsField(dir, 0.002);
}

// AUTO-EXPOSURE against the material's own average brightness.
// This asset set is not uniform: measured base-colour luma runs from 0.14
// (dark station hulls) to 0.67 (a near-white Culture GSV) -- a factor of
// more than four. A single fixed lighting gain therefore cannot serve both;
// tuned for the dark hulls it blows the bright ones out to a featureless
// white blob, which is exactly how they were rendering.
// The COARSEST MIP of the material array is the texture's average, so one
// extra fetch buys a per-model exposure with no CPU side and no new uniform.
float materialExposure(sampler2DArray tex)
{
    vec3 avg = textureLod(tex, vec3(0.5, 0.5, 0.0), 20.0).rgb;   // lod clamps to the last level
    float l = dot(avg, vec3(0.299, 0.587, 0.114));
    return clamp(0.20 / max(l, 0.02), 0.30, 2.0);
}

void main()
{
    vec3 tint = hsv2rgb(vec3(tintP / 6.2831853, 0.5, 1.0));

    if (vBg > 0.5)
    {
        fragColor = vec4(renderSky(normalize(vPos), tint), 1.0);
        return;
    }

    float hue = (hueP > 0.01 ? hueP : 0.0);
    bool ship = vShip > 0.5;

    // Each hull reads its OWN material array.
    vec4 base;
    float roughness, metallic;
    if (ship)
    {
        base = texture(texMeshMaterial2, vec3(vUV, 0.0));
        roughness = 0.5; metallic = 0.35;
        if (texMeshMaterialLayers2 >= 2)
        {
            vec4 mr = texture(texMeshMaterial2, vec3(vUV, 1.0));
            roughness = mr.g; metallic = mr.b;
        }
    }
    else
    {
        base = texture(texMeshMaterial, vec3(vUV, 0.0));
        roughness = 0.6; metallic = 0.3;
        if (texMeshMaterialLayers >= 2)
        {
            vec4 mr = texture(texMeshMaterial, vec3(vUV, 1.0));
            roughness = mr.g; metallic = mr.b;
        }
    }
    if (base.a < 0.1) discard;

    vec3 n = normalize(vNormal);
    vec3 viewDir = normalize(-vPos);

    vec3 lightDir = normalize(vec3(0.35, 0.5, -0.6));
    float diff = max(dot(n, lightDir), 0.0);
    float fill = 0.5 + 0.5 * dot(n, vec3(0.0, 1.0, 0.0));
    vec3 halfV = normalize(lightDir + viewDir);
    float spec = pow(max(dot(n, halfV), 0.0), mix(50.0, 8.0, roughness));
    vec3 specColor = mix(vec3(0.92, 0.95, 1.0), base.rgb, metallic);

    // Each hull exposes against its OWN material, so a bright shuttle
    // beside a dark station does not blow out while the station stays flat.
    float expose = ship ? materialExposure(texMeshMaterial2) : materialExposure(texMeshMaterial);
    vec3 col = base.rgb * expose * (0.45 + diff * (1.25 + 0.45 * audioSwell) + fill * 0.3);
    col += specColor * spec * (0.5 + 0.6 * (1.0 - roughness));

    float luma = dot(base.rgb, vec3(0.299, 0.587, 0.114));

    if (ship)
    {
        // Braking thrusters: the ship is decelerating into the dock, so the
        // burn should be strongest early and taper as it arrives -- a thrust
        // flare that peaks at contact would read as an impact.
        float aft = smoothstep(-0.20, -0.46, vLocalPos.z);
        float burn = (1.0 - vApproach) * 0.85 + 0.15;
        col += vec3(0.45, 0.75, 1.0) * aft * burn * (0.9 + 1.4 * audioKick);

        // Its own navigation strobes.
        float strobe = step(0.97, fract(time * 1.3)) * step(0.9, fract(vLocalPos.z * 7.0));
        col += vec3(1.0, 0.9, 0.8) * strobe * 1.2;
    }
    else
    {
        // Station windows, as everywhere else in this catalogue: the baked
        // albedo's brightest patches treated as self-lit. Threshold low
        // because this whole asset batch is uniformly dark.
        float win = smoothstep(0.25, 0.55, luma);
        col += vec3(1.0, 0.86, 0.58) * win * (0.45 + 0.4 * audioSwell);

        // The dock's guidance beacons come alive as the ship closes, which
        // is what tells the eye the two objects belong to one event rather
        // than happening to share a frame.
        float bay = smoothstep(0.12, 0.0, abs(vLocalPos.x + 0.18));
        float pulse = 0.5 + 0.5 * sin(time * 3.5 - vLocalPos.y * 8.0);
        col += vec3(0.2, 1.0, 0.45) * bay * pulse * vApproach * (0.6 + 0.5 * audioSwell);
    }

    float fres = pow(1.0 - max(dot(n, viewDir), 0.0), 4.0);
    col += mix(vec3(0.7, 0.85, 1.0), tint, 0.35) * fres * (0.12 + 0.22 * audioSwell);

    if (hue > 0.001) col = hueRot(col, 0.15 * sin(hue));

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
