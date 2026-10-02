#version 330 core
out vec4 fragColor;   ///< The pixel's colour (output).
/**
 * @file NavierStokesMelt.frag
 * @brief TRANSITION NAVIER STOKES MELT: Fluid advection vorticity melting transition.
 * The outgoing scene liquifies into turbulent curl-noise fluid vortices,
 * melting and swirling seamlessly to reveal the incoming scene underneath.
 *   interpolation -> drives fluid viscosity reduction & melting progress
 *   audioKick     -> injects turbulent fluid velocity impulses
 *   audioSwell    -> undulates large-scale convective vortex rolls
 *
 * Per-activation variety:
 *   viscP   float fluid viscosity & curl noise scale (0.5..2.2)
 *   vortexP float vorticity spin intensity          (0.5..2.0)
 *   speedP  float advection velocity multiplier      (0.5..2.0)
 *   hueP    float fluid highlight hue offset         (0..6.28)
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

uniform float viscP;
uniform float vortexP;
uniform float speedP;   ///< Speed knob, 0..1.
uniform float hueP;   ///< Hue knob (radians), usually the music's chroma hue plus a rolled offset.

/// @brief Rotates a colour's hue by an angle (about the grey axis).
vec3 hueRot(vec3 c, float a) {
    vec3 k = vec3(0.57735026919);
    float cs = cos(a), sn = sin(a);
    return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
}

/// 2D Curl Noise helper
float hash21(vec2 p) {
    p = fract(p * vec2(443.34, 755.21));
    p += dot(p, p + 54.32);
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

vec2 curlNoise(vec2 p) {
    float eps = 0.01;
    float n1 = noise(p + vec2(0.0, eps));
    float n2 = noise(p - vec2(0.0, eps));
    float n3 = noise(p + vec2(eps, 0.0));
    float n4 = noise(p - vec2(eps, 0.0));
    return vec2((n1 - n2) / (2.0 * eps), -(n3 - n4) / (2.0 * eps));
}

/// @brief Entry point of this shader stage (the file description says what it draws).
void main() {
    float vsc = (viscP   > 0.0) ? viscP   : 1.0;
    float vrt = (vortexP > 0.0) ? vortexP : 1.0;
    float spd = (speedP  > 0.0) ? speedP  : 1.0;
    float hue = (hueP    > 0.0) ? hueP    : 0.0;

    vec2 uv = gl_FragCoord.xy / resolution.xy;
    vec2 p = (gl_FragCoord.xy - 0.5 * resolution) / resolution.y;

    float t = time * 0.1075 * spd;   // clock rate measured down to about 1.2/255 of change per frame (PresetEditor --transprofile); it spun many times that and read as frantic
    float tProg = clamp(interpolation, 0.0, 1.0);
    float midTransition = sin(tProg * 3.14159265);

    // Multi-octave curl noise advection
    vec2 curl = curlNoise(p * 5.0 * vsc + vec2(t * 0.5, -t * 0.3)) * 0.04;
    curl += curlNoise(p * 12.0 * vsc - vec2(t * 0.8, t * 0.6)) * 0.02;
    curl *= midTransition * vrt * (1.0 + audioSwell * 0.8);

    vec4 c1 = texture(tex1, fract(uv + curl));
    vec4 c0 = texture(tex0, fract(uv - curl));

    vec4 col = mix(c1, c0, tProg);

    // Liquid specular highlight -- capped: curl magnitude reaches ~0.5 at
    // audio-hot, so the old *15 gain pushed the add to ~25x and blew the
    // whole frame out.
    float liquidGlint = min(length(curl) * 2.0, 0.5) * midTransition;
    col.rgb += liquidGlint * vec3(0.2, 0.85, 1.0) * (0.4 + audioKick * 0.4);

    if (audioChromaHue != 0.0) col.rgb = hueRot(col.rgb, audioChromaHue * midTransition);
    if (hue > 0.001) col.rgb = hueRot(col.rgb, hue * midTransition);

    fragColor = col;
}
