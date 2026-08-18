#version 330 core
out vec4 fragColor;
// VolumetricSupernova.frag
// -----------------------------------------------------------------------
// VOLUMETRIC SUPERNOVA: Full-screen raymarched volumetric plasma field &
// shockwave explosion. 100% viewport coverage with 3D Curl Noise, light
// absorption, and audio-driven corona flares.
//   audioSubBass -> expands radial explosion shockwave outwards to screen corners
//   audioKick    -> ignites core luminosity and chromatic flare burst
//   audioHigh    -> sparks high-frequency plasma filaments
//   audioSwell   -> thickens volumetric fog density
//
// Per-activation variety (0 = default):
//   densityP float fog density multiplier        (0 -> 1.0; 0.6..1.8)
//   speedP   float plasma swirl speed multiplier (0 -> 1.0; 0.5..1.5)
//   flareP   float chromatic flare intensity     (0 -> 1.0; 0.5..2.0)
//   hueP     float global hue rotation           (0 -> none; 0..6.28)
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

uniform float densityP;
uniform float speedP;
uniform float flareP;
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

float hash31(vec3 p) {
    p = fract(p * vec3(443.8975, 397.2973, 491.1871));
    p += dot(p, p.yzx + 19.19);
    return fract((p.x + p.y) * p.z);
}

float noise3D(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
        mix(mix(hash31(i), hash31(i + vec3(1,0,0)), f.x),
            mix(hash31(i + vec3(0,1,0)), hash31(i + vec3(1,1,0)), f.x), f.y),
        mix(mix(hash31(i + vec3(0,0,1)), hash31(i + vec3(1,0,1)), f.x),
            mix(hash31(i + vec3(0,1,1)), hash31(i + vec3(1,1,1)), f.x), f.y), f.z
    );
}

float fbm3D(vec3 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 4; i++) {
        v += a * noise3D(p);
        p = p * 2.02 + vec3(1.7, 9.2, 3.4);
        a *= 0.5;
    }
    return v;
}

void main() {
    float dens = (densityP > 0.0) ? densityP : 1.0;
    float spd  = (speedP   > 0.0) ? speedP   : 1.0;
    float flr  = (flareP   > 0.0) ? flareP   : 1.0;

    vec2 uv = (gl_FragCoord.xy - 0.5 * resolution) / resolution.y;

    // Ray setup: origin (ro) and direction (rd)
    vec3 ro = vec3(0.0, 0.0, -2.5 + audioSwell * 0.5);
    vec3 rd = normalize(vec3(uv, 1.0));

    // Camera rotation
    float t = time * 0.15 * spd + audioAdvance * 0.1;
    mat2 rotXZ = mat2(cos(t), sin(t), -sin(t), cos(t));
    ro.xz = rotXZ * ro.xz;
    rd.xz = rotXZ * rd.xz;

    // Volumetric Raymarching Loop
    vec3 accColor = vec3(0.0);
    float transmittance = 1.0;
    float stepSize = 0.12;

    float shockwaveRadius = 1.2 + audioSubBass * 1.5 + audioKick * 0.8;

    for (int i = 0; i < 28; i++) {
        float depth = 1.0 + float(i) * stepSize;
        vec3 p = ro + rd * depth;

        // Radial distance from supernova core
        float dist = length(p);

        // Calculate density with noise and shockwave front
        float shockFront = smoothstep(0.3, 0.0, abs(dist - shockwaveRadius));
        float n = fbm3D(p * 1.5 + vec3(0.0, 0.0, time * 0.4 * spd));

        float d = smoothstep(2.5, 0.2, dist) * n * dens;
        d += shockFront * 0.8 * (audioKick + audioBass);

        if (d > 0.01) {
            // Map sample point to 2D UV for source image sampling
            vec2 sampleUV = vec2(atan(p.z, p.x) / 6.283185 + 0.5, p.y * 0.3 + 0.5);
            vec3 imgCol = img(fract(sampleUV));

            // Plasma glow & temperature mapping
            vec3 glow = mix(imgCol, vec3(1.0, 0.4, 0.1), smoothstep(0.5, 0.0, dist));
            glow *= (1.0 + audioKick * 1.2 + audioHigh * 0.8);

            // Emission & Absorption
            float stepDensity = d * stepSize * 2.5;
            accColor += transmittance * glow * stepDensity;
            transmittance *= exp(-stepDensity * 1.2);

            if (transmittance < 0.02) break;
        }
    }

    // Add background texture glow
    vec3 bgCol = img(fract(uv * 0.5 + 0.5)) * 0.15 * transmittance;
    vec3 finalCol = accColor + bgCol;

    // Add chromatic lens flare at center
    float centerDist = length(uv);
    float flare = 0.15 / (centerDist + 0.08) * flr * (audioKick * 1.5 + audioLevel);
    vec3 flareCol = imgPalette(0.30 * audioCentroid) * 1.4;
    finalCol += flareCol * flare;

    if (hueP > 0.0) {
        finalCol = hueRot(finalCol, hueP);
    }

    // Catalogue review: soft-knee exposure — hot audio compresses
    // instead of clipping the whole frame to white.
    vec3 _catTone = (finalCol) * 0.45;
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(_catTone, 1.0);
}
