#version 330 core
out vec4 fragColor;
/**
 * @file ApollonianSpherePackingGasket.frag
 * @brief APOLLONIAN SPHERE PACKING GASKET: Raymarched infinite 3D Apollonian sphere
 * packing gasket formed by recursive sphere inversions. Mutually tangent
 * "kissing" spheres create an infinite fractal foam with jewel refractions,
 * specular mirror reflections, and audio-reactive metric scaling.
 *   audioAdvance -> navigates camera through the Apollonian sphere foam
 *   audioKick    -> flashes sphere facet contact points and jewel glints
 *   audioBass    -> pulses recursive sphere inversion radius & metric scale
 *   audioChromaHue-> shifts jewel dispersion reflection colors
 *
 * Per-activation variety:
 *   gasketP  float Apollonian sphere packing density      (0.5..2.2)
 *   fractalP float sphere inversion recursion scale       (0.5..2.0)
 *   speedP   float camera navigation velocity             (0.5..2.0)
 *   hueP     float jewel reflection hue offset            (0..6.28)
 */

uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float audioPhase;
uniform float audioAdvance;
uniform float audioSwell;
uniform float audioLevel;
uniform float audioKick;
uniform float audioCentroid;
uniform float audioValence;
uniform float audioSubBass;
uniform float audioBass;
uniform float audioMid;
uniform float audioHigh;
uniform float audioFlux;
uniform float audioChromaHue;

uniform float gasketP;
uniform float fractalP;
uniform float speedP;
uniform float hueP;

vec3 img(vec2 uv) {
    return (interpolation * texture(tex0, uv) + (1.0 - interpolation) * texture(tex1, uv)).rgb;
}


// IMG-PALETTE (house standard): colours come from a rotating arc in the
// CURRENT slideshow image, so every activation inherits a fresh palette from
// the photos; the arc follows the musical key (audioChromaHue is circular-
// slewed = jump-free) with a slow advance drift, valence shapes saturation.
vec3 imgPalette(float t)
{
    float ang = audioChromaHue + audioAdvance * 0.04 + t * 6.2831853;
    float rad = 0.16 + 0.08 * sin(audioAdvance * 0.013);
    vec3  pc  = img(clamp(vec2(0.5) + rad * vec2(cos(ang), sin(ang)), 0.0, 1.0));
    float pg  = dot(pc, vec3(0.333));
    return mix(vec3(pg), pc, 0.55 + 0.45 * audioValence);
}

vec3 hueRot(vec3 c, float a) {
    vec3 k = vec3(0.57735026919);
    float cs = cos(a), sn = sin(a);
    return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
}

mat2 rot2D(float a) {
    float c = cos(a), s = sin(a);
    return mat2(c, -s, s, c);
}

// 3D Apollonian sphere packing distance estimator
// Soft-max, used to carve a smooth clearance bubble around the camera out
// of the distance field: the flight can never clip through geometry -- a
// would-be collision becomes a soft bulge sliding past the lens.
float smax(float a, float b, float k) {
    float h = clamp(0.5 - 0.5 * (a - b) / k, 0.0, 1.0);
    return mix(a, b, h) + k * h * (1.0 - h);
}

float apollonianSDF(vec3 p, float gsk, float frc, out float trap) {
    float scale = 1.0;
    trap = 1e5;

    for (int i = 0; i < 7; ++i) {
        p = -1.0 + 2.0 * fract(0.5 * p + 0.5);

        float r2 = dot(p, p);
        trap = min(trap, r2);

        // Sphere inversion: r2_min / r2
        float k = max((1.2 * frc) / r2, 1.0);
        p *= k;
        scale *= k;
    }

    // Sphere-foam cut: the tangent-sphere reading needs the classic
    // plane cut |p.y|/scale; the old cylinder cut length(p.xy) rendered as
    // tube spaghetti that averaged into featureless gravel on screen.
    return 0.25 * abs(p.y) / scale;
}

