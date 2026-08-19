#version 330 core
out vec4 fragColor;
/**
 * @file FerroelectricDomainVortexArray.frag
 * @brief FERROELECTRIC DOMAIN VORTEX ARRAY: 2D square array of nanoscale electric polarization
 * vortices and antivortices in PbTiO3/SrTiO3 oxide superlattices. Continuous curling of electric
 * dipoles creates localized piezoelectric shear strain, toroidal dipole moments, and photo texturing.
 *   audioAdvance -> rotates ferroelectric polarization curl vectors & domain wall drift
 *   audioKick    -> flashes piezoelectric stress-release polarization switching pulses
 *   audioSwell   -> enriches dipolar vortex core depth & spontaneous polarization magnitude
 *   audioCentroid-> shifts ferroelectric domain birefringent color spectra
 *   audioPhase   -> twists alternating vortex-antivortex chirality
 *
 * Per-activation variety:
 *   vortexPitchP float ferroelectric vortex cell pitch scale     (2.5..7.0)
 *   polarStrP    float spontaneous electric polarization strength (0.6..2.2)
 *   piezoP       float piezoelectric shear birefringence contrast (0.8..2.5)
 *   coreDipP     float vortex core electric field singularity     (0.4..1.8)
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

uniform float vortexPitchP;
uniform float polarStrP;
uniform float piezoP;
uniform float coreDipP;

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
    
    // Square superlattice array of ferroelectric vortices
    float pitch = (vortexPitchP > 0.01 ? vortexPitchP : 4.5);
    vec2 p = uv * pitch;
    vec2 cell = floor(p);
    vec2 f = fract(p) - 0.5;
    
    // Checkerboard vortex / antivortex topological charge: Q = (-1)^(ix + iy)
    float qSign = mod(cell.x + cell.y, 2.0) == 0.0 ? 1.0 : -1.0;
    
    // Electric polarization vector P(r) curling around vortex core
    float r = length(f);
    float theta = atan(f.y, f.x);
    
    // Vortex curl angle: alpha = theta + qSign * (pi/2) + phase
    float curlAngle = theta + qSign * 1.5707963 + audioPhase * 0.3 + t * 0.5;
    vec2 P_vec = vec2(cos(curlAngle), sin(curlAngle)) * (polarStrP > 0.01 ? polarStrP : 1.2);
    
    // Core singularity (polarization drops to zero at the core center)
    float coreStr = (coreDipP > 0.01 ? coreDipP : 1.0);
    float core = clamp(r * 5.0 / coreStr, 0.0, 1.0);
    P_vec *= core;
    
    // Piezoelectric shear strain ~ dP_x/dy + dP_y/dx
    float shear = abs(sin(curlAngle * 2.0)) * (piezoP > 0.01 ? piezoP : 1.3);
    
    // Polarization switching flash on kick
    float switchFlash = exp(-r * 12.0) * (1.0 + 3.5 * audioKick);
    
    // Domain wall boundaries between cells
    float domainWall = exp(-abs(max(abs(f.x), abs(f.y)) - 0.48) * 35.0);
    
    // Palette assignment from photo arc
    float palAngle = fract(curlAngle * 0.159 + length(cell) * 0.06 + audioCentroid);
    vec3 colPolar = imgPalette(palAngle);
    vec3 colShear = imgPalette(fract(palAngle + 0.5)) * 1.8;
    
    // Background photo sampling
    vec2 bgUv = gl_FragCoord.xy / resolution;
    vec3 bg = img(bgUv) * 0.25;
    
    vec3 col = bg;
    // core/shear cover nearly the whole frame -- their gains dominate the
    // scene's base brightness, and at the original 0.8/0.8 the summed
    // field pushed the average luma past the white threshold.
    col += colPolar * core * (0.5 + 0.3 * audioSwell);
    col += colShear * shear * 0.5;
    col += vec3(0.9, 0.95, 1.0) * switchFlash * 2.2;
    col += colPolar * domainWall * 1.4;
    col += colPolar * (audioKick * 0.35);
    
    // Soft knee compression
    col /= 1.0 + 0.35 * max(col.r, max(col.g, col.b));
    fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
