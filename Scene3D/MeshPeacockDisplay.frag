#version 330 core
out vec4 fragColor;
/**
 * @file MeshPeacockDisplay.frag
 * @brief MESH PEACOCK DISPLAY: a real peacock (model=) in full display on a
 * lawn at dusk, turning slowly to present the train. The structural colour
 * of the feathers is done as it works in life: the hue of the green-and-blue
 * texels shifts with the viewing angle, and the treble adds a shimmer to
 * that shift; the eyespots glow with the treble; the shafts glint on the
 * kick; the bass warms the body from below. Around it, a dusk sky with the
 * sun just down, a treeline, and fireflies over the grass. The counterpart
 * of the procedural PeacockTrainFan -- the same question as the rocket:
 * does a generated mesh beat a stylised 2D object?
 *
 * Audio Reactivity:
 *   audioSwell -> the train's quiver amplitude (vertex stage, slow), key light
 *   audioHigh  -> iridescence shimmer and the eyespots (light/colour)
 *   audioKick  -> glints on the shafts (light)
 *   audioBass  -> warm bounce on the body (light)
 *
 * Per-instance: sizeP, yawP. Per-activation variety: hueP.
 */

uniform sampler2DArray texMeshMaterial;
uniform int   texMeshMaterialLayers;

uniform float time;
uniform float audioSwell;
uniform float audioHigh;
uniform float audioKick;
uniform float audioBass;

uniform float hueP;

in vec2  vUV;
in vec3  vNormal;
in vec3  vPos;
in vec3  vLocal;
in float vTrain;
in float vBg;

const float kDist   = 54.0;
const float kGround = -21.0;

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
float fbm2(vec2 p) {
    float v = 0.0, a = 0.5;
    const mat2 R = mat2(0.80, 0.60, -0.60, 0.80);
    for (int i = 0; i < 5; i++) { v += a * noise2(p); p = R * p * 2.03 + 7.1; a *= 0.5; }
    return v;
}
float noise1(float x) {
    float i = floor(x), f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    return mix(hash11(i), hash11(i + 1.0), f);
}

vec3 stars(vec3 v)
{
    vec2 sph = vec2(atan(v.z, v.x) / 6.2831853 + 0.5, acos(clamp(v.y, -1.0, 1.0)) / 3.14159);
    vec2 g = sph * vec2(180.0, 90.0);
    vec2 id = floor(g);
    vec2 f = fract(g) - 0.5;
    float h = hash21(id);
    vec2 jit = vec2(hash21(id + 1.3), hash21(id + 7.9)) - 0.5;
    float d = length(f - jit * 0.8);
    float bright = step(0.93, h) * pow(1.0 - clamp(d * 3.2, 0.0, 1.0), 4.0);
    return vec3(0.8, 0.85, 1.0) * bright * 0.7;
}

// Gentler than the station families' 0.20 target: that one was tuned for
// near-black hulls and halves a naturally mid-toned bird (measured mean
// luma 0.37 -> 0.53 exposure, which is a good part of why the first render
// was a silhouette).
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

const vec3 kSunDir = vec3(-0.5, 0.07, 0.85);

