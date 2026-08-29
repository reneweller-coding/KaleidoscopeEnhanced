#version 330 core
out vec4 fragColor;
/**
 * @file FortressStation.frag
 * @brief GEOM="MESH" STATION FAMILY: armored/military hulls (bastions,
 * citadels, border patrol posts, defense platforms, fortified outposts),
 * shown against a moody dust nebula painted onto the sky shell
 * Scene3DShader::buildGeometry() appends after the loaded mesh (see
 * FortressStation.vert) -- vBg selects shell vs. hull. Harsh single-source
 * key light (a searchlight/beacon, not a soft star) plus a pulsing red
 * alarm-strobe accent on the hull's brightest baked markings; no
 * photo-tinting on the hull itself -- the nebula carries the color.
 *   audioKick    -> alarm-strobe flashes
 *   audioSwell   -> key-light intensity
 *   audioAdvance -> tumble speed (vertex stage)
 *
 * Per-instance: sizeP (relative scale), alarmP (strobe intensity).
 * Per-activation variety: hueP float palette offset (0..6.28).
 */

uniform sampler2DArray texMeshMaterial;
uniform int texMeshMaterialLayers;

uniform float time;
uniform float audioAdvance;
uniform float audioBass;
uniform float audioKick;
uniform float audioSwell;

uniform float hueP;
uniform float alarmP;

in vec2 vUV;
in vec3 vNormal;
in vec3 vPos;
in float vBg;

vec3 hueRot(vec3 c, float a) {
    vec3 k = vec3(0.57735026919);
    float cs = cos(a), sn = sin(a);
    return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
}

// ---- Sky shell: shared hash/noise/fbm + a moody dust nebula ----
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
    // Rotate between octaves. Without it every octave's value-noise lattice
    // shares the same axes, and at the sky's low base frequency (a cell spans
    // ~30 degrees) the aligned cells add up into visibly SQUARE cloud edges --
    // the reported blocky nebula. The rotation decorrelates the lattices, so
    // the sum has no preferred axis to show.
    const mat3 rot = mat3( 0.00,  0.80,  0.60,
                          -0.80,  0.36, -0.48,
                          -0.60, -0.48,  0.64);
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 5; i++) { v += a * noise3(p); p = rot * p * 2.03 + 7.1; a *= 0.5; }
    return v;
}
float starsField(vec3 dir, float density) {
    float h = hash13(floor(dir * 500.0));
    return smoothstep(1.0 - density, 1.0, h);
}
vec3 renderSky(vec3 dir)
{
    // A brooding red/orange dust cloud -- a warfront backdrop, not a
    // pretty postcard nebula.
    float n1 = fbm(dir * 2.0 + vec3(time * 0.005, 0.0, 0.0));
    float n2 = fbm(dir * 5.5 - vec3(0.0, time * 0.003, 0.0));
    vec3 tint = vec3(0.55, 0.16, 0.10);
    // The beat lives HERE now. The hulls hold still (their kick hops and
    // the camera's swell-dolly are gone), so the backgrounds carry the
    // music: a kick pulse on the dominant glow, sized to read clearly
    // without breaking the temporal budget's full-frame brightness cap.
    vec3 cloud = mix(tint * 0.15, tint * 1.3, smoothstep(0.35, 0.75, n1)) * (0.6 + 0.6 * n2)
               * (0.85 + 0.25 * audioKick + 0.12 * audioBass);
    // Sheet lightning INSIDE the thick banks on the kick -- a warfront
    // rumbling in time, which is what this backdrop always wanted to be.
    cloud += tint * 0.55 * audioKick * pow(smoothstep(0.55, 0.85, n1), 2.0);
    return cloud + vec3(1.0) * starsField(dir, 0.0016);
}

