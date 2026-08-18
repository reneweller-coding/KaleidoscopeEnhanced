#version 330 core
out vec4 fragColor;
// FluidInkMarble.frag
// -----------------------------------------------------------------------
// FLUID INK MARBLE: 100% Full-screen liquid hydrodynamics & reaction-diffusion
// surface. Loaded photos act as vibrant floating inks in turbulent vorticity
// and Curl-Noise fluid streams.
//   audioKick    -> radial liquid splash & shockwaves
//   audioFlux    -> turbulent swirl generation & fluid vorticity
//   audioValence -> color temperature & palette shifting
//   audioSwell   -> fluid expansion & flow velocity
//
// Per-activation variety (0 = default):
//   viscosityP float liquid viscosity multiplier (0 -> 1.0; 0.5..1.8)
//   swirlP     float vorticity swirl intensity   (0 -> 1.0; 0.6..2.0)
//   flowP      float fluid flow speed multiplier (0 -> 1.0; 0.4..1.6)
//   hueP       float global hue rotation         (0 -> none; 0..6.28)
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

uniform float viscosityP;
uniform float swirlP;
uniform float flowP;
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
    p = fract(p * vec2(234.34, 435.14));
    p += dot(p, p + 54.23);
    return fract(p.x * p.y);
}

float noise2D(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = hash21(i);
    float b = hash21(i + vec2(1.0, 0.0));
    float c = hash21(i + vec2(0.0, 1.0));
    float d = hash21(i + vec2(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

// Compute 2D Curl Noise for divergence-free incompressible fluid simulation
vec2 curlNoise(vec2 p) {
    float eps = 0.005;
    float n1 = noise2D(p + vec2(0.0, eps));
    float n2 = noise2D(p - vec2(0.0, eps));
    float n3 = noise2D(p + vec2(eps, 0.0));
    float n4 = noise2D(p - vec2(eps, 0.0));

    float dx = (n1 - n2) / (2.0 * eps);
    float dy = (n3 - n4) / (2.0 * eps);

    return vec2(dy, -dx);
}

void main() {
    float visc = (viscosityP > 0.0) ? viscosityP : 1.0;
    float swrl = (swirlP     > 0.0) ? swirlP     : 1.0;
    float flw  = (flowP      > 0.0) ? flowP      : 1.0;

    vec2 st = gl_FragCoord.xy / resolution;
    vec2 p = (gl_FragCoord.xy - 0.5 * resolution) / resolution.y;

    // Multiscale fluid displacement
    vec2 v = vec2(0.0);
    float scale = 2.5;
    float weight = 0.5;

    float flowTime = time * 0.3 * flw + audioAdvance * 0.2;

    for (int i = 0; i < 4; i++) {
        vec2 curl = curlNoise(p * scale + vec2(flowTime, -flowTime * 0.5));
        v += curl * weight;
        scale *= 2.1;
        weight *= 0.5 * visc;
    }

    // Audio-driven splash ripples from kick drum
    float r = length(p);
    float splashWave = sin(r * 18.0 - time * 6.0) * exp(-r * 2.5) * audioKick * 0.15;
    vec2 splashDisp = normalize(p + 1e-5) * splashWave;

    // Advect texture UV coordinates through fluid velocity field
    vec2 fluidUV = st + (v * 0.12 * swrl + splashDisp);
    fluidUV += vec2(sin(flowTime + audioFlux), cos(flowTime * 0.8)) * 0.02;

    // Sample source ink texture
    vec3 inkCol = img(fract(fluidUV));

    // Marble sheen lighting (pseudo 3D heightfield gradient from fluid velocity)
    float height = length(v);
    vec2 grad = vec2(
        length(curlNoise(p * 5.0 + vec2(0.01, 0.0))) - height,
        length(curlNoise(p * 5.0 + vec2(0.0, 0.01))) - height
    );

    vec3 normal = normalize(vec3(-grad * 10.0, 1.0));
    vec3 lightDir = normalize(vec3(0.5, 0.8, 1.0));
    float specular = pow(max(dot(normal, lightDir), 0.0), 12.0) * 0.4 * (1.0 + audioKick);

    vec3 finalCol = inkCol + vec3(specular);

    // Color reaction based on audio valence & centroid
    vec3 shiftCol = imgPalette(0.30 * audioValence) * 1.3;
    finalCol = mix(finalCol, finalCol * shiftCol * 1.4, 0.25 * audioSwell);

    if (hueP > 0.0) {
        finalCol = hueRot(finalCol, hueP);
    }

    fragColor = vec4(finalCol, 1.0);
}
