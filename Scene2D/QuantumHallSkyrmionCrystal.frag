#version 330 core
out vec4 fragColor;
/**
 * @file QuantumHallSkyrmionCrystal.frag
 * @brief QUANTUM HALL SKYRMION CRYSTAL: 2D triangular crystal of spin-textured Skyrmions
 * in a quantum Hall ferromagnet near filling factor nu = 1. Features entangled electron spin
 * textures, fractional quantized Hall current ripples, and Landau level photo texturing.
 *   audioAdvance -> navigates chiral Hall drift & cyclotron phase evolution
 *   audioKick    -> flashes fractional quasiparticle injection & annihilation bursts
 *   audioBass    -> undulates skyrmion spin stiffness & out-of-plane core diameter
 *   audioSwell   -> enriches quantum Hall ferromagnet background coherence
 *   audioCentroid-> shifts Landau level transition emission spectra
 *
 * Per-activation variety:
 *   crystalPitchP float triangular skyrmion lattice density       (2.0..6.0)
 *   spinRadiusP   float skyrmion spin-texture transition width    (0.4..1.8)
 *   hallCurrentP  float fractional Hall edge current brightness   (0.8..2.5)
 *   cyclotronP    float electron cyclotron orbit ripple frequency (8.0..24.0)
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
uniform float audioChromaHue;
uniform float audioSubBass;
uniform float audioBass;
uniform float audioMid;
uniform float audioHigh;
uniform float audioFlux;

uniform float crystalPitchP;
uniform float spinRadiusP;
uniform float hallCurrentP;
uniform float cyclotronP;

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

void main()
{
    vec2 uv = (gl_FragCoord.xy - 0.5 * resolution) / min(resolution.x, resolution.y);
    float t = time * 0.35 + audioAdvance * 0.3;
    
    // Hexagonal / Triangular Quantum Hall Skyrmion lattice
    float pitch = (crystalPitchP > 0.01 ? crystalPitchP : 3.8);
    vec2 p = uv * pitch;
    
    // ECHTE Inverse der cartPos-Formel unten (X = sqrt3*(cx+0.5*cy),
    // Y = 1.5*cy) -- die alte Rueckrechnung gehoerte zu einem anderen
    // Gitter und liess am unteren Rand abgeschnittene Spikes stehen.
    vec2 cell = floor(vec2(p.x * 0.57735027 - p.y * 0.33333333,
                           p.y * 0.66666667));
    
    float minDist = 1e5;
    vec2 closestOffset = vec2(0.0);
    
    // +-2 statt +-1: die +-1-Suche im GESCHERTEN Zellraum verfehlte in der
    // unteren Bildhaelfte den wahren naechsten Mittelpunkt, und die Kugeln
    // wurden an der Zellgrenze halbiert ("Kugeln unten nur halb").
    for (int y = -2; y <= 2; y++) {
        for (int x = -2; x <= 2; x++) {
            vec2 neighbor = vec2(float(x), float(y));
            vec2 cartPos = vec2(sqrt(3.0) * (cell.x + neighbor.x + 0.5 * (cell.y + neighbor.y)), 1.5 * (cell.y + neighbor.y));
            vec2 diff = p - cartPos;
            float d = length(diff);
            if (d < minDist) {
                minDist = d;
                closestOffset = diff;
            }
        }
    }
    
    // Skyrmion spin profile: theta(r) in quantum Hall state
    float spinW = (spinRadiusP > 0.01 ? spinRadiusP : 1.0) * (0.8 + 0.4 * audioBass);
    float spinAngle = 3.14159265 * exp(-minDist * minDist * 2.5 * spinW);
    float azim = atan(closestOffset.y, closestOffset.x) + spinAngle + audioPhase * 0.5;
    
    // Out-of-plane spin component S_z = cos(theta)
    float sz = cos(spinAngle);
    
    // Cyclotron orbit ripples in Landau level
    float cycloFreq = (cyclotronP > 0.01 ? cyclotronP : 16.0);
    float cycloRipples = sin(minDist * cycloFreq - t * 4.0) * exp(-minDist * 2.0) * (0.6 + 0.8 * audioHigh);
    
    // Fractional Hall current around skyrmion cores
    float hallCurrent = (hallCurrentP > 0.01 ? hallCurrentP : 1.3) * sin(azim * 2.0 + t * 2.0) * exp(-abs(spinAngle - 1.57) * 4.0);
    
    // Quasiparticle flash on kick
    float qpFlash = exp(-minDist * 14.0) * (1.0 + 3.5 * audioKick);
    
    // Palette assignment
    float palAngle = fract(azim * 0.159 + sz * 0.3 + length(cell) * 0.05 + audioCentroid);
    vec3 colSkyrmion = imgPalette(palAngle);
    vec3 colCurrent  = imgPalette(fract(palAngle + 0.5)) * 2.0;
    
    // Background photo sampling
    vec2 bgUv = gl_FragCoord.xy / resolution;
    vec3 bg = img(bgUv) * 0.25;
    
    vec3 col = bg;
    col += colSkyrmion * (0.75 + 0.25 * sz) * (0.85 + 0.35 * audioSwell);
    col += colCurrent * abs(hallCurrent);
    col += vec3(0.9, 0.95, 1.0) * qpFlash * 2.2;
    col += colSkyrmion * abs(cycloRipples) * 0.9;
    col += colSkyrmion * (audioKick * 0.35);
    
    // Soft knee compression
    col /= 1.0 + 0.35 * max(col.r, max(col.g, col.b));
    fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