void main() {
    float gsk = (gasketP  > 0.0) ? gasketP  : 1.0;
    float frc = (fractalP > 0.0) ? fractalP : 1.0;
    float spd = (speedP   > 0.0) ? speedP   : 1.0;
    float hue = (hueP     > 0.0) ? hueP     : 0.0;

    vec2 uv = (gl_FragCoord.xy - 0.5 * resolution) / resolution.y;
    vec2 st = gl_FragCoord.xy / resolution;

    float t = time * 0.22 * spd + audioAdvance * 0.12;

    // Glide along a corridor of the foam, far enough out that whole spheres
    // stay readable (the old path sat deep inside the fold, where every ray
    // hit within a step or two and the picture collapsed into noise).
    vec3 ro = vec3(0.25 * sin(t * 0.5), 0.62 + 0.10 * sin(t * 0.33), t * 0.55);
    vec3 rd = normalize(vec3(uv, 1.35));   // was 1.35 - 0.20*audioKick: FOV jumped on every kick
    rd.yz = rot2D(0.22 * sin(t * 0.27)) * rd.yz;
    rd.xz = rot2D(t * 0.15) * rd.xz;

    // (The old discrete "walk free" loop teleported the camera in 0.3-unit
    // jumps whenever the corridor closed -- replaced by the smax clearance
    // bubble in the march below, which is continuous by construction.)
    float dO = 0.0;
    float hitDist = -1.0;
    float trapMin = 1e5;
    int   steps = 0;
    vec3 hitP = vec3(0.0);   // guarded by hitDist, but the compiler cannot see that

    for (int i = 0; i < 90; ++i) {
        vec3 p = ro + rd * dO;
        float curTrap;
        float dS = apollonianSDF(p * gsk, gsk, frc, curTrap);
        dS = smax(dS, 0.38 - length(p - ro), 0.12);   // camera clearance bubble
        trapMin = min(trapMin, curTrap);
        steps = i;

        if (dS < 0.0008 + 0.0012 * dO) {
            hitDist = dO;
            hitP = p;
            break;
        }
        if (dO > 9.0) break;
        dO += dS * 0.85;
    }

    vec3 deep = imgPalette(0.62) * 0.06 + vec3(0.01, 0.012, 0.03);
    vec3 col = deep;

    if (hitDist > 0.0) {
        vec2 e = vec2(0.0015, 0.0);
        float tU;
        vec3 n = normalize(vec3(
            apollonianSDF((hitP + e.xyy) * gsk, gsk, frc, tU) - apollonianSDF((hitP - e.xyy) * gsk, gsk, frc, tU),
            apollonianSDF((hitP + e.yxy) * gsk, gsk, frc, tU) - apollonianSDF((hitP - e.yxy) * gsk, gsk, frc, tU),
            apollonianSDF((hitP + e.yyx) * gsk, gsk, frc, tU) - apollonianSDF((hitP - e.yyx) * gsk, gsk, frc, tU)
        ));

        vec3 lightDir = normalize(vec3(0.4, 0.85, -0.45));
        float diff = max(dot(n, lightDir), 0.0);
        float spec = pow(max(dot(reflect(-lightDir, n), -rd), 0.0), 48.0);

        // Jewel colour from the ORBIT TRAP (constant per sphere, so each
        // sphere reads as one gem) -- no per-pixel photo hash, which is what
        // shredded the old picture into salt-and-pepper.
        vec3 jewel = imgPalette(fract(trapMin * 3.1 + 0.13 * audioPhase * 0.159));

        // Iteration-count occlusion: crevices between kissing spheres darken.
        float ao = clamp(1.0 - float(steps) * 0.011, 0.25, 1.0);
        float rim = pow(1.0 - max(dot(n, -rd), 0.0), 3.0);

        col = jewel * (0.38 + 1.25 * diff) * ao;
        col += spec * vec3(1.0, 0.96, 0.88) * (0.8 + 1.6 * audioKick);
        col += jewel * rim * 0.55;

        col = mix(col, deep, 1.0 - exp(-hitDist * 0.30));
    }

    if (audioChromaHue != 0.0)     if (hue > 0.001) col = hueRot(col, hue);

    fragColor = vec4(col, 1.0);
}
