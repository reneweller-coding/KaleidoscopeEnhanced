#version 330 core
out vec4 fragColor;
/**
 * @file LiquidCrystalBluePhaseLattice.frag
 * @brief LIQUID CRYSTAL BLUE PHASE LATTICE: 3D cubic network of double-twist cylinders in
 * highly chiral liquid crystals (Blue Phase I / II). Cubic defect disclination lines form
 * a 3D periodic photonic bandgap lattice with selective Bragg reflection of deep blue light.
 *   audioAdvance -> rotates chiral director double-twist cylinders & disclination lattice flow
 *   audioKick    -> flashes cubic unit cell orientation switching & selective reflection bursts
 *   audioSwell   -> widens double-twist cylinder diameter & chiral pitch coherence
 *   audioCentroid-> shifts Blue Phase selective Bragg reflection wavelength spectra
 *   audioPhase   -> modulates helical pitch twist chirality
 *
 * Per-activation variety:
 *   unitCellPitchP float cubic Blue Phase unit cell pitch scale  (2.5..7.0)
 *   chiralTwistP   float double-twist cylinder helical pitch     (0.6..2.2)
 *   disclinationP  float defect disclination line core sharpness (0.8..2.5)
 *   blueReflectP   float selective Bragg reflection brightness   (0.8..2.5)
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

uniform float unitCellPitchP;
uniform float chiralTwistP;
uniform float disclinationP;
uniform float blueReflectP;

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
    float t = time * 0.4 + audioAdvance * 0.35;
    
    // Cubic Blue Phase lattice coordinates (O^8 body-centered cubic or O^2 simple cubic)
    float pitch = (unitCellPitchP > 0.01 ? unitCellPitchP : 4.5);
    vec2 p = uv * pitch;
    vec2 cell = floor(p);
    vec2 f = fract(p) - 0.5;
    
    // Double-twist cylinder director field: n(r) rotates simultaneously in 2 perpendicular directions
    float r = length(f);
    float kTwist = (chiralTwistP > 0.01 ? chiralTwistP : 1.2);
    float twistAngle = r * 3.14159265 * kTwist + audioPhase * 0.5 + t * 0.8;
    
    // Director orientation
    vec2 director = vec2(cos(twistAngle), sin(twistAngle));
    
    // -1/2 disclination lines at the cell corners (where 4 double-twist cylinders meet)
    float cornerDist = length(abs(f) - vec2(0.5));
    float kDisc = (disclinationP > 0.01 ? disclinationP : 1.4);
    float disclinationCore = exp(-cornerDist * cornerDist * 40.0 * kDisc);
    
    // Selective Bragg reflection of blue light from cubic photonic lattice
    float braggPlane = sin(f.x * 6.2831853) * cos(f.y * 6.2831853);
    float blueReflection = pow(braggPlane * 0.5 + 0.5, 3.0) * (blueReflectP > 0.01 ? blueReflectP : 1.3);
    
    // Switching flash on kick
    float switchFlash = exp(-r * 12.0) * (1.0 + 3.5 * audioKick);
    
    // Blue Phase deep sapphire / cobalt / violet palette
    float palAngle = fract(twistAngle * 0.159 + length(cell) * 0.08 + audioCentroid);
    vec3 colBlue  = imgPalette(palAngle);
    vec3 colDisc  = imgPalette(fract(palAngle + 0.5)) * 1.8;
    
    // Background photo sampling
    vec2 bgUv = gl_FragCoord.xy / resolution;
    vec3 bg = img(bgUv) * 0.25;
    
    vec3 col = bg;
    col += colBlue * blueReflection * (0.8 + 0.4 * audioSwell) * 2.2;
    col += colDisc * disclinationCore * 1.6;
    col += vec3(0.9, 0.95, 1.0) * switchFlash * 2.0;
    col += colBlue * (audioKick * 0.35);
    
    // Soft knee compression
    col /= 1.0 + 0.35 * max(col.r, max(col.g, col.b));
    fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
