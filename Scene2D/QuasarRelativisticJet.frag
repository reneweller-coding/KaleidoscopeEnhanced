#version 330 core
out vec4 fragColor;
/**
 * @file QuasarRelativisticJet.frag
 * @brief QUASAR RELATIVISTIC JET: Raymarched look down the magnetic confinement
 * funnel of an ultra-luminous active galactic nucleus. Relativistic synchrotron
 * plasma jets shoot along helical magnetic field lines with shock diamonds,
 * Cherenkov beaming cones, and multi-tier accretion disk photo reflections.
 *   audioAdvance -> accelerates plasma packets down the relativistic jet
 *   audioKick    -> fires shock diamond detonations and synchrotron flashes
 *   audioSubBass -> expands accretion magnetic field throat
 *   audioHigh    -> intensifies Cherenkov radiation ring glow
 *
 * Per-activation variety:
 *   jetP         float jet core radiance and length      (0.5..2.2)
 *   collimationP float magnetic funnel tight confinement (0.5..2.0)
 *   speedP       float plasma helical swirl velocity     (0.5..2.0)
 *   hueP         float spectral synchrotron hue offset   (0..6.28)
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

uniform float jetP;
uniform float collimationP;
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

void main() {
    float jet = (jetP         > 0.0) ? jetP         : 1.0;
    float col = (collimationP > 0.0) ? collimationP : 1.0;
    float spd = (speedP       > 0.0) ? speedP       : 1.0;
    float hue = (hueP         > 0.0) ? hueP         : 0.0;

    vec2 uv = (gl_FragCoord.xy - 0.5 * resolution) / resolution.y;
    vec2 st = gl_FragCoord.xy / resolution;

    float t = time * 0.4 * spd + audioAdvance * 0.2;

    // Raymarching camera down the relativistic jet axis
    vec3 ro = vec3(0.0, 0.0, -3.0);
    vec3 rd = normalize(vec3(uv, 1.2 - 0.3 * audioKick));

    // Slight camera bank/swirl
    rd.xy = rot2D(sin(t * 0.3) * 0.3 + audioPhase * 0.5) * rd.xy;

    vec3 p = ro;
    float accumDensity = 0.0;
    float shockDiamonds = 0.0;
    float photoWeight = 0.0;
    vec2 sampledCoord = vec2(0.0);

    float stepSize = 0.08;
    for (int i = 0; i < 40; ++i) {
        p += rd * stepSize;
        float z = p.z;
        float r = length(p.xy);

        // Magnetic funnel envelope: r_funnel = a * z^0.6
        float funnelR = (0.2 + 0.35 * pow(max(z + 3.0, 0.1), 0.65)) / col;
        funnelR += 0.08 * sin(z * 4.0 - t * 6.0) * (1.0 + audioKick);

        // Helical magnetic field lines
        float angle = atan(p.y, p.x) + z * 2.5 * col - t * 4.0;
        float helix = abs(sin(angle * 4.0));

        // Synchrotron plasma sheath density
        float sheathDist = abs(r - funnelR);
        float density = exp(-sheathDist * 16.0) * (1.0 + helix * 1.2);

        // Shock diamonds: periodic supersonic compression nodes along z
        float diamondZ = sin(z * 6.0 - t * 8.0);
        float diamond = exp(-abs(diamondZ) * 8.0) * exp(-r * 8.0);
        shockDiamonds += diamond * (1.5 + audioKick * 3.0);

        accumDensity += density * stepSize;

        // Sample coordinates along magnetic sheath for photo mapping
        if (sheathDist < 0.15 && photoWeight < 1.0) {
            sampledCoord = vec2(angle * 0.15915, z * 0.2 + t * 0.1);
            photoWeight += 0.2;
        }
    }

    vec3 photo = img(fract(sampledCoord + 0.5));

    // Core relativistic beam color (Cherenkov electric blue / violet / white)
    vec3 beamColor = imgPalette(0.25 * shockDiamonds) * 1.3;
    beamColor = mix(beamColor, vec3(1.0, 0.3, 0.8), sin(t + accumDensity * 2.0) * 0.5 + 0.5);

    // Combine visualizer
    vec3 finalCol = mix(photo * 0.9, beamColor, clamp(accumDensity * 1.5 * jet, 0.0, 1.0));
    finalCol += shockDiamonds * vec3(1.0, 0.95, 0.85) * (1.2 + audioKick * 2.0);
    finalCol += exp(-length(uv) * 12.0) * vec3(1.0, 0.9, 0.6) * (1.5 + audioSubBass * 2.0);

    if (audioChromaHue != 0.0) finalCol = hueRot(finalCol, audioChromaHue);
    if (hue > 0.001) finalCol = hueRot(finalCol, hue);

    // Vignette
    float vig = smoothstep(1.3, 0.3, length(uv));
    finalCol *= vig;

    // Catalogue review: soft-knee exposure — hot audio compresses
    // instead of clipping the whole frame to white.
    vec3 _catTone = (finalCol) * 0.3;
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(_catTone, 1.0);
}
