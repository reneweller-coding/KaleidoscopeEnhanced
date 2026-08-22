#version 330 core
out vec4 fragColor;
/**
 * @file WormholeTransit.frag
 * @brief WORMHOLE TRANSIT: High-speed passage through a spacetime conduit.
 * The walls of the wormhole are formed by intense gravitational lensing of 
 * background galaxies and exotic energy phenomena.
 *   audioAdvance -> speed of travel through the wormhole
 *   audioKick    -> flashes of exotic matter and energy pulses
 *   audioSwell   -> tunnel expansion and contraction
 *   audioPhase   -> rotation of the tunnel
 *   audioChromaHue-> energy colors follow the musical key
 *
 * Per-activation variety:
 *   warpP float intensity of the spacetime distortion (0.7..1.5)
 *   glowP float energy pulse brightness (0.6..1.8)
 *   speedP float base travel speed (0.5..1.5)
 *   hueP float palette offset (0..6.28)
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

uniform float warpP;
uniform float glowP;
uniform float speedP;
uniform float hueP;

vec3 img(vec2 uv) {
    return (interpolation * texture(tex0, uv) + (1.0 - interpolation) * texture(tex1, uv)).rgb;
}

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

mat2 rot(float a) {
    float c = cos(a), s = sin(a);
    return mat2(c, -s, s, c);
}

void main()
{
    float wp = (warpP > 0.01 ? warpP : 1.0);
    float glw = (glowP > 0.01 ? glowP : 1.0);
    float spP = (speedP > 0.01 ? speedP : 1.0);
    float hue = (hueP > 0.01 ? hueP : 0.0);

    vec2 uv = (gl_FragCoord.xy - 0.5 * resolution) / resolution.y;

    float t = time * 0.5 * spP + audioAdvance * 1.5;
    
    // Polar coordinates
    vec2 p = uv;
    float r = length(p);
    float a = atan(p.y, p.x);
    
    // Base tunnel distortion.  The denominator can reach exactly zero when
    // r->0 and the sine term hits -1 simultaneously (0.1 - 0.1); a max()
    // floor keeps tunnelZ from spiking to a huge, unstable value at that
    // coincidence -- the measured cause of this scene's one-frame jump=256
    // luma spike.
    float tunnelZ = 1.0 / max(r + 0.1 + 0.1 * sin(t * 0.2 + audioSwell * 0.5), 0.06);
    
    // Create the twisting effect
    float tw = a + tunnelZ * (0.5 * wp) + audioPhase * 0.5 + t * 0.1;
    
    // Ray coordinate in the tunnel
    vec2 tu = vec2(tw, tunnelZ - t);
    
    // Sample "exotic energy" patterns using sine waves and palettes
    float energy = sin(tu.x * 6.0) * cos(tu.y * 3.0);
    energy += sin(tu.x * 12.0 + t) * cos(tu.y * 5.0 - t * 2.0) * 0.5;
    energy += sin(tu.x * 3.0 - t * 0.5) * cos(tu.y * 10.0 + t * 3.0) * 0.25;
    
    // Add pulsing kicks
    float pulse = exp(-fract(tu.y * 0.5 - t * 2.0) * 5.0) * audioKick * 2.0;
    
    // Horizon glow
    float horizon = smoothstep(0.0, 0.4, r) * smoothstep(1.0, 0.4, r);
    
    // Color mapping
    vec3 c1 = imgPalette(0.1 + audioCentroid * 0.2);
    vec3 c2 = imgPalette(0.7 + audioKick * 0.1);
    
    float intensity = smoothstep(-0.5, 1.5, energy);
    vec3 col = mix(c1, c2, intensity);
    
    // Apply brightness
    col *= (0.3 + 0.7 * intensity + pulse) * horizon * glw * wp;
    
    // Center singularity hole
    col *= smoothstep(0.02, 0.15, r);
    
    // Add some "stars" or debris flying past
    float debris = sin(tu.x * 40.0) * cos(tu.y * 40.0);
    debris = smoothstep(0.9, 1.0, debris);
    col += c2 * debris * (1.0 + audioKick * 2.0) * horizon * glw;

    if (hue > 0.001) col = hueRot(col, 0.2 * sin(hue));

    // Soft-knee exposure
    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
