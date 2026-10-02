#version 330 core
out vec4 fragColor;   ///< The pixel's colour (output).
/**
 * @file GyroidMembraneMelt.frag
 * @brief TRANSITION GYROID MEMBRANE MELT: Triply periodic minimal surface (TPMS) gyroid transition.
 * A mathematical gyroid labyrinth surface divides space into two continuous
 * interlocking fluid channels, shifting its isovalue to smoothly transfer scenes.
 *   interpolation -> sweeps gyroid isovalue threshold from -1.4 to +1.4
 *   audioKick     -> flashes gyroid minimal surface nodal line boundaries
 *   audioSwell    -> undulates gyroid spatial labyrinth frequency
 *
 * Per-activation variety:
 *   gyroidP float gyroid spatial frequency & density (0.5..2.2)
 *   isoP    float membrane thickness & sharpness    (0.5..2.0)
 *   speedP  float animation speed multiplier        (0.5..2.0)
 *   hueP    float membrane glow hue offset          (0..6.28)
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

uniform float gyroidP;
uniform float isoP;
uniform float speedP;   ///< Speed knob, 0..1.
uniform float hueP;   ///< Hue knob (radians), usually the music's chroma hue plus a rolled offset.

/// @brief Rotates a colour's hue by an angle (about the grey axis).
vec3 hueRot(vec3 c, float a) {
    vec3 k = vec3(0.57735026919);
    float cs = cos(a), sn = sin(a);
    return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
}

/// @brief 2D rotation matrix.
mat2 rot2D(float a) {
    float c = cos(a), s = sin(a);
    return mat2(c, -s, s, c);
}

/// @brief Entry point of this shader stage (the file description says what it draws).
void main() {
    float gyr = (gyroidP > 0.0) ? gyroidP : 1.0;
    float iso = (isoP    > 0.0) ? isoP    : 1.0;
    float spd = (speedP  > 0.0) ? speedP  : 1.0;
    float hue = (hueP    > 0.0) ? hueP    : 0.0;

    vec2 uv = gl_FragCoord.xy / resolution.xy;
    vec2 p = (gl_FragCoord.xy - 0.5 * resolution) / resolution.y;

    float t = time * 0.0884 * spd;   // clock rate measured down to about 1.2/255 of change per frame (PresetEditor --transprofile); it spun many times that and read as frantic
    float tProg = clamp(interpolation, 0.0, 1.0);
    float midTransition = sin(tProg * 3.14159265);

    // 3D gyroid coordinates (x, y, z(t))
    vec3 q = vec3(p * 12.0 * gyr, t * 1.5);
    q.xy = rot2D(t * 0.2) * q.xy;

    // Gyroid implicit equation: sin(x)*cos(y) + sin(y)*cos(z) + sin(z)*cos(x)
    float g = sin(q.x) * cos(q.y) + sin(q.y) * cos(q.z) + sin(q.z) * cos(q.x);

    // Isovalue sweep.  The gyroid g lies in [-1.5, 1.5] and the wipe edge is
    // 0.2*iso wide, so the sweep must START above max(g)+edge and END below
    // min(g)-edge — the old -1.3..+1.3 range (and inverted direction) left
    // half the frame showing the wrong scene at BOTH fade endpoints.
    float targetIso = mix(2.0, -2.0, tProg);
    float distToSurface = g - targetIso;

    // Membrane normal displacement
    vec2 grad = vec2(cos(q.x) * cos(q.y) - sin(q.z) * sin(q.x),
                     -sin(q.x) * sin(q.y) + cos(q.y) * cos(q.z));
    vec2 disp = grad * 0.02 * midTransition * (1.0 + audioSwell * 0.6);

    vec4 c1 = texture(tex1, fract(uv + disp));
    vec4 c0 = texture(tex0, fract(uv - disp));

    float wipeMask = smoothstep(-0.2 * iso, 0.2 * iso, distToSurface);
    vec4 col = mix(c1, c0, wipeMask);

    // Glowing minimal surface boundary
    float surfaceGlow = exp(-abs(distToSurface) * 12.0 / iso) * midTransition;
    vec3 glowColor = mix(vec3(0.2, 0.9, 1.0), vec3(1.0, 0.4, 0.8), sin(q.z) * 0.5 + 0.5);
    col.rgb += surfaceGlow * glowColor * (1.4 + audioKick * 1.0);

    if (audioChromaHue != 0.0) col.rgb = hueRot(col.rgb, audioChromaHue * midTransition);
    if (hue > 0.001) col.rgb = hueRot(col.rgb, hue * midTransition);

    fragColor = col;
}
