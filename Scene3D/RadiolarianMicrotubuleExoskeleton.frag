#version 330 core
out vec4 fragColor;   ///< The pixel's colour (output).
/**
 * @file RadiolarianMicrotubuleExoskeleton.frag
 * @brief RADIOLARIAN MICROTUBULE EXOSKELETON: Intricate geometric silica micro-exoskeleton
 * of deep-sea radiolaria. 3D compute-generated porous icosahedral lattices, radiating axopodia
 * spicules, iridescent biosilica glass refraction, and photo texturing.
 *   audioAdvance -> rotates silica skeleton lattice & axopodia fluid flow
 *   audioKick    -> flashes cytoplasmic bioluminescence & spicule tip glints
 *   audioSwell   -> swells concentric icosahedral shell radius & strut thickness
 *   audioCentroid-> shifts biosilica opal dispersion colors
 *
 * Per-activation variety:
 *   silicaGlowP float glass strut luminance               (0.8..2.5)
 *   opalP       float thin-film opal iridescence intensity (0.5..2.2)
 */

in vec3 vPos;   ///< Position (from the vertex stage).
in float vRadius;
in float vGlow;

uniform vec2  resolution;   ///< Size of the render target in pixels.
uniform float time;   ///< Seconds since the program started (never reset; see sceneTime).
uniform sampler2D tex0;   ///< The current photo.
uniform sampler2D tex1;   ///< The next photo (cross-faded in by interpolation).
uniform float interpolation;   ///< Cross-fade between the photos: 1 = tex0, 0 = tex1.

uniform float audioAdvance;   ///< The music's advance: integrated tempo-weighted energy (never jumps, never runs backwards).
uniform float audioKick;   ///< Kick-drum envelope, 0..1 (fast attack, short decay).
uniform float audioSwell;   ///< Slow loudness envelope, 0..1 (seconds).
uniform float audioCentroid;   ///< Spectral centroid (brightness of the sound), 0..1.
uniform float audioValence;   ///< Mood valence: 0 dark .. 1 bright.
uniform float audioChromaHue;   ///< Hue of the dominant pitch class (radians, unwrapped: continuous).

uniform float silicaGlowP;
uniform float opalP;

/// @brief The photo at a coordinate: the cross-fade of tex0 and tex1.
vec3 img(vec2 uv) {
    return (interpolation * texture(tex0, uv) + (1.0 - interpolation) * texture(tex1, uv)).rgb;
}

/// @brief The house palette: a colour of the photo on an arc that turns with the music's hue.
vec3 imgPalette(float t)
{
    float ang = audioChromaHue + audioAdvance * 0.04 + t * 6.2831853;
    float rad = 0.16 + 0.08 * sin(audioAdvance * 0.013);
    vec3  col = img(clamp(vec2(0.5) + rad * vec2(cos(ang), sin(ang)), 0.0, 1.0));
    float g   = dot(col, vec3(0.333));
    return mix(vec3(g), col, 0.55 + 0.45 * audioValence);
}

/// @brief Tints a colour toward the house palette at t, keeping its brightness.
vec3 palTint(vec3 c, float t, float k)
{
    vec3 tp = imgPalette(t);
    tp *= dot(c, vec3(0.3333)) / max(dot(tp, vec3(0.3333)), 1e-3);
    return mix(c, tp, k);
}

/// @brief Entry point of this shader stage (the file description says what it draws).
void main() {
    // Glass opal silica color
    vec3 opalSilica = vec3(0.75, 0.9, 1.0);
    vec3 silicaCol = palTint(opalSilica, vRadius * 0.3 + audioCentroid, 0.22);
    
    // 0.25 was tuned for one skeleton on the origin; the bloom now spans the
    // whole frustum and that rate tiled the slide eight times over.
    vec2 photoUv = fract(vPos.xy * 0.045 + 0.5);
    vec3 photoSample = img(photoUv);

    vec3 col = silicaCol * (0.6 + 0.4 * photoSample) * vGlow;
    col *= (silicaGlowP > 0.01 ? silicaGlowP : 1.2) * (0.85 + 0.35 * audioSwell);
    col += silicaCol * (audioKick * 0.35);

    // Thin-film opal dispersion across the strut: opalP was declared and then
    // never read, so the documented iridescence simply did not exist.  Banded
    // on the strut's own radius, drifting with the spectral centroid.
    float opal = (opalP > 0.01 ? opalP : 1.0);
    float band = vRadius * 9.0 + audioCentroid * 4.0 + audioAdvance * 0.05;
    vec3  irid = vec3(sin(band), sin(band + 2.094), sin(band + 4.188)) * 0.5 + 0.5;
    col += min(irid * (0.16 * opal) * vGlow, vec3(0.42));

    // Aerial perspective: the bloom runs from just in front of the lens out to
    // ~18 units, and the vert stage adds 4.8 to reach view depth.  Lit
    // identically, near and far skeletons read as one flat sheet -- and the
    // many added struts would sum too bright.
    float viewD = max(vPos.z + 4.8, 1.0);
    col *= clamp(5.5 / viewD, 0.28, 1.0);

    // Soft knee compression
    col /= 1.0 + 0.35 * max(col.r, max(col.g, col.b));
    fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
