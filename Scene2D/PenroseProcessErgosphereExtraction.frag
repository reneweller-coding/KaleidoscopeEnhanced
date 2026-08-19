#version 330 core
out vec4 fragColor;
/**
 * @file PenroseProcessErgosphereExtraction.frag
 * @brief PENROSE PROCESS ERGOSPHERE EXTRACTION: Relativistic rotational energy extraction
 * from a spinning Kerr black hole inside its oblate ergosphere. Decaying infalling geodesics,
 * negative-energy orbits, extreme Doppler blueshifted escaping photon fans, and photo lensing.
 *   audioAdvance -> accelerates black hole spin & frame-dragging swirl
 *   audioKick    -> injects high-energy matter chunks triggering Penrose bursts
 *   audioCentroid-> shifts relativistic beaming & Doppler color horizons
 *   audioSwell   -> widens ergosphere boundary radius & accretion thickness
 *   audioSubBass -> deepens event horizon gravitational shadow
 *
 * Per-activation variety:
 *   spinP    float dimensionless Kerr spin parameter a/M   (0.7..0.99)
 *   ergoP    float ergosphere oblate deformation scale     (0.5..1.8)
 *   jetP     float escaping energy beam intensity          (0.6..2.2)
 *   lensP    float gravitational light bending strength    (0.8..2.5)
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

uniform float spinP;
uniform float ergoP;
uniform float jetP;
uniform float lensP;

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
    float t = time * 0.4 + audioAdvance * 0.4;
    
    // Kerr geometry parameters
    float a_spin = (spinP > 0.01 ? spinP : 0.95);
    float M = 0.35;
    
    // Coordinate radius and polar angle
    float r = length(uv);
    float theta = atan(uv.y, uv.x);
    
    // Frame-dragging swirl
    float omega = 2.0 * a_spin * M / (pow(r, 3.0) + a_spin * a_spin * r + 0.05);
    float phi = theta + omega * 0.15 + t * 0.5;
    
    // Gravitational lensing warp
    float lensStr = (lensP > 0.01 ? lensP : 1.2);
    vec2 warpedUv = uv + vec2(cos(phi), sin(phi)) * (lensStr * 0.04 / (r + 0.1));
    
    // Horizons: Event Horizon r_plus and Ergosphere r_ergo(theta)
    float r_plus = M + sqrt(max(0.001, M * M - a_spin * a_spin * 0.25));
    float ergoDef = (ergoP > 0.01 ? ergoP : 1.0);
    float r_ergo = M + sqrt(max(0.001, M * M - a_spin * a_spin * 0.25 * pow(cos(theta), 2.0))) * ergoDef;
    
    // Inside event horizon (shadow)
    float horizonMask = smoothstep(r_plus - 0.02, r_plus + 0.03, r);
    
    // Ergosphere region: r_plus < r < r_ergo
    float inErgosphere = smoothstep(r_plus, r_plus + 0.04, r) * smoothstep(r_ergo + 0.08, r_ergo, r);
    
    // Penrose particle splitting & escaping beams
    float beamCount = 6.0;
    float beams = pow(sin(phi * beamCount - t * 2.0) * 0.5 + 0.5, 4.0);
    beams *= inErgosphere * (jetP > 0.01 ? jetP : 1.2) * (1.0 + 2.5 * audioKick);
    
    // Relativistic Doppler beaming across disk (approaching side brighter & blueshifted)
    float doppler = sin(phi) * 0.5 + 0.5;
    float dopplerFactor = pow(doppler + 0.2, 2.5);
    
    // Accretion swirl ribbons
    float swirl = sin(log(r + 0.01) * 8.0 - phi * 2.0 + t) * 0.5 + 0.5;
    swirl *= smoothstep(r_plus, r_plus + 0.1, r) * exp(-r * 2.5);
    
    // Color synthesis using photo palette modulated by Doppler shift
    vec3 colErgo = imgPalette(fract(phi * 0.159 + doppler * 0.4 + t * 0.05));
    vec3 colBeams = imgPalette(fract(doppler + 0.5 + audioCentroid)) * 2.5;
    vec3 colSwirl = imgPalette(fract(r * 0.5 + 0.25)) * (0.8 + 0.6 * audioSwell);
    
    // Sample warped background photo
    vec2 bgCoord = fract(warpedUv * 0.5 + 0.5);
    vec3 bgCol = img(bgCoord) * 0.35;
    
    vec3 col = bgCol * horizonMask;
    col += colErgo * inErgosphere * (1.2 + 0.8 * audioBass) * dopplerFactor;
    col += colBeams * beams;
    col += colSwirl * swirl * dopplerFactor;
    
    // Central horizon shadow ring glow
    float ringGlow = exp(-abs(r - r_plus) * 40.0) * (1.0 + 3.0 * audioKick);
    col += imgPalette(t * 0.1) * ringGlow * 1.5;
    
    // Ergosphere boundary line
    float ergoLine = exp(-abs(r - r_ergo) * 30.0) * 0.8;
    col += imgPalette(audioAdvance * 0.05) * ergoLine;
    
    // Soft knee compression
    col /= 1.0 + 0.35 * max(col.r, max(col.g, col.b));
    fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
