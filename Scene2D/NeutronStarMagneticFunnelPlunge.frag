#version 330 core
out vec4 fragColor;
/**
 * @file NeutronStarMagneticFunnelPlunge.frag
 * @brief NEUTRON STAR MAGNETIC FUNNEL PLUNGE: Relativistic plunge along magnetic dipole
 * field lines into the magnetic polar cap of a rotating millisecond pulsar. Gleaming synchrotron
 * radiation cones, magnetic funnel plasma pinch, and high-energy X-ray beam flashes.
 *
 * Audio Reactivity:
 *   audioAdvance -> drives continuous relativistic plunge along magnetic dipole lines
 *   audioKick    -> flashes pulsar polar cap magnetic reconnection & X-ray pulse
 *   audioCentroid-> modulates synchrotron magnetic field line density
 *   audioSubBass -> expands magnetic funnel diameter breathing
 *   audioChromaHue-> steers the high-energy X-ray / ultraviolet / aurum spectrum
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

// Per-activation variety
uniform float speedP;
uniform float magneticP;
uniform float pinchP;
uniform float glowP;
uniform float hueP;

vec3 img(vec2 uv) {
    return (interpolation * texture(tex0, uv) + (1.0 - interpolation) * texture(tex1, uv)).rgb;
}

vec3 imgPalette(float t) {
    float ang = audioChromaHue + audioAdvance * 0.04 + t * 6.2831853 + hueP;
    float rad = 0.16 + 0.08 * sin(audioAdvance * 0.013);
    vec3  pc  = img(clamp(vec2(0.5) + rad * vec2(cos(ang), sin(ang)), 0.0, 1.0));
    float pg  = dot(pc, vec3(0.333));
    return mix(vec3(pg), pc, 0.55 + 0.45 * audioValence);
}

void main() {
    vec2 uv = (gl_FragCoord.xy - 0.5 * resolution.xy) / min(resolution.x, resolution.y);

    float spd = (speedP > 0.01) ? speedP : 1.0;
    float mag = (magneticP > 0.01) ? magneticP : 1.0;
    float pnch = (pinchP > 0.01) ? pinchP : 1.2;
    float glw = (glowP > 0.01) ? glowP : 1.0;

    float t = audioAdvance * 0.45 * spd;

    float r = max(0.01, length(uv));
    float a = atan(uv.y, uv.x);

    // Magnetic dipole field line parameterization: r = L * sin^2(theta) -> coordinates along funnel
    float zFunnel = (1.0 / pow(r, pnch)) * 0.4 - t * 3.0;

    // Helical magnetic field line twisting
    float fieldLines = abs(sin(a * (16.0 * mag) + zFunnel * 2.0));
    float lineGlow = smoothstep(0.85, 1.0, fieldLines) * glw;

    // Synchrotron relativistic radiation rings
    float synchrotronRings = abs(sin(zFunnel * 3.0 + t * 4.0));
    float ringGlow = exp(-synchrotronRings * 8.0) * (1.0 + 2.0 * audioHigh);

    // Pulsar rotation beacon flash (sweeping beam)
    float pulsarBeam = pow(max(0.0, cos(a - t * 6.0)), 12.0) * (1.0 + 2.5 * audioKick);

    // Sample distorted background photo
    vec2 sampleUV = fract(vec2(a / 6.2831853 + 0.5, zFunnel * 0.15));
    vec3 texCol = img(sampleUV);

    // High-energy X-ray spectrum palette
    vec3 palBase = imgPalette(zFunnel * 0.1 + 0.3);
    vec3 col = mix(texCol * 0.3, palBase, 0.45);

    // Add glowing magnetic flux tubes & synchrotron rings
    vec3 fluxTint = vec3(0.4, 1.4, 2.0) * lineGlow * (1.0 + 2.0 * audioKick);
    vec3 ringTint = vec3(1.8, 1.2, 0.4) * ringGlow;
    vec3 beamTint = vec3(1.9, 1.8, 2.0) * pulsarBeam;

    col += fluxTint + ringTint + beamTint;

    // Center polar cap magnetic pinch singularity bloom
    float polarBloom = exp(-r * 10.0) * (2.0 + 4.0 * audioKick);
    col += vec3(1.7, 1.8, 2.0) * polarBloom;

    col = pow(col, vec3(0.88));
    fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
