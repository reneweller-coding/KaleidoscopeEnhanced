#version 330 core
out vec4 fragColor;   ///< The pixel's colour (output).
/**
 * @file VolcanicLightningAshColumn.frag
 * @brief VOLCANIC LIGHTNING ASH COLUMN: Plinian volcanic eruption column. Boiling turbulent
 * tephra ash vortices rise violently, triboelectrically charging to gigavolt potentials and
 * discharging in thousands of branching volcanic lightning bolts, incandescent lava bombs, and glow.
 *   audioAdvance -> churns convective ash plume turbulence & upward eruption velocity
 *   audioKick    -> detonates explosive volcanic lightning flash discharges & magma sparks
 *   audioBass    -> rumbles deep infrasonic volcanic crater pressure & incandescent lava glow
 *   audioSwell   -> widens tephra ash plume umbrella & smoke density
 *   audioCentroid-> shifts magma thermal emission spectra (ember to brilliant violet-white)
 *
 * Per-activation variety:
 *   ashTurbP     float ash plume turbulent vortex frequency     (3.0..8.0)
 *   boltBranchP  float lightning fractal branching density      (1.0..3.5)
 *   magmaGlowP   float crater incandescent magma glow luminance (0.8..2.5)
 *   smokeDensP   float tephra cloud opacity & billow thickness  (0.6..2.0)
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

uniform float ashTurbP;
uniform float boltBranchP;
uniform float magmaGlowP;
uniform float smokeDensP;

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

/// @brief Tints a colour toward the house palette at t, keeping its brightness.
vec3 palTint(vec3 c, float t, float k)
{
    vec3 tp = imgPalette(t);
    tp *= dot(c, vec3(0.3333)) / max(dot(tp, vec3(0.3333)), 1e-3);
    return mix(c, tp, k);
}

/// @brief Entry point of this shader stage (the file description says what it draws).
void main()
{
    vec2 uv = (gl_FragCoord.xy - 0.5 * resolution) / min(resolution.x, resolution.y);
    float t = time * 0.45 + audioAdvance * 0.4;
    
    // Convective ash column expanding upward from bottom crater
    float h = uv.y + 0.6;
    float colWidth = 0.18 + h * 0.45 * (0.85 + 0.3 * audioSwell);
    
    // Turbulent billowing vortices
    float turbFreq = (ashTurbP > 0.01 ? ashTurbP : 5.0);
    vec2 turbP = vec2(uv.x * turbFreq, uv.y * turbFreq - t * 2.0);
    float ashBillow = sin(turbP.x * 2.0 + sin(turbP.y * 1.5)) * cos(turbP.y * 2.0 - turbP.x);
    ashBillow += sin(turbP.x * 4.0 - turbP.y * 3.0) * 0.35;
    
    float dx = abs(uv.x + ashBillow * 0.08);
    float inPlume = smoothstep(colWidth + 0.1, colWidth - 0.05, dx) * smoothstep(-0.6, -0.4, uv.y);
    
    // Volcanic lightning fractal branching discharge
    float bDensity = (boltBranchP > 0.01 ? boltBranchP : 2.0);
    float boltPath1 = sin(uv.y * 14.0 * bDensity + t * 5.0) * 0.12 + sin(uv.y * 28.0) * 0.04;
    float boltPath2 = cos(uv.y * 18.0 * bDensity - t * 4.0) * 0.14 + sin(uv.y * 35.0) * 0.03;
    
    float bolt1 = exp(-abs(uv.x - boltPath1) * 60.0);
    float bolt2 = exp(-abs(uv.x - boltPath2) * 55.0);
    
    // Lightning stroke flash on kick
    float lightningFlash = (bolt1 + bolt2) * (1.0 + 4.5 * audioKick);
    
    // Incandescent crater magma glow at bottom
    float craterDist = length(vec2(uv.x, uv.y + 0.55));
    float magmaCore = exp(-craterDist * 6.0) * (1.0 + 0.6 * audioBass) * (magmaGlowP > 0.01 ? magmaGlowP : 1.5);
    
    // Flying incandescent tephra sparks & lava bombs
    float spark = pow(max(0.0, sin(uv.x * 35.0 - uv.y * 25.0 + t * 6.0 + audioFlux * 3.0)), 16.0);
    
    // Color palettes: Dark basalt ash tinted by photo, incandescent orange magma, electric cyan lightning
    vec3 ashDark    = vec3(0.12, 0.11, 0.14);
    vec3 magmaColor = vec3(1.0, 0.35, 0.05);
    vec3 boltColor  = vec3(0.75, 0.9, 1.0);
    
    vec3 ashCol = palTint(ashDark, uv.y * 0.2 + audioCentroid, 0.2);
    vec3 magCol = palTint(magmaColor, uv.x * 0.3 + audioCentroid, 0.25);
    
    // Background photo sampling
    vec2 bgUv = gl_FragCoord.xy / resolution;
    vec3 bg = img(bgUv) * 0.2;
    
    vec3 col = bg;
    col += ashCol * inPlume * (0.6 + 0.4 * ashBillow) * (smokeDensP > 0.01 ? smokeDensP : 1.2);
    col += magCol * magmaCore * 2.2;
    col += boltColor * lightningFlash * 2.5;
    col += magCol * spark * 2.0;
    col += magCol * (audioKick * 0.35);
    
    // Soft knee compression
    col /= 1.0 + 0.35 * max(col.r, max(col.g, col.b));
    fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
