#version 330 core
out vec4 fragColor;
// SolarFlareCorona.frag
// -----------------------------------------------------------------------
// SOLAR FLARE CORONA: Extreme close-up of a turbulent stellar photosphere,
// incandescent plasma convection cells, magnetic coronal loops, and explosive
// coronal mass ejections erupting across the screen.
//   audioSubBass -> expands radial solar flare shockwaves
//   audioKick    -> flashes incandescent core nuclear ignition
//   audioMid     -> ripples magnetic flux loops & plasma convection
//   audioHigh    -> excites fine coronal filaments & solar sparks
//
// Per-activation variety:
//   turbulenceP  float plasma vortex turbulence multiplier (0.5..2.0)
//   heatP        float thermal color intensity             (0.6..1.8)
//   flareP       float coronal prominence reach            (0.5..2.2)
//   hueP         float stellar color grading               (0..6.28)
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

uniform float turbulenceP;
uniform float heatP;
uniform float flareP;
uniform float hueP;

vec3 img(vec2 uv) {
    return (interpolation * texture(tex0, uv) + (1.0 - interpolation) * texture(tex1, uv)).rgb;
}

vec3 hueRot(vec3 c, float a) {
    vec3 k = vec3(0.57735026919);
    float cs = cos(a), sn = sin(a);
    return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
}

float hash21(vec2 p) {
    p = fract(p * vec2(456.23, 789.12));
    p += dot(p, p + 56.78);
    return fract(p.x * p.y);
}

float noise2D(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x),
               mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), f.x), f.y);
}

// 2D curl noise for realistic turbulent magnetic plasma advection
vec2 curlNoise(vec2 p) {
    const float eps = 0.05;
    float n1 = noise2D(p + vec2(0.0, eps));
    float n2 = noise2D(p - vec2(0.0, eps));
    float n3 = noise2D(p + vec2(eps, 0.0));
    float n4 = noise2D(p - vec2(eps, 0.0));
    return vec2(n1 - n2, -(n3 - n4)) / (2.0 * eps);
}

float fbmPlasma(vec2 p, float turb) {
    float v = 0.0;
    float a = 0.5;
    mat2 rot = mat2(0.866, -0.5, 0.5, 0.866);
    for (int i = 0; i < 5; i++) {
        vec2 c = curlNoise(p * 0.8);
        v += a * noise2D(p + c * (0.4 * turb));
        p = rot * p * 2.1 + vec2(1.7, 2.3);
        a *= 0.5;
    }
    return v;
}

// Blackbody thermal incandescent color curve
vec3 blackbody(float t) {
    t = clamp(t, 0.0, 3.0);
    vec3 c = vec3(0.0);
    c.r = smoothstep(0.0, 0.8, t) * 1.5;
    c.g = smoothstep(0.3, 1.4, t) * 1.2;
    c.b = smoothstep(0.8, 2.2, t) * 1.6;
    return c;
}

void main() {
    float turb = (turbulenceP > 0.0) ? turbulenceP : 1.0;
    float heat = (heatP       > 0.0) ? heatP       : 1.0;
    float flr  = (flareP      > 0.0) ? flareP      : 1.0;
    float hue  = (hueP        > 0.0) ? hueP        : 0.0;

    vec2 uv = (gl_FragCoord.xy - 0.5 * resolution) / resolution.y;
    vec2 st = gl_FragCoord.xy / resolution;

    float r = length(uv);
    float a = atan(uv.y, uv.x);

    float t = time * 0.25 + audioAdvance * 0.15;

    // Photosphere limb curvature: huge stellar core filling bottom/center
    vec2 p = uv * (1.8 + 0.3 * sin(t * 0.2));
    
    // Magnetic twisting rotation
    float spin = (0.2 + 0.4 / (r + 0.4)) * (time * 0.2 + audioPhase * 0.5);
    mat2 rot = mat2(cos(spin), -sin(spin), sin(spin), cos(spin));
    vec2 pRot = rot * p;

    // Photosphere granular convection cells
    float cells = fbmPlasma(pRot * 3.5, turb);
    float cells2 = fbmPlasma(pRot * 7.0 + vec2(t * 0.5, -t * 0.3), turb * 1.2);
    float granules = (cells * 0.6 + cells2 * 0.4);

    // Coronal mass ejection / magnetic prominence arches
    int promenCount = 6;
    float promenGlow = 0.0;
    for (int k = 0; k < promenCount; k++) {
        float pAngle = float(k) * (6.2831853 / float(promenCount)) + t * 0.1;
        float diffA = mod(a - pAngle + 3.14159, 6.2831853) - 3.14159;
        
        // Loop curve formula
        float archR = 0.65 + 0.3 * sin(t * 2.0 + float(k) * 2.5) + audioSubBass * 0.4 * flr;
        float archH = 0.25 * sin(max(0.0, 3.14159 - abs(diffA) * 6.0));
        float dArch = abs(r - (archR + archH)) + abs(diffA) * 0.2;

        promenGlow += (0.012 / (dArch * dArch + 0.003)) * (0.8 + audioKick * 1.5);
    }

    // Solar thermal temperature calculation
    float coreHeat = exp(-r * (1.8 / heat)) * 2.2;
    float surfaceHeat = granules * 1.6 + promenGlow * 0.5;
    float shockwave = sin(r * 20.0 - t * 6.0 - audioSubBass * 8.0) * exp(-r * 2.0) * audioKick * 1.8;

    float totalThermal = coreHeat + surfaceHeat + shockwave;

    // Thermal color radiance
    vec3 col = blackbody(totalThermal);

    // Sunspot magnetic dark filaments
    float sunspots = smoothstep(0.72, 0.85, fbmPlasma(pRot * 2.0 + vec2(t * 0.1), turb * 0.8));
    col *= (1.0 - sunspots * 0.65);

    // Background cosmic corona rays & solar wind
    float coronaRays = pow(noise2D(vec2(a * 5.0 + t * 0.4, r * 2.0 - t * 1.5)), 2.0);
    vec3 coronaCol = mix(vec3(1.0, 0.4, 0.1), vec3(0.9, 0.1, 0.4), sin(a * 3.0 + t) * 0.5 + 0.5);
    col += coronaCol * coronaRays * (0.6 + audioSwell * 0.8) * exp(-r * 0.8);

    // Sample texture with thermal distortion
    vec2 photoUV = st + curlNoise(pRot * 2.0) * 0.02 * (1.0 + audioMid * 1.5);
    vec3 photo = img(clamp(photoUV, 0.0, 1.0));
    col += photo * (0.25 + 0.3 * audioLevel) * vec3(1.2, 0.9, 0.4);

    // Incandescent solar flares & sparks
    if (audioHigh > 0.4) {
        float spark = hash21(floor(uv * 50.0) + vec2(floor(time * 25.0), 3.0));
        if (spark > 0.97) {
            col += vec3(1.5, 1.2, 0.8) * audioHigh * 1.8;
        }
    }

    if (hue > 0.001) col = hueRot(col, hue);

    // Viewport edge glow & tone map
    col = col / (col + vec3(1.0)); // Filmic Reinhardt tone mapping
    col = pow(col, vec3(0.85));

    fragColor = vec4(col, 1.0);
}
