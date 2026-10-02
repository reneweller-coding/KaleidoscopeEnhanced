#version 330 core
out vec4 fragColor;   ///< The pixel's colour (output).
/**
 * @file BoseEinsteinVortexTangle.frag
 * @brief BOSE-EINSTEIN VORTEX TANGLE: an ultracold condensate cloud of ruby/cyan
 * quantum sprites threaded by vortex lines, the camera orbiting INSIDE the
 * tangle with a slow nodding pitch.
 *   audioKick -> core brightness    audioPhase -> ruby/cyan state mix
 *   audioAdvance -> orbit           (additive sprites, source-level gains)
 */

in vec3 vWorldPos;   ///< World position (from the vertex stage).
in vec3 vNormal;   ///< Surface normal (from the vertex stage).
in float vVortexPhase;
in vec2 vQuadUV;
in float vViewZ;

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
uniform float audioSubBass;   ///< Sub-bass band level, 0..1.
uniform float audioBass;   ///< Bass band level, 0..1.
uniform float audioMid;   ///< Mid band level, 0..1.
uniform float audioHigh;   ///< High band level, 0..1.
uniform float audioFlux;   ///< Spectral flux (how fast the spectrum changes), 0..1.
uniform float audioChromaHue;   ///< Hue of the dominant pitch class (radians, unwrapped: continuous).

uniform float becP;
uniform float vortexP;
uniform float speedP;   ///< Speed knob, 0..1.
uniform float hueP;   ///< Hue knob (radians), usually the music's chroma hue plus a rolled offset.

/// @brief The photo at a coordinate: the cross-fade of tex0 and tex1.
vec3 img(vec2 uv) {
    return (interpolation * texture(tex0, uv) + (1.0 - interpolation) * texture(tex1, uv)).rgb;
}

/// @brief Rotates a colour's hue by an angle (about the grey axis).
vec3 hueRot(vec3 c, float a) {
    vec3 k = vec3(0.57735026919);
    float cs = cos(a), sn = sin(a);
    return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
}

/// @brief Entry point of this shader stage (the file description says what it draws).
void main() {
    float hue = (hueP > 0.0) ? hueP : 0.0;

    // Circular Gaussian sprite profile
    vec2 pt = vQuadUV;   // quad-local [-1,1]; see .vert
    float r2 = dot(pt, pt);
    if (r2 > 1.0) discard;
    float glow = exp(-r2 * 3.5);

    // Photo texture mapping from world coords.  0.25 was tuned for a 2-unit
    // knot; the tangle now spans the frustum and that rate tiled the slide
    // many times over.
    vec2 photoUV = fract(vWorldPos.xy * 0.07 + 0.5);
    vec3 photo = img(photoUV);

    // attrB = (sprite radius, layer marker, 0).  A NEGATIVE marker is the
    // surrounding thermal cloud (every vortex-core normal carried a fixed +0.5
    // z before normalisation).  It is a background layer: it fills the corners
    // without ever reading as bright as a vortex core.
    float haze = step(vNormal.y, -0.5);

    // Ultra-cold rubidium condensate ruby & cyan palette
    vec3 becRuby = vec3(0.95, 0.1, 0.35);
    vec3 becCyan = vec3(0.1, 0.95, 1.0);
    vec3 tangleColor = mix(becCyan, becRuby, sin(vVortexPhase * 12.56 + audioPhase) * 0.5 + 0.5);

    vec3 col = mix(photo, tangleColor, 0.6) * glow;
    // Hot core TINTED by the palette: the old near-white additive term
    // swamped the ruby/cyan entirely (metric scan: saturation 0.00).
    col += glow * mix(tangleColor, vec3(1.0, 0.98, 0.92), 0.35)
               * (0.35 + audioKick * 0.55);

    col *= mix(1.0, 0.30, haze);

    // Aerial perspective: the tangle and its cloud now run from just in front
    // of the lens out to ~16 units.  Without it near and far sprites read as
    // one flat sheet.  vViewZ is the true post-orbit view depth.
    col *= clamp(6.5 / max(vViewZ, 1.0), 0.30, 1.0);

    if (hue > 0.001) col = hueRot(col, hue);

    // Catalogue review: soft-knee exposure — hot audio compresses
    // instead of clipping the whole frame to white.
    vec3 _catTone = (col * 1.5) * 0.55;
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(_catTone, glow);
}
