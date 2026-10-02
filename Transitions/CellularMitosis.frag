#version 330 core
out vec4 fragColor;   ///< The pixel's colour (output).
/**
 * @file CellularMitosis.frag
 * @brief TRANSITION CELLULAR MITOSIS: Biological cell division & cytokinesis transition.
 * A parent biological cell elongates, forms a pinching cleavage furrow, and
 * divides into daughter cells that separate and morph into the incoming scene.
 *   interpolation -> controls cell elongation, cleavage furrow & cytokinesis
 *   audioKick     -> flashes mitotic spindle fiber glowing microtubules
 *   audioSwell    -> undulates cell membrane elasticity & expansion
 *
 * Per-activation variety:
 *   mitosisP float cell membrane curvature & size     (0.5..2.2)
 *   cleaveP  float cytokinesis cleavage furrow depth (0.5..2.0)
 *   speedP   float animation speed multiplier        (0.5..2.0)
 *   hueP     float membrane glow hue offset          (0..6.28)
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

uniform float mitosisP;
uniform float cleaveP;
uniform float speedP;   ///< Speed knob, 0..1.
uniform float hueP;   ///< Hue knob (radians), usually the music's chroma hue plus a rolled offset.

/// @brief Rotates a colour's hue by an angle (about the grey axis).
vec3 hueRot(vec3 c, float a) {
    vec3 k = vec3(0.57735026919);
    float cs = cos(a), sn = sin(a);
    return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
}

/// @brief Entry point of this shader stage (the file description says what it draws).
void main() {
    float mts = (mitosisP > 0.0) ? mitosisP : 1.0;
    float clv = (cleaveP  > 0.0) ? cleaveP  : 1.0;
    float spd = (speedP   > 0.0) ? speedP   : 1.0;
    float hue = (hueP     > 0.0) ? hueP     : 0.0;

    vec2 uv = gl_FragCoord.xy / resolution.xy;
    vec2 p = (gl_FragCoord.xy - 0.5 * resolution) / resolution.y;

    float t = time * 0.4 * spd;   // clock only: audioAdvance integrates transients and sped the motion up on every surge
    float tProg = clamp(interpolation, 0.0, 1.0);
    float midTransition = sin(tProg * 3.14159265);

    // audioBass undulates membrane elasticity & expansion.  Both factors are
    // folded in through midTransition, so at tProg 0 and 1 they collapse to the
    // un-driven values; the daughter-cell geometry only ever reaches the frame
    // through pinchDisp and the membrane glow, which are midTransition-gated.
    float bassPulse = audioSwell * midTransition;

    // Cleavage furrow: distance to dual daughter cell centers
    float sep = mix(0.0, 0.5, tProg) * mts * (1.0 + bassPulse * 0.35);
    vec2 cLeft  = vec2(-sep, 0.0);
    vec2 cRight = vec2( sep, 0.0);

    float d1 = length(p - cLeft);
    float d2 = length(p - cRight);

    // Metaball fusion of two cell membranes: 1/d1^2 + 1/d2^2 = threshold
    float meta = (0.12 / max(d1 * d1, 0.001)) + (0.12 / max(d2 * d2, 0.001));
    float elasticity = 0.2 * clv * (1.0 + bassPulse * 0.7);
    float cellIso = smoothstep(1.0 - elasticity, 1.0 + elasticity, meta);

    // Membrane pinch displacement
    vec2 pinchDisp = normalize(p + 1e-4) * (1.0 - cellIso) * 0.04 * midTransition;

    vec4 c1 = texture(tex1, fract(uv + pinchDisp));
    vec4 c0 = texture(tex0, fract(uv - pinchDisp));

    vec4 col = mix(c1, c0, tProg);

    // Glowing lipid bilayer cell membrane
    float membrane = exp(-abs(meta - 1.0) * 8.0) * midTransition;
    col.rgb += membrane * vec3(0.2, 0.9, 0.6) * (1.5 + audioKick * 1.0);

    if (audioChromaHue != 0.0) col.rgb = hueRot(col.rgb, audioChromaHue * midTransition);
    if (hue > 0.001) col.rgb = hueRot(col.rgb, hue * midTransition);

    fragColor = col;
}
