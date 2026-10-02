#version 330 core
out vec4 fragColor;   ///< The pixel's colour (output).
/**
 * @file SmokeTurbulenceDrift.frag
 * @brief TRANSITION SMOKE TURBULENCE DRIFT: Atmospheric smoke and turbulent vapor transition.
 * Volumetric smoke plumes billow across the viewport, catching soft light
 * scattering and dissolving the outgoing scene into the incoming one.
 *   interpolation -> drives smoke density buildup & atmospheric dissipation
 *   audioKick     -> flashes forward light scattering through the smoke
 *   audioSwell    -> drives turbulent smoke eddy swirl radius
 *
 * Per-activation variety:
 *   smokeP float smoke density & curl turbulence scale (0.5..2.2)
 *   driftP float upward buoyancy drift speed            (0.5..2.0)
 *   speedP float animation speed multiplier             (0.5..2.0)
 *   hueP   float smoke atmospheric tint hue offset      (0..6.28)
 */

uniform vec2  resolution;   ///< Size of the render target in pixels.
uniform float time;   ///< Seconds since the program started (never reset; see sceneTime).
uniform sampler2D tex0;   ///< The current photo.
uniform sampler2D tex1;   ///< The next photo (cross-faded in by interpolation).
uniform float interpolation;   ///< Cross-fade between the photos: 1 = tex0, 0 = tex1.

uniform float audioPhase;   ///< Rotation phase driven by the music (integrated, never jumps).
uniform float audioAdvance;   ///< The music's advance: integrated tempo-weighted energy (never jumps, never runs backwards).
uniform float audioSwell;   ///< slow loudness swell: the only envelope allowed to shape geometry
uniform float audioKick;   ///< Kick-drum envelope, 0..1 (fast attack, short decay).
uniform float audioCentroid;   ///< Spectral centroid (brightness of the sound), 0..1.
uniform float audioValence;   ///< Mood valence: 0 dark .. 1 bright.
uniform float audioSubBass;   ///< Sub-bass band level, 0..1.
uniform float audioBass;   ///< Bass band level, 0..1.
uniform float audioMid;   ///< Mid band level, 0..1.
uniform float audioHigh;   ///< High band level, 0..1.
uniform float audioFlux;   ///< Spectral flux (how fast the spectrum changes), 0..1.
uniform float audioChromaHue;   ///< Hue of the dominant pitch class (radians, unwrapped: continuous).

uniform float smokeP;
uniform float driftP;
uniform float speedP;   ///< Speed knob, 0..1.
uniform float hueP;   ///< Hue knob (radians), usually the music's chroma hue plus a rolled offset.

/// @brief Rotates a colour's hue by an angle (about the grey axis).
vec3 hueRot(vec3 c, float a) {
    vec3 k = vec3(0.57735026919);
    float cs = cos(a), sn = sin(a);
    return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
}

/// @brief Pseudo-random number 0..1 from a 2D point.
float hash21(vec2 p) {
    p = fract(p * vec2(523.34, 825.21));
    p += dot(p, p + 41.32);
    return fract(p.x * p.y);
}

/// @brief Smooth value noise.
float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(
        mix(hash21(i + vec2(0.0, 0.0)), hash21(i + vec2(1.0, 0.0)), u.x),
        mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), u.x),
        u.y
    );
}

/// @brief Fractal noise: octaves of value noise.
float fbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 4; ++i) {
        v += a * noise(p);
        p = p * 2.0 + vec2(100.0);
        a *= 0.5;
    }
    return v;
}

/// @brief Entry point of this shader stage (the file description says what it draws).
void main() {
    float smk = (smokeP > 0.0) ? smokeP : 1.0;
    float drf = (driftP > 0.0) ? driftP : 1.0;
    float spd = (speedP > 0.0) ? speedP : 1.0;
    float hue = (hueP   > 0.0) ? hueP   : 0.0;

    vec2 uv = gl_FragCoord.xy / resolution.xy;
    vec2 p = (gl_FragCoord.xy - 0.5 * resolution) / resolution.y;

    float t = time * 0.102 * spd;   // clock rate measured down to about 1.2/255 of change per frame (PresetEditor --transprofile); it spun many times that and read as frantic
    float tProg = clamp(interpolation, 0.0, 1.0);
    float midTransition = sin(tProg * 3.14159265);

    // Multi-layered billowing smoke fBM
    vec2 smokeUV = p * 4.0 * smk + vec2(0.0, -t * 1.2 * drf);
    float smoke1 = fbm(smokeUV);
    float smoke2 = fbm(smokeUV * 2.0 + vec2(smoke1, -t * 0.8));
    float smokeDensity = smoke2 * midTransition;

    // Fluid smoke displacement
    vec2 smokeDisp = vec2(smoke1 - 0.5, smoke2 - 0.5) * 0.05 * midTransition * (1.0 + audioSwell * 0.6);

    vec4 c1 = texture(tex1, fract(uv + smokeDisp));
    vec4 c0 = texture(tex0, fract(uv - smokeDisp));

    vec4 col = mix(c1, c0, tProg);

    // Smoke occludes rather than adds: fog-blend the scene toward the smoke
    // colour (the old pure add at kick gain ~3x overexposed the frame), then
    // a small scatter add lets kicks light the plumes from within.
    vec3 smokeGlow = mix(vec3(0.3, 0.4, 0.6), vec3(0.9, 0.85, 0.8), smokeDensity);
    float dens = clamp(smokeDensity, 0.0, 1.0);
    col.rgb = mix(col.rgb, smokeGlow, dens * 0.55);
    col.rgb += dens * dens * smokeGlow * (0.08 + audioKick * 0.15);

    if (audioChromaHue != 0.0) col.rgb = hueRot(col.rgb, audioChromaHue * midTransition);
    if (hue > 0.001) col.rgb = hueRot(col.rgb, hue * midTransition);

    fragColor = col;
}
