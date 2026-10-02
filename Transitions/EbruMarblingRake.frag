#version 330 core
out vec4 fragColor;   ///< The pixel's colour (output).
/**
 * @file EbruMarblingRake.frag
 * @brief TRANSITION EBRU MARBLING RAKE: Turkish paper marbling (Ebru) rake transition.
 * Fine comb teeth sweep through floating pigments in alternating directions,
 * drawing elegant capillary plumes and chevron folds that reveal the next scene.
 *   interpolation -> drives rake comb sweep across the liquid surface
 *   audioKick     -> flashes sharp pigment boundary swirls
 *   audioSwell    -> undulates comb teeth displacement depth
 *
 * Per-activation variety:
 *   rakeP  float comb teeth frequency & density (0.5..2.2)
 *   swirlP float capillary vortex curl intensity (0.5..2.0)
 *   speedP float animation speed multiplier      (0.5..2.0)
 *   hueP   float pigment color hue offset        (0..6.28)
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

uniform float rakeP;
uniform float swirlP;   ///< Swirl knob, 0..1.
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
    float rak = (rakeP  > 0.0) ? rakeP  : 1.0;
    float swr = (swirlP > 0.0) ? swirlP : 1.0;
    float spd = (speedP > 0.0) ? speedP : 1.0;
    float hue = (hueP   > 0.0) ? hueP   : 0.0;

    vec2 uv = gl_FragCoord.xy / resolution.xy;
    vec2 p = (gl_FragCoord.xy - 0.5 * resolution) / resolution.y;

    float t = time * 0.1221 * spd;   // clock rate measured down to about 1.2/255 of change per frame (PresetEditor --transprofile); it spun many times that and read as frantic
    float tProg = clamp(interpolation, 0.0, 1.0);
    float midTransition = sin(tProg * 3.14159265);

    // Comb teeth rake displacement along X axis: y-displacement alternating sign per tooth
    float toothPhase = p.x * 20.0 * rak;
    float toothSign = sin(toothPhase);
    float rakeDisp = toothSign * 0.08 * midTransition * swr * (1.0 + audioSwell * 0.6);

    // Capillary swirl curls
    float curl = sin(p.y * 15.0 + t * 3.0) * cos(p.x * 15.0 - t * 2.0) * 0.03 * midTransition;

    vec2 warpUV = uv + vec2(curl, rakeDisp);

    vec4 c1 = texture(tex1, fract(warpUV));
    vec4 c0 = texture(tex0, fract(warpUV));

    vec4 col = mix(c1, c0, tProg);

    // Pigment gold vein lines
    float vein = exp(-abs(toothSign) * 15.0) * midTransition;
    col.rgb += vein * vec3(1.0, 0.85, 0.4) * (1.0 + audioKick * 0.83);

    if (audioChromaHue != 0.0) col.rgb = hueRot(col.rgb, audioChromaHue * midTransition);
    if (hue > 0.001) col.rgb = hueRot(col.rgb, hue * midTransition);

    fragColor = col;
}
