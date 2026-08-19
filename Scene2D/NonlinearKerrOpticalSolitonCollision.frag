#version 330 core
out vec4 fragColor;
/**
 * @file NonlinearKerrOpticalSolitonCollision.frag
 * @brief NONLINEAR KERR OPTICAL SOLITON COLLISION: Spatial optical solitons in a self-focusing
 * Kerr medium. Stable self-trapped wavepackets undergo elastic and inelastic collisions,
 * generating four-wave mixing fringes, dispersive shock waves, and photo-derived optical spectra.
 *   audioAdvance -> propels spatial soliton trajectories towards collision center
 *   audioKick    -> flashes nonlinear four-wave mixing energy peak detonation
 *   audioSwell   -> thickens self-focusing Kerr waveguide channel width
 *   audioCentroid-> shifts self-phase modulation dispersion colors
 *   audioMid     -> excites dispersive radiation ripples escaping the collision
 *
 * Per-activation variety:
 *   solitonCountP float number of converging optical solitons     (2.0..6.0)
 *   kerrNonlinP   float nonlinear self-focusing intensity        (0.6..2.2)
 *   shockP        float dispersive shockwave ripple frequency    (8.0..24.0)
 *   crossPhaseP   float cross-phase modulation interaction scale (0.5..2.0)
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

uniform float solitonCountP;
uniform float kerrNonlinP;
uniform float shockP;
uniform float crossPhaseP;

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
    float t = time * 0.45 + audioAdvance * 0.35;
    
    float numSolitons = (solitonCountP > 1.0 ? solitonCountP : 4.0);
    float kerr = (kerrNonlinP > 0.01 ? kerrNonlinP : 1.3) * (0.8 + 0.4 * audioSwell);
    
    vec3 accCol = vec3(0.0);
    float totalIntensity = 0.0;
    
    // Simulate multiple colliding sech(x) spatial solitons
    for (float i = 0.0; i < 4.0; i += 1.0) {
        if (i >= numSolitons) break;
        
        float angle = i * (6.2831853 / numSolitons) + audioPhase * 0.2;
        vec2 dir = vec2(cos(angle), sin(angle));
        vec2 normal = vec2(-sin(angle), cos(angle));
        
        // Oscillating trajectory passing through origin
        float progress = sin(t * 0.8 + i * 1.57);
        vec2 solitonCenter = dir * (progress * 0.85);
        
        vec2 diff = uv - solitonCenter;
        float longDist = dot(diff, dir);
        float perpDist = dot(diff, normal);
        
        // Sech(x) envelope profile: 1 / cosh(x)
        float envelope = 1.0 / cosh(perpDist * 9.0 * kerr);
        float pulse    = exp(-longDist * longDist * 16.0);
        
        float solIntensity = envelope * pulse;
        totalIntensity += solIntensity;
        
        // Self-phase modulation carrier wave
        float spmPhase = longDist * 20.0 + t * 4.0 * (1.0 + i * 0.2);
        float carrier = sin(spmPhase) * 0.5 + 0.5;
        
        vec3 solCol = imgPalette(fract(i * 0.25 + t * 0.05 + audioCentroid));
        accCol += solCol * solIntensity * (0.6 + 0.4 * carrier);
    }
    
    // Four-wave mixing & nonlinear collision core flash (at origin)
    float r = length(uv);
    float collisionCore = exp(-r * r * 25.0) * pow(totalIntensity, 1.8) * (1.0 + 4.0 * audioKick);
    
    // Dispersive shock wave radiation ripples
    float shockFreq = (shockP > 0.01 ? shockP : 14.0);
    float shockWaves = sin(r * shockFreq - t * 5.0) * exp(-r * 2.5) * (0.4 + 1.2 * audioMid);
    
    // Background photo sampling
    vec2 bgUv = gl_FragCoord.xy / resolution;
    vec3 bg = img(bgUv) * 0.25;
    
    vec3 col = bg;
    col += accCol * 1.8;
    col += imgPalette(t * 0.1) * collisionCore * 2.5;
    col += imgPalette(fract(r * 0.3 + 0.5)) * abs(shockWaves) * 1.5;
    col += imgPalette(audioCentroid) * (audioKick * 0.35);
    
    // Soft knee compression
    col /= 1.0 + 0.35 * max(col.r, max(col.g, col.b));
    fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