// ---- normal mapping ------------------------------------------------------
// Layer 2 of the material array is a tangent-space normal map, present on the
// assets whose generator run produced a usable one (about a fifth of them).
//
// There are no tangents in the vertex format -- it is a fixed 8 floats shared
// by every geom kind -- so the frame is rebuilt per fragment from screen-space
// derivatives of position and UV. That is the standard cotangent-frame trick,
// and it costs nothing in the vertex stage and no change to the buffer layout.
// A model WITHOUT a normal map has materialLayers < 3 and this returns the
// interpolated normal untouched, so every scene works either way.
mat3 cotangentFrame(vec3 N, vec3 p, vec2 uv)
{
    vec3 dp1 = dFdx(p),  dp2 = dFdy(p);
    vec2 du1 = dFdx(uv), du2 = dFdy(uv);
    vec3 dp2perp = cross(dp2, N);
    vec3 dp1perp = cross(N, dp1);
    vec3 T = dp2perp * du1.x + dp1perp * du2.x;
    vec3 B = dp2perp * du1.y + dp1perp * du2.y;
    float inv = inversesqrt(max(max(dot(T, T), dot(B, B)), 1e-12));
    return mat3(T * inv, B * inv, N);
}

vec3 perturbNormal(sampler2DArray tex, int layers, vec2 uv, vec3 n, vec3 wpos, float strength)
{
    if (layers < 3) return n;
    vec3 m = texture(tex, vec3(uv, 2.0)).rgb * 2.0 - 1.0;
    // A degenerate tap (an all-black texel from a failed decode) would
    // normalize to garbage and pit the whole surface.
    if (dot(m, m) < 1e-4) return n;
    m.xy *= strength;
    return normalize(cotangentFrame(n, wpos, uv) * normalize(m));
}

void main()
{
    if (vBg > 0.5)
    {
        fragColor = vec4(renderSky(normalize(vPos)), 1.0);
        return;
    }

    float hue = (hueP > 0.01 ? hueP : 0.0);
    float ap  = (alarmP > 0.01 ? alarmP : 1.0);

    vec4 base = texture(texMeshMaterial, vec3(vUV, 0.0));
    if (base.a < 0.1) discard;
    float roughness = 0.55, metallic = 0.4;
    if (texMeshMaterialLayers >= 2)
    {
        vec4 mr = texture(texMeshMaterial, vec3(vUV, 1.0));
        roughness = mr.g;
        metallic  = mr.b;
    }

    vec3 n = normalize(vNormal);
    // Relief from the material's normal map, where the asset has one.
    n = perturbNormal(texMeshMaterial, texMeshMaterialLayers, vUV, n, vPos, 1.0);
    vec3 viewDir = normalize(-vPos);

    // Harsh, hard-edged key light -- a searchlight raking across armor
    // plating, not a soft ambient star.
    vec3 lightDir = normalize(vec3(0.55, 0.35, -0.55));
    float diff = pow(max(dot(n, lightDir), 0.0), 1.4);
    float fill = 0.35 + 0.35 * dot(n, vec3(0.0, 1.0, 0.0));

    vec3 halfV = normalize(lightDir + viewDir);
    float spec = pow(max(dot(n, halfV), 0.0), mix(40.0, 8.0, roughness));
    vec3 specColor = mix(vec3(1.0, 0.9, 0.85), base.rgb, metallic);

    // Dark by design (see RingStation/Spaceship's own notes on this) --
    // enough ambient floor to actually see the armor plating, but dimmer
    // overall than the civilian families: this hull is meant to look grim.
    vec3 col = base.rgb * (0.35 + diff * (1.5 + 0.5 * audioSwell) + fill * 0.25);
    col += specColor * spec * (0.55 + 0.7 * (1.0 - roughness));

    // Alarm strobe: the hull's own brightest baked markings (hazard
    // stripes, running lights) pulse red on the beat instead of glowing
    // steadily -- a fortress under readiness, not asleep.
    float luma = dot(base.rgb, vec3(0.299, 0.587, 0.114));
    float markingMask = smoothstep(0.22, 0.5, luma);
    float pulse = 0.5 + 0.5 * sin(time * 6.0 + audioAdvance * 2.0);
    float strobe = markingMask * (pulse * 0.4 + audioKick * 0.8) * ap;
    col += vec3(1.0, 0.12, 0.08) * strobe;

    if (hue > 0.001) col = hueRot(col, 0.15 * sin(hue));

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
