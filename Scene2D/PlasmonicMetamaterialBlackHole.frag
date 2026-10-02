#version 330 core
out vec4 fragColor;   ///< The pixel's colour (output).
/**
 * @file PlasmonicMetamaterialBlackHole.frag
 * @brief PLASMONIC METAMATERIAL BLACK HOLE: Omnidirectional optical absorber in graded-index
 * metamaterials. Continuous radial variation of dielectric permittivity and magnetic permeability
 * curves light rays into logarithmic spiral orbits toward a central plasmonic absorbing core.
 *   audioAdvance -> rotates spiral Poynting vector energy trajectories towards core
 *   audioKick    -> flashes central plasmonic core resistive dissipation hot spots
 *   audioSwell   -> widens metamaterial gradient trapping radius & Poynting streamline glow
 *   audioCentroid-> shifts transformation optics dielectric dispersion spectra
 *   audioSubBass -> deepens central optical trap absorption null depth
 *
 * Per-activation variety:
 *   trapRadiusP  float graded-index metamaterial outer trap radius (0.6..1.6)
 *   spiralCurlP  float logarithmic ray-bending curvature         (2.0..6.0)
 *   absorberP    float central plasmonic core absorption gain     (0.8..2.5)
 *   poyntingP    float Poynting vector streamline ripple density  (8.0..24.0)
 */

uniform vec2  resolution;   ///< Size of the render target in pixels.
uniform float time;   ///< Seconds since the program started (never reset; see sceneTime).
uniform sampler2D tex0;   ///< The current photo.
uniform sampler2D tex1;   ///< The next photo (cross-faded in by interpolation).
uniform float interpolation;   ///< Cross-fade between the photos: 1 = tex0, 0 = tex1.

uniform float audioPhase;   ///< Rotation phase driven by the music (integrated, never jumps).
uniform float audioAdvance;   ///< The music's advance: integrated tempo-weighted energy (never jumps, never runs backwards).
uniform float audioSwell;   ///< Slow loudness envelope, 0..1 (seconds).
uniform float audioLevel;   ///< Overall loudness, 0..1.
uniform float audioKick;   ///< Kick-drum envelope, 0..1 (fast attack, short decay).
uniform float audioCentroid;   ///< Spectral centroid (brightness of the sound), 0..1.
uniform float audioValence;   ///< Mood valence: 0 dark .. 1 bright.
uniform float audioChromaHue;   ///< Hue of the dominant pitch class (radians, unwrapped: continuous).
uniform float audioSubBass;   ///< Sub-bass band level, 0..1.
uniform float audioBass;   ///< Bass band level, 0..1.
uniform float audioMid;   ///< Mid band level, 0..1.
uniform float audioHigh;   ///< High band level, 0..1.
uniform float audioFlux;   ///< Spectral flux (how fast the spectrum changes), 0..1.

uniform float trapRadiusP;
uniform float spiralCurlP;
uniform float absorberP;
uniform float poyntingP;

/// @brief The photo at a coordinate: the cross-fade of tex0 and tex1.
vec3 img(vec2 uv) {
    return (interpolation * texture(tex0, uv) + (1.0 - interpolation) * texture(tex1, uv)).rgb;
}

/// @brief The house palette: a colour of the photo on an arc that turns with the music's hue.
vec3 imgPalette(float t)
{
    float ang = audioChromaHue + audioAdvance * 0.04 + t * 6.2831853;
    float rad = 0.16 + 0.08 * sin(audioAdvance * 0.013);
    vec3  col = img(clamp(vec2(0.5) + rad * vec2(cos(ang), sin(ang)), 0.0, 1.0));
    float g   = dot(col, vec3(0.333));
    return mix(vec3(g), col, 0.55 + 0.45 * audioValence);
}

/// @brief Entry point of this shader stage (the file description says what it draws).
void main()
{
    vec2 uv = (gl_FragCoord.xy - 0.5 * resolution) / min(resolution.x, resolution.y);
    float t = time * 0.4 + audioAdvance * 0.35;
    
    float r = length(uv);
    float theta = atan(uv.y, uv.x);
    
    // Graded refractive index profile: n(r) = (R_out / r)^2 inside trap radius
    float rOut = (trapRadiusP > 0.01 ? trapRadiusP : 0.85) * (0.9 + 0.2 * audioSwell);
    float rCore = 0.15 * (1.0 + 0.2 * audioSubBass);
    
    // Logarithmic spiral light bending rays: r = r0 * exp(-k * theta)
    float kCurl = (spiralCurlP > 0.01 ? spiralCurlP : 3.5);
    float spiralPhase = theta * 6.0 + log(max(r, 0.01)) * kCurl - t * 3.5 + audioPhase;
    
    // Poynting energy flow streamlines
    float pFreq = (poyntingP > 0.01 ? poyntingP : 16.0);
    float poyntingWaves = sin(spiralPhase) * 0.5 + 0.5;
    
    // Inward spiral wave intensity
    float inTrap = smoothstep(rOut + 0.05, rOut - 0.05, r);
    float spiralStream = poyntingWaves * inTrap;
    
    // Central plasmonic absorbing core (Joule heating hot spot)
    float coreAbsorption = exp(-r * r * 45.0) * (1.0 + 4.0 * audioKick) * (absorberP > 0.01 ? absorberP : 1.3);
    
    // Optical trap boundary ring
    float trapBoundary = exp(-abs(r - rOut) * 25.0);
    
    // Full absorption shadow in innermost center
    float centerShadow = smoothstep(0.04, rCore, r);
    
    // Palette assignment
    float palAngle = fract(spiralPhase * 0.159 + r * 0.3 + audioCentroid);
    vec3 colRay  = imgPalette(palAngle);
    vec3 colCore = imgPalette(fract(palAngle + 0.5)) * 2.2;
    
    // Background photo sampling
    vec2 bgUv = gl_FragCoord.xy / resolution;
    vec3 bg = img(bgUv) * 0.25;
    
    vec3 col = bg * centerShadow;
    col += colRay * spiralStream * centerShadow * (0.8 + 0.4 * audioSwell) * 1.8;
    col += colCore * coreAbsorption * 2.5;
    col += vec3(0.9, 0.95, 1.0) * trapBoundary * 1.6;
    col += colRay * (audioKick * 0.35);
    
    // Soft knee compression
    col /= 1.0 + 0.35 * max(col.r, max(col.g, col.b));
    fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
