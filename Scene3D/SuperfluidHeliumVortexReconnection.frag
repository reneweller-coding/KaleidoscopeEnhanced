#version 330 core
out vec4 fragColor;
/**
 * @file SuperfluidHeliumVortexReconnection.frag
 * @brief SUPERFLUID HELIUM VORTEX RECONNECTION: Quantized vortex filament reconnection events
 * in superfluid liquid Helium-4 (He-II). Singular vortex line crossing, topological reconnection
 * cusps, Kelvin-wave phonon sound radiation, and superfluid photo texturing.
 *   audioAdvance -> drives vortex line hydrodynamic Biot-Savart velocity
 *   audioKick    -> flashes singular reconnection cusp energy dissipation bursts
 *   audioSwell   -> widens vortex healing length & Kelvin-wave wavepacket envelope
 *   audioCentroid-> shifts superfluid roton / phonon dispersion color spectra
 *
 * Per-activation variety:
 *   reconnGlowP float reconnection cusp flash luminance       (0.8..2.5)
 *   kelvinP     float Kelvin-wave phonon acoustic brightness   (0.6..2.2)
 */

in vec3 vPos;
in float vDepth;
in float vGlow;

uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float audioAdvance;
uniform float audioKick;
uniform float audioSwell;
uniform float audioCentroid;
uniform float audioValence;
uniform float audioChromaHue;

uniform float reconnGlowP;
uniform float kelvinP;

vec3 img(vec2 uv) {
    return (interpolation * texture(tex0, uv) + (1.0 - interpolation) * texture(tex1, uv)).rgb;
}

vec3 imgPalette(float t)
{
    float ang = audioChromaHue + audioAdvance * 0.04 + t * 6.2831853;
    float rad = 0.16 + 0.08 * sin(audioAdvance * 0.013);
    vec3  col = img(clamp(vec2(0.5) + rad * vec2(cos(ang), sin(ang)), 0.0, 1.0));
    float g   = dot(col, vec3(0.333));
    return mix(vec3(g), col, 0.55 + 0.45 * audioValence);
}

vec3 palTint(vec3 c, float t, float k)
{
    vec3 tp = imgPalette(t);
    tp *= dot(c, vec3(0.3333)) / max(dot(tp, vec3(0.3333)), 1e-3);
    return mix(c, tp, k);
}

void main() {
    // Superfluid cyan / violet roton identity color
    vec3 rotonCyan = vec3(0.15, 0.9, 0.95);
    vec3 rotonCol  = palTint(rotonCyan, vDepth * 0.4 + audioCentroid, 0.25);
    
    vec2 photoUv = fract(vPos.xy * 0.3 + 0.5);
    vec3 photoSample = img(photoUv);
    
    vec3 col = rotonCol * (0.6 + 0.4 * photoSample) * vGlow;
    col *= (reconnGlowP > 0.01 ? reconnGlowP : 1.2) * (0.85 + 0.35 * audioSwell);
    col += vec3(0.9, 0.95, 1.0) * (audioKick * 0.35);
    
    // Soft knee compression
    col /= 1.0 + 0.35 * max(col.r, max(col.g, col.b));
    fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
