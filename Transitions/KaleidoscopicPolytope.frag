#version 330 core
out vec4 fragColor;   ///< The pixel's colour (output).
/**
 * @file KaleidoscopicPolytope.frag
 * @brief TRANSITION KALEIDOSCOPIC POLYTOPE: Coxeter reflection group 4D polytope transition.
 * Multiple hyper-plane reflection mirrors fold and unfurl space across regular
 * Coxeter symmetry facets, tessellating and transitioning between scenes.
 *   interpolation -> sweeps kaleidoscopic fold angle & facet recursion
 *   audioKick     -> flashes mirror facet intersection reflection planes
 *
 * Per-activation variety:
 *   mirrorP float reflection symmetry folding order   (0.5..2.2)
 *   foldP   float facet fold depth & displacement    (0.5..2.0)
 *   speedP  float animation speed multiplier         (0.5..2.0)
 *   hueP    float kaleidoscopic facet hue offset     (0..6.28)
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

uniform float mirrorP;
uniform float foldP;   ///< Fold knob, 0..1.
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
    float mir = (mirrorP > 0.0) ? mirrorP : 1.0;
    float fld = (foldP   > 0.0) ? foldP   : 1.0;
    float spd = (speedP  > 0.0) ? speedP  : 1.0;
    float hue = (hueP    > 0.0) ? hueP    : 0.0;

    vec2 uv = gl_FragCoord.xy / resolution.xy;
    vec2 p = (gl_FragCoord.xy - 0.5 * resolution) / resolution.y;

    float t = time * 0.0295 * spd;   // clock rate measured down to about 1.2/255 of change per frame (PresetEditor --transprofile); it spun many times that and read as frantic
    float tProg = clamp(interpolation, 0.0, 1.0);
    float midTransition = sin(tProg * 3.14159265);

    // Coxeter folding planes
    vec2 q = p;
    float mirrorDist = 1.0;

    float foldAngle = (tProg * 1.5707963 + t * 0.2) * mir;

    // The Coxeter breathing radius (the fold offset) follows the progress only:
    // folded four times, any envelope on it re-laid the whole mirror.  The
    // offset already carries midTransition, so it collapses to exactly 0 at
    // both fade endpoints, where warpUV is blended out by midTransition too.
    float breathe = 0.25 * fld * midTransition * 1.35;   // constant: this amplitude is wrapped by fract(), so any envelope reshuffled the frame (speed pass 14.09.2026)

    for (int i = 0; i < 4; ++i) {
        q = abs(q) - breathe;
        q = rot2D(foldAngle) * q;
        mirrorDist = min(mirrorDist, min(abs(q.x), abs(q.y)));
    }

    vec2 warpUV = (q * resolution.y + 0.5 * resolution) / resolution;

    vec4 c1 = texture(tex1, fract(mix(uv, warpUV, midTransition)));
    vec4 c0 = texture(tex0, fract(mix(warpUV, uv, 1.0 - midTransition)));

    vec4 col = mix(c1, c0, tProg);

    // Glowing mirror intersection lines
    float lineGlow = exp(-mirrorDist * 40.0) * midTransition;
    vec3 mirrorColor = 0.5 + 0.5 * cos(vec3(0.0, 2.0, 4.0) + length(q) * 15.0 + audioPhase);
    col.rgb += lineGlow * mirrorColor * (1.3 + audioKick * 1.0);

    if (audioChromaHue != 0.0) col.rgb = hueRot(col.rgb, audioChromaHue * midTransition);
    if (hue > 0.001) col.rgb = hueRot(col.rgb, hue * midTransition);

    fragColor = col;
}
