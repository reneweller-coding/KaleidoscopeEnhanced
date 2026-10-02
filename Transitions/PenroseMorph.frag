#version 330 core
out vec4 fragColor;   ///< The pixel's colour (output).
/**
 * @file PenroseMorph.frag
 * @brief TRANSITION PENROSE MORPH: 5-fold aperiodic Penrose tiling morphing between
 * scenes through recursive golden-ratio deflation (phi = 1.618). Kite and dart
 * tiles subdivide smoothly, with glowing aperiodic grid lines guiding the cross-fade.
 *   interpolation -> drives recursive deflation hierarchy & scene swap
 *   audioKick     -> flashes 5-fold golden ratio reflection lines
 *
 * Per-activation variety:
 *   tileP  float Penrose tiling grid density     (0.5..2.2)
 *   foldP  float 5-fold folding symmetry depth   (0.5..2.0)
 *   speedP float animation speed multiplier      (0.5..2.0)
 *   hueP   float grid glow hue offset            (0..6.28)
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

uniform float tileP;
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
    float til = (tileP  > 0.0) ? tileP  : 1.0;
    float fld = (foldP  > 0.0) ? foldP  : 1.0;
    float spd = (speedP > 0.0) ? speedP : 1.0;
    float hue = (hueP   > 0.0) ? hueP   : 0.0;

    vec2 uv = gl_FragCoord.xy / resolution.xy;
    vec2 p = (gl_FragCoord.xy - 0.5 * resolution) / resolution.y * (3.0 * til);

    float t = time * 0.1338 * spd;   // clock rate measured down to about 1.2/255 of change per frame (PresetEditor --transprofile); it spun many times that and read as frantic
    float tProg = clamp(interpolation, 0.0, 1.0);
    float midTransition = sin(tProg * 3.14159265);

    // 5-fold pentagrid folding lines
    float angle5 = 6.2831853 / 5.0;
    float edgeMin = 1.0;
    float tileIndex = 0.0;

    vec2 q = rot2D(tProg * 1.5 + t * 0.2) * p;

    // audioBass undulates the pentagonal tiling inflation scale.  It scales the
    // spatial projection only (the rotation's t term is untouched), and
    // midTransition gates it, so at tProg 0 and 1 the pentagrid -- and with it
    // the staggered tileProg and the grid glow -- is exactly the un-driven one.
    float inflate = fld;   // constant: an envelope on a scale re-lays the whole pattern (speed pass 14.09.2026)

    for (int i = 0; i < 5; ++i) {
        float theta = float(i) * angle5;
        vec2 dir = vec2(cos(theta), sin(theta));
        float proj = dot(q, dir);
        float gridLine = abs(fract(proj * inflate) - 0.5);
        edgeMin = min(edgeMin, gridLine);
        tileIndex += floor(proj * inflate);
    }

    // Tile-based staggered transition delay
    float tileDelay = fract(tileIndex * 0.382); // Golden ratio fractional part
    float tileProg = clamp((tProg - tileDelay * 0.3) / 0.7, 0.0, 1.0);
    tileProg = smoothstep(0.0, 1.0, tileProg);

    // Warp coordinates along 5-fold rays
    vec2 warpUV = uv + vec2(sin(tileIndex), cos(tileIndex)) * 0.02 * midTransition;

    vec4 c1 = texture(tex1, fract(warpUV));
    vec4 c0 = texture(tex0, fract(warpUV));

    vec4 col = mix(c1, c0, tileProg);

    // Glowing Penrose grid lines -- thin and calibrated: the pentagrid's
    // edgeMin covers much of the frame, so the old wide exp(-x*25) falloff
    // at 1.2+kick*3 gain buried the scene in gold.
    float gridGlow = exp(-edgeMin * 55.0) * midTransition;
    col.rgb += gridGlow * vec3(1.0, 0.9, 0.4) * (0.3 + audioKick * 0.35);

    if (audioChromaHue != 0.0) col.rgb = hueRot(col.rgb, audioChromaHue * midTransition);
    if (hue > 0.001) col.rgb = hueRot(col.rgb, hue * midTransition);

    fragColor = col;
}
