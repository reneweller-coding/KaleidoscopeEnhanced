#version 330 core
out vec4 fragColor;   ///< The pixel's colour (output).
/**
 * @file PyroclasticDensityCurrentSurge.frag
 * @brief PYROCLASTIC DENSITY CURRENT SURGE: Supersonic fluidized volcanic ash-gas avalanche.
 * Billowing turbulent shear lobes, internal incandescent pumice blocks, triboelectric
 * friction lightning sparks, and thick ash-cloud photo obscuration across the screen.
 *   audioAdvance -> drives turbulent ash surge avalanche roll & vortex cascades
 *   audioKick    -> ignites internal triboelectric ash lightning & explosive gas expansions
 *   audioBass    -> undulates ground shockwaves & rolling pumice density
 *   audioSwell   -> thickens incandescent thermal glow from internal volcanic gas
 *   audioCentroid-> shifts magma incandescent heat spectra (amber to white-hot)
 *
 * Per-activation variety:
 *   vortexP  float turbulent lobe vortex complexity         (0.6..2.2)
 *   glowP    float incandescent interior lava glow          (0.8..2.5)
 *   sparkP   float triboelectric lightning spark density    (1.0..3.5)
 *   ashP     float ash opacity & billowing cloud density    (0.8..2.2)
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

uniform float vortexP;
uniform float glowP;   ///< Glow / afterglow knob, 0..1.
uniform float sparkP;
uniform float ashP;

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

float hash(vec2 p) {
    p = fract(p * vec2(234.34, 435.345));
    p += dot(p, p + 34.23);
    return fract(p.x * p.y);
}

/// @brief Entry point of this shader stage (the file description says what it draws).
void main()
{
    vec2 uv = (gl_FragCoord.xy - 0.5 * resolution) / min(resolution.x, resolution.y);
    float t = time * 0.45 + audioAdvance * 0.35;
    
    // Avalanche rolling coordinates
    vec2 p = uv * 2.2;
    p.y += t * 0.5;
    
    float vortexScale = (vortexP > 0.01 ? vortexP : 1.2);
    
    // Multi-scale turbulent boiling lobes (curl-noise-like vortices)
    float turb = 0.0;
    float amp = 0.6;
    vec2 q = p * vortexScale;
    
    for (int i = 0; i < 4; i++) {
        vec2 curl = vec2(sin(q.y * 2.5 + t * 0.8), cos(q.x * 2.5 - t * 0.8));
        q = q * 1.8 + curl * 0.6;
        turb += amp * (sin(q.x) * cos(q.y));
        amp *= 0.5;
    }
    
    // Cloud density & billowing lobes
    float ashDensity = (ashP > 0.01 ? ashP : 1.2);
    float cloud = clamp(turb * 0.5 + 0.5, 0.0, 1.0) * ashDensity;
    
    // Internal incandescent magma heat pockets (seen where cloud is thinner or fractured)
    float heat = clamp(sin(q.x * 1.5 + t) * cos(q.y * 1.5 - t * 0.7) * 1.5 - 0.2, 0.0, 1.0);
    float internalGlow = pow(heat, 2.5) * (glowP > 0.01 ? glowP : 1.5) * (0.8 + 0.8 * audioSwell);
    
    // Triboelectric volcanic friction sparks & lightning channels
    float sparkDensity = 25.0 * (sparkP > 0.01 ? sparkP : 1.5);
    vec2 sparkCell = floor(q * sparkDensity);
    float h = hash(sparkCell);
    float spark = pow(max(0.0, sin(h * 6.28 + t * 8.0 + audioFlux * 5.0)), 16.0);
    spark *= smoothstep(0.3, 0.9, cloud) * (0.6 + 3.0 * audioKick);
    
    // Ash & incandescence color palettes
    vec3 coldAsh = vec3(0.08, 0.07, 0.09);
    vec3 hotLava = vec3(1.0, 0.35, 0.05);
    vec3 whiteHeat = vec3(1.0, 0.9, 0.6);
    
    vec3 ashCol = palTint(mix(coldAsh, vec3(0.18, 0.15, 0.17), cloud), 0.1, 0.22);
    vec3 lavaCol = palTint(mix(hotLava, whiteHeat, sin(audioCentroid * 3.14) * 0.5 + 0.5), heat * 0.3, 0.25);
    vec3 sparkCol = palTint(vec3(0.8, 0.9, 1.0), audioCentroid, 0.2);
    
    // Background photo texture
    vec2 bgUv = gl_FragCoord.xy / resolution;
    vec3 bg = img(bgUv) * 0.2;
    
    vec3 col = bg;
    col += ashCol * cloud * 1.4;
    col += lavaCol * internalGlow * 2.2;
    col += sparkCol * spark * 2.8;
    col += lavaCol * (audioKick * 0.35);
    
    // Soft knee compression
    col /= 1.0 + 0.35 * max(col.r, max(col.g, col.b));
    fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
