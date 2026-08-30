#version 330 core
out vec4 fragColor;
/**
 * @file AbyssalLuminescence.frag
 * @brief ABYSSAL LUMINESCENCE: Deep ocean bioluminescent ecosystem with undulating
 * siphonophores, translucent glowing tentacles, underwater volumetric caustic
 * sunbeams, deep thermal marine snow, and organic fluid currents.
 *   audioBass    -> pulses organism bell contraction & tentacle wave velocity
 *   audioHigh    -> sparks bioluminescent marine snow & plankton flashes
 *   audioSwell   -> thickens volumetric oceanic mist & caustic ray depth
 *   audioKick    -> ignites bright chromatic bioluminescent discharge
 *
 * Per-activation variety:
 *   depthP     float ocean abyss fog density           (0.6..1.8)
 *   tentacleP  float tentacle curl complexity          (0.5..2.0)
 *   glowP      float bioluminescent emission intensity (0.5..2.0)
 *   hueP       float marine color grading offset       (0..6.28)
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

uniform float depthP;
uniform float tentacleP;
uniform float glowP;
uniform float hueP;
uniform float audioChromaHue;

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

float hash21(vec2 p) {
    p = fract(p * vec2(234.34, 435.345));
    p += dot(p, p + 34.23);
    return fract(p.x * p.y);
}

// 2D simplex-style smooth noise
float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x),
               mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), f.x), f.y);
}

float fbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    mat2 rot = mat2(0.8, 0.6, -0.6, 0.8);
    for (int i = 0; i < 4; i++) {
        v += a * noise(p);
        p = rot * p * 2.05 + vec2(1.2, 3.4);
        a *= 0.5;
    }
    return v;
}

void main() {
    float dpth = (depthP    > 0.0) ? depthP    : 1.0;
    float tent = (tentacleP > 0.0) ? tentacleP : 1.0;
    float glw  = (glowP     > 0.0) ? glowP     : 1.0;
    float hue  = (hueP      > 0.0) ? hueP      : 0.0;

    vec2 uv = (gl_FragCoord.xy - 0.5 * resolution) / resolution.y;
    vec2 st = gl_FragCoord.xy / resolution;

    float t = time * 0.3 + audioAdvance * 0.12;

    // Deep oceanic background color gradient
    vec3 col = mix(vec3(0.005, 0.02, 0.06), vec3(0.0, 0.08, 0.16), uv.y + 0.5);

    // Volumetric underwater caustic light shafts piercing the deep
    vec2 causticUV = uv * 3.5 + vec2(0.0, t * 0.2);
    float caustics1 = fbm(causticUV * 1.5 + vec2(sin(t * 0.4), cos(t * 0.3)));
    float caustics2 = fbm(causticUV * 2.5 - vec2(cos(t * 0.5), sin(t * 0.4)));
    float causticBeams = pow(caustics1 * caustics2, 1.4) * (0.8 + audioSwell * 0.6);
    col += vec3(0.05, 0.4, 0.7) * causticBeams * smoothstep(-0.6, 0.8, uv.y + 0.4);

    // Multi-arm bioluminescent siphonophore tentacles
    int arms = 8;
    vec3 tentacleCol = vec3(0.0);

    for (int i = 0; i < arms; i++) {
        float armAngle = float(i) * (6.2831853 / float(arms));
        float armPhase = t * 0.8 + float(i) * 0.785;
        
        // Organic sinusoidal curving coordinate
        vec2 p = uv;
        
        // Bell anchor point floating gently in water
        vec2 bellCenter = vec2(sin(t * 0.5 + float(i)) * 0.25, cos(t * 0.4 + float(i) * 0.5) * 0.15);
        p -= bellCenter;

        // Polar coordinates
        float r = length(p);
        float a = atan(p.y, p.x);

        // Sinusoidal wave ripple along tentacle.  audioPhase (integrated) keeps
        // the ripple musical without the per-frame shape jitter a raw level
        // term produced -- the ribbons used to twitch with every bass frame.
        float wave = sin(r * 12.0 * tent - armPhase * 1.2 - audioPhase * 0.7);
        float dAngle = mod(a - armAngle + 3.14159, 6.2831853) - 3.14159;

        // Distance to curved tentacle ribbon
        float tentDist = abs(dAngle * r - wave * 0.04 * (1.0 + r * 1.5));

        // Bioluminescent glowing filament.  Exponential profile: the old
        // Lorentzian tails of eight arms summed to solid white BETWEEN the
        // arms; exp() dies off before the neighbours meet.
        float glow = 1.1 * exp(-tentDist * 70.0)
                   + 0.0006 / (tentDist * tentDist + 0.0003);
        // All eight arms converge at the bell centre; hollow the core out or
        // their sum turns the middle of the frame into a solid white blob.
        glow *= smoothstep(0.03, 0.18, r);
        
        // Color variation along tentacle length: cyan to magenta/electric blue
        vec3 armC = imgPalette((r * 6.0 + armPhase) * 0.159) * 1.4;
        armC = mix(armC, imgPalette(0.5 + 0.1 * float(i)) * 1.3, sin(float(i) + t) * 0.35 + 0.35);

        // Bell nodes & pulsating photophores along the filament
        float nodes = pow(sin(r * 24.0 - armPhase * 3.0) * 0.5 + 0.5, 8.0);
        glow += nodes * (0.005 / (tentDist + 0.0015))
              * (1.0 + audioKick * 0.8) * smoothstep(0.03, 0.18, r);

        tentacleCol += armC * glow * exp(-r * (1.2 * dpth));
    }

    // Soft-compress the summed arms: crossings stay luminous, never clipped.
    tentacleCol = tentacleCol / (1.0 + 0.6 * tentacleCol);
    col += tentacleCol * glw * 0.8;

    // Organic photo integration: subtle undulating jellyfish bell overlay
    float bellR = length(uv - vec2(0.0, 0.1 + 0.05 * sin(t * 1.5)));
    if (bellR < 0.7) {
        vec2 distUV = st + vec2(sin(uv.y * 10.0 + t), cos(uv.x * 10.0 + t)) * 0.02 * (1.0 + audioBass);
        vec3 bellImg = img(clamp(distUV, 0.0, 1.0));
        float bellMask = smoothstep(0.7, 0.2, bellR) * (0.12 + 0.18 * audioLevel);
        col += bellImg * bellMask * vec3(0.4, 0.9, 1.0);
    }

    // Marine snow & sparkling bioluminescent dinoflagellates
    vec2 snowUV = st * vec2(40.0, 25.0) + vec2(t * 0.5, -t * 1.2);
    vec2 snowId = floor(snowUV);
    float snowRand = hash21(snowId);
    if (snowRand > 0.92) {
        vec2 snowPos = fract(snowUV) - 0.5;
        float snowDist = length(snowPos);
        float snowGlow = smoothstep(0.18, 0.0, snowDist);
        float snowBlink = pow(sin(snowRand * 100.0 + t * 4.0) * 0.5 + 0.5, 6.0);
        
        vec3 snowCol = (snowRand > 0.97) ? vec3(0.2, 1.0, 0.6) : vec3(0.3, 0.8, 1.0);
        col += snowCol * snowGlow * snowBlink * (1.0 + audioHigh * 2.5);
    }

    // Audio-reactive bioluminescent discharge on heavy kicks
    if (audioKick > 0.6) {
        col += vec3(0.1, 0.7, 1.0) * audioKick * 0.5 * exp(-length(uv) * 2.0);
    }

    if (hue > 0.001) col = hueRot(col, hue);

    // Underwater vignette & deep ocean abyss falloff
    vec2 vUV = st * (1.0 - st.yx);
    float vig = vUV.x * vUV.y * 15.0;
    col *= clamp(pow(vig, 0.3), 0.0, 1.0);

    fragColor = vec4(col, 1.0);
}
