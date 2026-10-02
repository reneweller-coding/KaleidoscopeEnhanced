#version 330 core
out vec4 fragColor;   ///< The pixel's colour (output).
/**
 * @file HyperbolicPoincareTunnel.frag
 * @brief HYPERBOLIC POINCARE TUNNEL: 100% viewport-filling infinite flight down
 * a non-Euclidean tunnel whose cross-section is an {8,3} hyperbolic
 * Poincare disk. The tunnel walls are paved with conformal self-similar
 * tiles of the loaded photo with hyperbolic circle reflections.
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
uniform float audioSubBass;   ///< Sub-bass band level, 0..1.
uniform float audioBass;   ///< Bass band level, 0..1.
uniform float audioMid;   ///< Mid band level, 0..1.
uniform float audioHigh;   ///< High band level, 0..1.
uniform float audioFlux;   ///< Spectral flux (how fast the spectrum changes), 0..1.
uniform float audioChromaHue;   ///< Hue of the dominant pitch class (radians, unwrapped: continuous).

uniform float speedP;   ///< Speed knob, 0..1.
uniform float branchP;   ///< Branching knob, 0..1.
uniform float curveP;
uniform float hueP;   ///< Hue knob (radians), usually the music's chroma hue plus a rolled offset.

/// @brief The photo at a coordinate: the cross-fade of tex0 and tex1.
vec3 img(vec2 uv) {
    return (interpolation * texture(tex0, uv) + (1.0 - interpolation) * texture(tex1, uv)).rgb;
}


/// IMG-PALETTE (house standard): colours come from a rotating arc in the
/// CURRENT slideshow image, so every activation inherits a fresh palette from
/// the photos; the arc follows the musical key (audioChromaHue is circular-
/// slewed = jump-free) with a slow advance drift, valence shapes saturation.
vec3 imgPalette(float t)
{
    float ang = audioChromaHue + audioAdvance * 0.04 + t * 6.2831853;
    float rad = 0.16 + 0.08 * sin(audioAdvance * 0.013);
    vec3  pc  = img(clamp(vec2(0.5) + rad * vec2(cos(ang), sin(ang)), 0.0, 1.0));
    float pg  = dot(pc, vec3(0.333));
    return mix(vec3(pg), pc, 0.55 + 0.45 * audioValence);
}

/// @brief Rotates a colour's hue by an angle (about the grey axis).
vec3 hueRot(vec3 c, float a) {
    vec3 k = vec3(0.57735026919);
    float cs = cos(a), sn = sin(a);
    return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
}

/// @brief Entry point of this shader stage (the file description says what it draws).
void main() {
    float spd = (speedP  > 0.0) ? speedP  : 1.0;
    float brn = (branchP > 0.0) ? branchP : 1.0;
    float crv = (curveP  > 0.0) ? curveP  : 1.0;
    float hue = (hueP    > 0.0) ? hueP    : 0.0;

    vec2 uv = (gl_FragCoord.xy - 0.5 * resolution) / resolution.y;

    float r = length(uv);
    float angle = atan(uv.y, uv.x);

    // Tunnel depth coordinate z
    float z = (1.0 / (r + 0.05)) * (0.8 + 0.3 * audioSwell) + (time * 0.7 * spd + audioAdvance * 0.35);
    
    // Curving tunnel axis
    vec2 tunnelCenter = vec2(sin(z * 0.3 * crv) * 0.4, cos(z * 0.25 * crv) * 0.3);
    vec2 p = (uv - tunnelCenter / (z * 0.5 + 1.0));
    r = length(p);
    angle = atan(p.y, p.x);

    // 8-fold hyperbolic sector symmetry
    float sectors = 8.0 * brn;
    float secAngle = 6.2831853 / sectors;
    float foldedAngle = mod(angle + 0.5 * secAngle, secAngle) - 0.5 * secAngle;
    vec2 hCoord = vec2(cos(foldedAngle), sin(foldedAngle)) * (1.0 - exp(-r * 2.0));

    // Hyperbolic circle inversion reflection
    float cX = 0.85;
    float cR = 0.55;
    vec2 d = hCoord - vec2(cX, 0.0);
    float d2 = dot(d, d);
    if (d2 < cR * cR) {
        hCoord = vec2(cX, 0.0) + d * (cR * cR / d2);
    }

    // Photo texture mapping onto hyperbolic tunnel tiles
    vec2 tunnelUV = vec2(hCoord.x * 1.5, fract(z * 0.2 + hCoord.y * 0.5));
    tunnelUV = abs(fract(tunnelUV) * 2.0 - 1.0); // Kaleidoscopic fold

    vec3 photoTile = img(tunnelUV);

    // Hyperbolic tile borders & glowing archways
    float tileBorder = min(abs(fract(z * 0.5) - 0.5), abs(foldedAngle / (0.5 * secAngle) - 1.0));
    float archGlow = exp(-tileBorder * 20.0) * (0.8 + 1.5 * audioHigh);

    // Color grading & depth perspective
    vec3 archCol = imgPalette((z * 0.5 + audioPhase) * 0.159);
    vec3 col = photoTile * (0.8 + 0.5 * audioLevel) + archCol * archGlow * 1.8;

    // Vanishing point core laser flare on kicks
    float coreFlare = exp(-r * 4.0) * (0.5 + 2.5 * audioKick);
    col += vec3(1.0, 0.95, 0.85) * coreFlare;

    // Tunnel wall entrance fade
    col *= smoothstep(0.0, 0.1, r);

    col = hueRot(col, hue);   // chromaHue handled inside imgPalette
    col = pow(col, vec3(0.88));

    // Catalogue review: soft-knee exposure — hot audio compresses
    // instead of clipping the whole frame to white.
    vec3 _catTone = (col) * 0.5;
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(_catTone, 1.0);
}
