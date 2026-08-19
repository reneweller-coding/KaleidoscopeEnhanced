#version 330 core
out vec4 fragColor;
/**
 * @file MagnetarCrustalQuakeAlfvenResonance.frag
 * @brief MAGNETAR CRUSTAL QUAKE ALFVÉN RESONANCE: Crustal fracture and global seismic oscillations
 * on an ultrastrong magnetar (SGR / AXP). Relativistic shear fractures inject high-frequency
 * torsional Alfven waves into the magnetosphere, igniting giant gamma-ray flare fireballs.
 *   audioAdvance -> drives magnetospheric Alfven wave propagation & crustal strain buildup
 *   audioKick    -> flashes catastrophic crustal rupture & gamma-ray flare detonation bursts
 *   audioBass    -> deepens magnetar core gravitational potential & dipolar field compression
 *   audioSwell   -> widens trapped relativistic pair fireball volume & magnetic loop glow
 *   audioCentroid-> shifts magnetar thermal X-ray / synchrotron gamma emission spectra
 *
 * Per-activation variety:
 *   quakeGlowP  float crustal fracture flare peak luminance (0.8..2.5)
 *   fireballP   float trapped pair plasma fireball intensity(0.6..2.2)
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

uniform float quakeGlowP;
uniform float fireballP;

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
    // Magnetar high-energy violet-white / amber flare identity
    vec3 magnetarCol = vec3(0.6, 0.25, 0.95);
    vec3 flareCol    = palTint(magnetarCol, vDepth * 0.4 + audioCentroid, 0.25);
    
    vec2 photoUv = fract(vPos.xy * 0.3 + 0.5);
    vec3 photoSample = img(photoUv);
    
    vec3 col = flareCol * (0.6 + 0.4 * photoSample) * vGlow;
    col *= (quakeGlowP > 0.01 ? quakeGlowP : 1.2) * (0.85 + 0.35 * audioSwell);
    col += vec3(1.0, 0.95, 0.9) * (audioKick * 0.35);
    
    // Soft knee compression
    col /= 1.0 + 0.35 * max(col.r, max(col.g, col.b));
    fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
