#version 330 core
out vec4 fragColor;
/**
 * @file MeshRocketLaunch.frag
 * @brief MESH ROCKET LAUNCH: a real launch pad (model=) and a real rocket
 * (model2=) at night, seen from the causeway. The floodlights come up with
 * the build-up; the engines light just before the liftoff mark and the
 * rocket climbs out of the frame on the scene's own clock, its flame
 * lighting the pad, the exhaust cloud rolling out across the ground behind
 * it, the sky glowing round the plume. The counterpart of the procedural
 * BuildUpRocketLaunch, built to answer one question: does a generated mesh
 * read better than a stylised 2D object?
 *
 * Lighting: moon (cool key), two warm floodlights on the ground, and the
 * engine flame as a point light that rises with the rocket. Every hull is
 * exposed against its own material average (materialExposure).
 *
 * Audio Reactivity:
 *   audioBuildUp  -> floodlights come up (slow)
 *   audioBass     -> engine glow and the flame light (light)
 *   audioKick     -> flame flare (light)
 *   audioSwell    -> sky-glow strength (slow)
 *   sceneProgress -> ignition and the climb (vertex stage, the clock)
 *
 * Per-instance: sizeP, platP, offP, depthP (placing the rocket on THIS pad).
 * Per-activation variety: liftP (when the liftoff falls), hueP.
 */

uniform sampler2DArray texMeshMaterial;     // the pad
uniform int   texMeshMaterialLayers;
uniform sampler2DArray texMeshMaterial2;    // the rocket
uniform int   texMeshMaterialLayers2;

uniform float time;
uniform float audioBuildUp;
uniform float audioBass;
uniform float audioKick;
uniform float audioSwell;

uniform float hueP;

in vec2  vUV;
in vec3  vNormal;
in vec3  vPos;
in vec3  vLocal;
in float vBg;
in float vRocket;
in vec4  vFlame;
in float vClimb;

const float kDist   = 84.0;
const float kGround = -16.0;

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
// Octaves rotated against each other: axis-aligned octaves sum to square
// cloud edges at low base frequencies.
float fbm2(vec2 p) {
    float v = 0.0, a = 0.5;
    const mat2 R = mat2(0.80, 0.60, -0.60, 0.80);
    for (int i = 0; i < 5; i++) { v += a * noise2(p); p = R * p * 2.03 + 7.1; a *= 0.5; }
    return v;
}

// Round, jittered stars on the sphere of directions.
vec3 stars(vec3 v)
{
    vec2 sph = vec2(atan(v.z, v.x) / 6.2831853 + 0.5, acos(clamp(v.y, -1.0, 1.0)) / 3.14159);
    vec2 g = sph * vec2(180.0, 90.0);
    vec2 id = floor(g);
    vec2 f = fract(g) - 0.5;
    float h = hash21(id);
    vec2 jit = vec2(hash21(id + 1.3), hash21(id + 7.9)) - 0.5;
    float d = length(f - jit * 0.8);
    float bright = step(0.92, h) * pow(1.0 - clamp(d * 3.2, 0.0, 1.0), 4.0);
    float big    = step(0.988, h) * pow(1.0 - clamp(d * 1.8, 0.0, 1.0), 3.0);
    vec3 tint = mix(vec3(0.75, 0.82, 1.0), vec3(1.0, 0.9, 0.75), hash21(id + 3.1));
    return tint * (bright * 0.7 + big * 1.4);
}

float materialExposure(sampler2DArray tex)
{
    vec3 avg = textureLod(tex, vec3(0.5, 0.5, 0.0), 20.0).rgb;
    float l = dot(avg, vec3(0.299, 0.587, 0.114));
    return clamp(0.28 / max(l, 0.02), 0.60, 1.8);
}

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
    if (dot(m, m) < 1e-4) return n;
    m.xy *= strength;
    return normalize(cotangentFrame(n, wpos, uv) * normalize(m));
}

// A point light with a soft range.
vec3 lightAt(vec3 P, vec3 n, vec3 lp, vec3 lc, float range)
{
    vec3 d = lp - P;
    float dist = length(d);
    d /= max(dist, 1e-3);
    float att = 1.0 / (1.0 + (dist * dist) / (range * range));
    return lc * max(dot(n, d), 0.0) * att;
}

const vec3 kFloodA = vec3(-34.0, kGround + 2.0, kDist - 30.0);
const vec3 kFloodB = vec3( 36.0, kGround + 2.0, kDist - 26.0);