vec3 renderSky(vec3 dir)
{
    float high  = clamp(audioHigh, 0.0, 1.0);
    float swell = clamp(audioSwell, 0.0, 1.0);
    vec3 sunDir = normalize(kSunDir);
    vec3 col;
    if (dir.y < -0.004)
    {
        // The lawn, warm on the sun's side, hazing into the dusk far off.
        float t = kGround / dir.y;
        vec3 P = dir * t;
        float haze = exp(-t * 0.006);
        float g  = fbm2(P.xz * 0.08);
        float g2 = fbm2(P.xz * 0.5);
        vec3 grass = mix(vec3(0.05, 0.11, 0.035), vec3(0.10, 0.17, 0.05), g) * (0.75 + 0.5 * g2);
        float sunSide = smoothstep(-0.2, 0.8, dot(normalize(dir.xz), normalize(sunDir.xz)));
        grass = mix(grass, grass * vec3(1.5, 1.15, 0.8), sunSide);
        col = mix(vec3(0.16, 0.10, 0.12), grass, haze);
    }
    else
    {
        // Dusk sky, the sun just down, a treeline, faint stars up high.
        float h = clamp(dir.y, 0.0, 1.0);
        col = mix(vec3(0.95, 0.45, 0.20), vec3(0.09, 0.07, 0.25), pow(h, 0.45));
        float sd = distance(dir, sunDir);
        col += vec3(1.0, 0.75, 0.45) * exp(-sd * 9.0) * (0.7 + 0.4 * swell);
        col += vec3(1.0, 0.9, 0.7) * (1.0 - smoothstep(0.035, 0.045, sd)) * 1.5;
        float az = atan(dir.x, dir.z);
        float tree = 0.045 + 0.05 * noise1(az * 3.0) + 0.02 * noise1(az * 11.0 + 3.0);
        float treeMask = 1.0 - smoothstep(tree - 0.006, tree + 0.006, dir.y);
        col = mix(col, vec3(0.02, 0.03, 0.02), treeMask);
        col += stars(dir) * smoothstep(0.15, 0.6, h);
    }

    // Fireflies over the grass: round, jittered, each on its own slow blink,
    // brighter with the treble.
    if (dir.y > -0.14 && dir.y < 0.22)
    {
        vec2 sph = vec2(atan(dir.x, dir.z) / 6.2831853 + 0.5, dir.y);
        vec2 g = sph * vec2(110.0, 70.0);
        vec2 id = floor(g);
        vec2 f = fract(g) - 0.5;
        float h = hash21(id + 9.7);
        vec2 jit = vec2(hash21(id + 2.3), hash21(id + 5.1)) - 0.5;
        float d = length(f - jit * 0.7);
        float on = step(0.90, h);
        float blink = 0.5 + 0.5 * sin(time * 1.7 + h * 40.0);
        float dot_ = pow(1.0 - clamp(d * 4.0, 0.0, 1.0), 3.0);
        col += vec3(0.8, 1.0, 0.35) * on * blink * dot_ * (0.6 + 0.9 * high);
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
    float high  = clamp(audioHigh, 0.0, 1.0);
    float kick  = clamp(audioKick, 0.0, 1.0);
    float bass  = clamp(audioBass, 0.0, 1.0);
    float swell = clamp(audioSwell, 0.0, 1.0);

    vec4 base = texture(texMeshMaterial, vec3(vUV, 0.0));
    if (base.a < 0.1) discard;
    float roughness = 0.6, metallic = 0.05;
    if (texMeshMaterialLayers >= 2)
    {
        vec4 mr = texture(texMeshMaterial, vec3(vUV, 1.0));
        roughness = mr.g; metallic = mr.b;
    }

    vec3 n = normalize(vNormal);
    n = perturbNormal(texMeshMaterial, texMeshMaterialLayers, vUV, n, vPos, 1.0);
    vec3 viewDir = normalize(-vPos);
    float expose = materialExposure(texMeshMaterial);
    vec3 alb = base.rgb * expose;

    // The sun in the sky sits BEHIND the bird (the camera looks toward it),
    // so it can only be the rim light. The key is the last warm light from
    // the west, behind the camera's left shoulder; the violet sky fills
    // from above; the bass brings up a warm bounce from the grass below.
    vec3 sunDir = normalize(kSunDir);
    vec3 keyDir = normalize(vec3(-0.55, 0.40, -0.72));
    float diff = max(dot(n, keyDir), 0.0);
    vec3 col = alb * vec3(1.0, 0.85, 0.65) * diff * (1.3 + 0.4 * swell);
    col += alb * vec3(0.35, 0.32, 0.50) * (0.55 + 0.45 * n.y);
    col += alb * 0.12;
    col += alb * vec3(1.0, 0.5, 0.25) * max(-n.y, 0.0) * (0.15 + 0.5 * bass);
    float nvRim = clamp(dot(n, viewDir), 0.0, 1.0);
    col += alb * vec3(1.0, 0.6, 0.35) * pow(1.0 - nvRim, 3.0) * max(dot(n, sunDir), 0.0) * 0.9;

    // Structural colour: green-and-blue texels shift hue with the viewing
    // angle, and the treble adds to that shift. Everything else (the brown
    // shafts, the rock, the beak) keeps its pigment.
    float mx = max(base.r, max(base.g, base.b));
    float mn = min(base.r, min(base.g, base.b));
    float sat = mx - mn;
    float gb = smoothstep(0.04, 0.22, max(base.g, base.b) - base.r) * smoothstep(0.08, 0.30, sat);
    float nv = clamp(dot(n, viewDir), 0.0, 1.0);
    float shift = (1.0 - nv) * 1.5 + 0.7 * high;
    col = mix(col, hueRot(col, shift), gb * 0.85);

    // The eyespots: the blue-dominant patches in the train glow with the treble.
    float eye = smoothstep(0.12, 0.35, base.b - base.g) * gb * (0.3 + 0.7 * vTrain);
    col += vec3(0.2, 0.5, 1.0) * eye * (0.2 + 0.9 * high);

    // Glints on the shafts: a sharp specular that the kick flares.
    vec3 halfV = normalize(keyDir + viewDir);
    float spec = pow(max(dot(n, halfV), 0.0), mix(70.0, 8.0, roughness));
    vec3 specColor = mix(vec3(1.0, 0.95, 0.85), base.rgb, metallic);
    col += specColor * spec * (0.25 + 0.6 * (1.0 - roughness)) * (0.6 + 1.6 * kick * vTrain);

    // A soft rim from the sky behind, so the fan's edge reads against the dusk.
    float fres = pow(1.0 - nv, 4.0);
    col += vec3(0.9, 0.6, 0.4) * fres * 0.25;

    if (hue > 0.001) col = hueRot(col, 0.12 * sin(hue));

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.30 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
