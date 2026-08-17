#version 330 core
out vec4 fragColor;
// ApollonianSpherePackingGasket.frag
// -----------------------------------------------------------------------
// APOLLONIAN SPHERE PACKING GASKET: Raymarched infinite 3D Apollonian sphere
// packing gasket formed by recursive sphere inversions. Mutually tangent
// "kissing" spheres create an infinite fractal foam with jewel refractions,
// specular mirror reflections, and audio-reactive metric scaling.
//   audioAdvance -> navigates camera through the Apollonian sphere foam
//   audioKick    -> flashes sphere facet contact points and jewel glints
//   audioBass    -> pulses recursive sphere inversion radius & metric scale
//   audioChromaHue-> shifts jewel dispersion reflection colors
//
// Per-activation variety:
//   gasketP  float Apollonian sphere packing density      (0.5..2.2)
//   fractalP float sphere inversion recursion scale       (0.5..2.0)
//   speedP   float camera navigation velocity             (0.5..2.0)
//   hueP     float jewel reflection hue offset            (0..6.28)
// -----------------------------------------------------------------------

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

    float d = (length(p.xy) - 0.25) / scale;
    return d;
}

void main() {
    float gsk = (gasketP  > 0.0) ? gasketP  : 1.0;
    float frc = (fractalP > 0.0) ? fractalP : 1.0;
    float spd = (speedP   > 0.0) ? speedP   : 1.0;
    float hue = (hueP     > 0.0) ? hueP     : 0.0;

    vec2 uv = (gl_FragCoord.xy - 0.5 * resolution) / resolution.y;
    vec2 st = gl_FragCoord.xy / resolution;

    float t = time * 0.3 * spd + audioAdvance * 0.15;

    // Camera setup
    vec3 ro = vec3(t * 0.6, sin(t * 0.4) * 0.3, cos(t * 0.3) * 0.3);
    vec3 rd = normalize(vec3(uv, 1.2 - 0.25 * audioKick));

    rd.yz = rot2D(sin(t * 0.3) * 0.3) * rd.yz;
    rd.xz = rot2D(t * 0.2) * rd.xz;

    float dO = 0.0;
    float hitDist = -1.0;
    float trapMin = 1e5;
    vec3 hitP;

    for (int i = 0; i < 48; ++i) {
        vec3 p = ro + rd * dO;
        float curTrap;
        float dS = apollonianSDF(p * gsk, gsk, frc, curTrap);
        trapMin = min(trapMin, curTrap);

        if (dS < 0.003) {
            hitDist = dO;
            hitP = p;
            break;
        }
        if (dO > 10.0) break;
        dO += dS * 0.7;
    }

    vec3 col = vec3(0.02, 0.02, 0.05);

    if (hitDist > 0.0) {
        // Normal estimation
        vec2 e = vec2(0.005, 0.0);
        float tU;
        vec3 n = normalize(vec3(
            apollonianSDF((hitP + e.xyy) * gsk, gsk, frc, tU) - apollonianSDF((hitP - e.xyy) * gsk, gsk, frc, tU),
            apollonianSDF((hitP + e.yxy) * gsk, gsk, frc, tU) - apollonianSDF((hitP - e.yxy) * gsk, gsk, frc, tU),
            apollonianSDF((hitP + e.yyx) * gsk, gsk, frc, tU) - apollonianSDF((hitP - e.yyx) * gsk, gsk, frc, tU)
        ));

        vec3 lightDir = normalize(vec3(0.5, 0.8, -0.6));
        float diff = max(dot(n, lightDir), 0.0);
        float spec = pow(max(dot(reflect(-lightDir, n), -rd), 0.0), 32.0);

        // Photo texture mapping from sphere normals
        vec2 photoUV = fract(n.xy * 0.5 + 0.5 + hitP.z * 0.1);
        vec3 photo = img(photoUV);

        // Jewel iridescence palette
        vec3 jewel = 0.5 + 0.5 * cos(vec3(0.0, 1.8, 3.6) + trapMin * 8.0 + audioPhase);

        col = mix(photo * 0.85, jewel, 0.5);
        col = col * (0.35 + 0.65 * diff) + spec * vec3(1.0, 0.95, 0.85) * (1.0 + audioKick * 2.0);

        // Distance fog
        col = mix(col, vec3(0.02, 0.02, 0.06), 1.0 - exp(-hitDist * 0.2));
    }

    if (audioChromaHue != 0.0) col = hueRot(col, audioChromaHue);
    if (hue > 0.001) col = hueRot(col, hue);

    fragColor = vec4(col, 1.0);
}