vec3 renderSky(vec3 dir)
{
    float build = clamp(audioBuildUp, 0.0, 1.0);
    float bass  = clamp(audioBass, 0.0, 1.0);
    float swell = clamp(audioSwell, 0.0, 1.0);
    vec3  flame = vFlame.xyz;
    float burn  = vFlame.w;
    vec3 col;
    if (dir.y < -0.004)
    {
        // The ground: a dark flat, the floodlight pools, and the exhaust
        // cloud rolling out from the pad once the engines are lit.
        float t = kGround / dir.y;
        vec3 P = dir * t;
        float haze = exp(-t * 0.0045);
        float g = fbm2(P.xz * 0.03);
        col = vec3(0.035, 0.04, 0.05) * (0.6 + 0.8 * g);
        float poolA = exp(-length(P.xz - kFloodA.xz) * 0.05);
        float poolB = exp(-length(P.xz - kFloodB.xz) * 0.05);
        col += vec3(0.5, 0.45, 0.35) * (poolA + poolB) * (0.25 + 0.75 * build) * (0.7 + 0.6 * g);

        float r = 9.0 + 48.0 * vClimb;
        float dc = length(P.xz - flame.xz);
        float cloud = fbm2(P.xz * 0.06 + vec2(time * 0.05, -time * 0.02));
        float mask = smoothstep(r, r * 0.25, dc) * burn;
        float dens = clamp(cloud * 1.8 - 0.35, 0.0, 1.0) * mask;
        vec3 lowCol  = vec3(1.0, 0.62, 0.30) * (1.2 + 0.8 * bass);
        vec3 highCol = vec3(0.85, 0.85, 0.9) * (0.35 + 0.65 * build);
        vec3 cloudCol = mix(lowCol, highCol, smoothstep(0.0, 0.45, vClimb));
        col = mix(col, cloudCol, dens);
        col = mix(vec3(0.03, 0.03, 0.05), col, haze);
    }
    else
    {
        // Night sky: gradient, stars, a distant town glow at the horizon,
        // and the plume's own glow around the flame while it burns.
        float h = clamp(dir.y, 0.0, 1.0);
        col = mix(vec3(0.05, 0.05, 0.10), vec3(0.008, 0.008, 0.03), pow(h, 0.5));
        col += vec3(0.9, 0.5, 0.25) * exp(-h * 22.0) * 0.10;
        col += stars(dir) * (0.6 + 0.4 * smoothstep(0.05, 0.4, h));
        vec3 fd = normalize(flame);
        float a = 1.0 - dot(dir, fd);
        col += vec3(1.0, 0.55, 0.25) * exp(-a * 55.0) * burn * (0.6 + 0.5 * bass) * (0.7 + 0.5 * swell);
        col += vec3(1.0, 0.7, 0.4) * exp(-a * 9.0) * burn * 0.08;
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
    float build = clamp(audioBuildUp, 0.0, 1.0);
    float bass  = clamp(audioBass, 0.0, 1.0);
    float kick  = clamp(audioKick, 0.0, 1.0);
    bool rocket = vRocket > 0.5;

    // Each hull reads its OWN material array.
    vec4 base;
    float roughness = 0.6, metallic = 0.1;
    vec3 n = normalize(vNormal);
    float expose;
    if (rocket)
    {
        base = texture(texMeshMaterial2, vec3(vUV, 0.0));
        if (texMeshMaterialLayers2 >= 2)
        {
            vec4 mr = texture(texMeshMaterial2, vec3(vUV, 1.0));
            roughness = mr.g; metallic = mr.b;
        }
        n = perturbNormal(texMeshMaterial2, texMeshMaterialLayers2, vUV, n, vPos, 1.0);
        expose = materialExposure(texMeshMaterial2);
    }
    else
    {
        base = texture(texMeshMaterial, vec3(vUV, 0.0));
        if (texMeshMaterialLayers >= 2)
        {
            vec4 mr = texture(texMeshMaterial, vec3(vUV, 1.0));
            roughness = mr.g; metallic = mr.b;
        }
        n = perturbNormal(texMeshMaterial, texMeshMaterialLayers, vUV, n, vPos, 1.0);
        expose = materialExposure(texMeshMaterial);
    }
    if (base.a < 0.1) discard;

    vec3 viewDir = normalize(-vPos);
    vec3 alb = base.rgb * expose;

    // Moon: a cool key from behind the camera's left shoulder.
    vec3 moonDir = normalize(vec3(-0.4, 0.7, -0.55));
    vec3 col = alb * vec3(0.55, 0.65, 0.9) * (0.10 + 0.25 * max(dot(n, moonDir), 0.0));
    // Sky ambient.
    col += alb * vec3(0.10, 0.11, 0.15) * (0.5 + 0.5 * n.y);

    // Floodlights: on the ground in front of the pad, coming up with the build-up.
    vec3 floodCol = vec3(1.0, 0.9, 0.7) * (0.9 + 2.6 * build);
    vec3 flood = lightAt(vPos, n, kFloodA, floodCol, 48.0) + lightAt(vPos, n, kFloodB, floodCol, 48.0);
    col += alb * flood;

    // The engines as a point light that rises with the rocket.
    float burn = vFlame.w;
    vec3 flamePos = vFlame.xyz - vec3(0.0, 2.0, 0.0);
    vec3 flameCol = vec3(1.0, 0.6, 0.28) * burn * (4.0 + 3.0 * bass + 1.5 * kick);
    col += alb * lightAt(vPos, n, flamePos, flameCol, 45.0);

    // Specular from the floods (a wet concrete sheen, a painted hull).
    vec3 hA = normalize(normalize(kFloodA - vPos) + viewDir);
    float spec = pow(max(dot(n, hA), 0.0), mix(60.0, 6.0, roughness));
    vec3 specColor = mix(vec3(1.0), base.rgb, metallic);
    col += specColor * spec * (0.15 + 0.35 * build) * (0.5 + 0.6 * (1.0 - roughness));

    if (rocket)
    {
        // The engine bells at the bottom of the hull glow once lit; the
        // flicker is light only.
        float bells = smoothstep(-0.72, -0.90, vLocal.y);
        float flick = 0.85 + 0.15 * sin(time * 41.0) * sin(time * 27.0);
        col += vec3(1.0, 0.55, 0.2) * bells * burn * (1.6 + 1.6 * bass) * flick;
        col += vec3(1.0, 0.9, 0.75) * smoothstep(-0.90, -1.0, vLocal.y) * burn * 1.5;
    }
    // (No "brightest texels as lamps" on the pad: on a concrete platform the
    // brightest texels are the concrete's own highlights, and lighting them
    // red drew lava cracks all over the base in the first render.)

    if (hue > 0.001) col = hueRot(col, 0.15 * sin(hue));

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
