#version 330 core
out vec4 fragColor;   ///< The pixel's colour (output).
/**
 * @file MagmaCrustFracture.frag
 * @brief TRANSITION MAGMA CRUST FRACTURE: Tectonic basalt magma crust transition.
 * The outgoing scene solidifies into black obsidian crust plates that fracture
 * apart, revealing glowing 1500°C molten magma rivers that solidify into the new scene.
 *   interpolation -> controls crust fracture opening & magma cooling progress
 *   audioKick     -> flashes incandescent magma crack eruptions
 *   audioSwell    -> widens tectonic fault lines
 *
 * Per-activation variety:
 *   crustP float crust tectonic plate density    (0.5..2.2)
 *   heatP  float magma thermal glow intensity    (0.5..2.0)
 *   speedP float animation speed multiplier      (0.5..2.0)
 *   hueP   float magma thermal hue offset        (0..6.28)
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

uniform float crustP;
uniform float heatP;
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
    p = fract(p * vec2(434.34, 735.21));
    p += dot(p, p + 52.32);
    return fract(p.x * p.y);
}

float voronoiDist(vec2 p) {
    vec2 g = floor(p);
    vec2 f = fract(p);
    float minDist = 1.0;
    for (int y = -1; y <= 1; ++y) {
        for (int x = -1; x <= 1; ++x) {
            vec2 lattice = vec2(float(x), float(y));
            vec2 offset = vec2(hash21(g + lattice), hash21(g + lattice + 33.7));
            vec2 d = lattice + offset - f;
            minDist = min(minDist, length(d));
        }
    }
    return minDist;
}

/// @brief Entry point of this shader stage (the file description says what it draws).
void main() {
    float crs = (crustP > 0.0) ? crustP : 1.0;
    float het = (heatP  > 0.0) ? heatP  : 1.0;
    float spd = (speedP > 0.0) ? speedP : 1.0;
    float hue = (hueP   > 0.0) ? hueP   : 0.0;

    vec2 uv = gl_FragCoord.xy / resolution.xy;
    vec2 p = (gl_FragCoord.xy - 0.5 * resolution) / resolution.y;

    float t = time * 0.2098 * spd;   // clock rate measured down to about 1.2/255 of change per frame (PresetEditor --transprofile); it spun many times that and read as frantic
    float tProg = clamp(interpolation, 0.0, 1.0);
    float midTransition = sin(tProg * 3.14159265);

    // Crust fractures.  audioBass widens the tectonic fault lines by softening
    // the crack falloff; the peak stays 1.0 at v = 0, only the line gets
    // thicker.  The voronoi distance v itself is untouched, so the staggered
    // plate blend below is unaffected, and midTransition gates the widening to
    // exactly the base width at both fade endpoints (where the magma glow is
    // multiplied out by midTransition anyway).
    float v = voronoiDist(p * 8.0 * crs);
    float faultWidth = 1.0 + audioSwell * 0.6 * midTransition;
    float cracks = exp(-v * 15.0 / faultWidth);

    // Plate shift displacement
    vec2 plateDisp = vec2(sin(p.y * 6.0 + t), cos(p.x * 6.0 - t)) * 0.03 * midTransition;

    vec4 c1 = texture(tex1, fract(uv + plateDisp));
    vec4 c0 = texture(tex0, fract(uv - plateDisp));

    // Staggered plate cooling
    float plateDelay = fract(v * 4.0);
    float blend = clamp((tProg - plateDelay * 0.3) / 0.7, 0.0, 1.0);

    vec4 col = mix(c1, c0, blend);

    // Glowing magma rivers along fault lines
    vec3 magmaCol = mix(vec3(0.95, 0.2, 0.05), vec3(1.0, 0.85, 0.3), cracks);
    col.rgb += cracks * magmaCol * midTransition * het * (1.5 + audioKick * 1.17);

    if (audioChromaHue != 0.0) col.rgb = hueRot(col.rgb, audioChromaHue * midTransition);
    if (hue > 0.001) col.rgb = hueRot(col.rgb, hue * midTransition);

    fragColor = col;
}
