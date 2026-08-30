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

    float t = time * 0.270 * spd + audioAdvance * 0.270 * spd;
    // Zeit-Basis + Musik-Schub: audioAdvance ALLEIN steht bei ruhiger
    // Musik still (die gemeldete "wirkt wie ein Bild"-Klasse).

    float r = max(0.01, length(uv));
    float a = atan(uv.y, uv.x);

    // Magnetic dipole field line parameterization: r = L * sin^2(theta) -> coordinates along funnel
    // Sub-bass widens the funnel throat by dilating the radial coordinate the
    // dipole mapping is built from -- the -t*3.0 plunge term stays untouched
    // so the flight phase is never remapped.
    float rf = max(0.01, r / (1.0 + 0.35 * audioSubBass));
    float zFunnel = (1.0 / pow(rf, pnch)) * 0.4 - t * 3.0;

    // Helical magnetic field line twisting; tonal brightness thickens the
    // angular line count (spatial term only, never the z advance).
    float fieldLines = abs(sin(a * (16.0 * mag) * (1.0 + 0.45 * audioCentroid) + zFunnel * 2.0));
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

    // Add glowing magnetic flux tubes & synchrotron rings. The first pass
    // capped each raw glow*audio SCALAR to 1.0, but the tint constants
    // (0.4,1.4,2.0 / 1.8,1.2,0.4 / 1.9,1.8,2.0) still exceed 1.0 per channel
    // even at that cap -- e.g. a "capped" flux term still added up to 2.0 of
    // pure white. The cap has to bound the FINAL tinted vector, not just the
    // glow scalar feeding it; do that here and lower the tint peaks too.
    vec3 fluxTint = min(vec3(0.3, 1.0, 1.4) * (lineGlow * (1.0 + 2.0 * audioKick)), vec3(0.75));
    vec3 ringTint = min(vec3(1.3, 0.9, 0.3) * ringGlow, vec3(0.65));
    vec3 beamTint = min(vec3(1.3, 1.2, 1.4) * pulsarBeam, vec3(0.75));

    col += fluxTint + ringTint + beamTint;

    // Center polar cap magnetic pinch singularity bloom -- the first pass
    // capped the raw SCALAR to 1.3, but the 2.0-peak tint channel still
    // pushed the final term to ~2.6 at the funnel core, which is exactly why
    // re-verification still showed a large flat white core. Cap the
    // finished tinted term itself and lower its ceiling.
    float polarBloom = exp(-r * 10.0) * (2.0 + 4.0 * audioKick);
    col += min(vec3(1.1, 1.2, 1.4) * polarBloom, vec3(0.85));

    col = pow(col, vec3(0.88));
    vec3 _catTone = clamp(col, 0.0, 1.0);
    _catTone /= 1.0 + 0.9 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(_catTone, 1.0);
}
