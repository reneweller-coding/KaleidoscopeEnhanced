#version 330 core
out vec4 fragColor;   ///< The pixel's colour (output).
/**
 * @file FullereneC60BuckyballCrystalLattice.frag
 * @brief FULLERENE C60 BUCKYBALL CRYSTAL LATTICE: Buckminsterfullerene C60 crystal lattice (fullerite).
 * Truncated icosahedral carbon cages arranged in a 3D FCC crystal structure. Pentagonal/hexagonal
 * ring vibrations, metallic carbon luster, and fullerene photo texturing.
 *   audioAdvance -> rotates fullerite crystal orientation & intramolecular cage tumbling
 *   audioKick    -> flashes C60 intramolecular vibrational mode resonance bursts
 *   audioSwell   -> widens fullerite unit cell constant & carbon atom cluster size
 *   audioCentroid-> shifts fullerene electronic absorption / luminescence spectra
 *
 * Per-activation variety:
 *   buckySizeP float individual C60 cage cluster diameter   (0.04..0.14)
 *   specularP  float carbon cage facet specular gain        (0.8..2.5)
 */

in vec3 vNormal;   ///< Surface normal (from the vertex stage).
in vec3 vCol;   ///< Colour (from the vertex stage).
in float vBuckyPulse;

uniform vec2  resolution;   ///< Size of the render target in pixels.
uniform float time;   ///< Seconds since the program started (never reset; see sceneTime).
uniform sampler2D tex0;   ///< The current photo.
uniform sampler2D tex1;   ///< The next photo (cross-faded in by interpolation).
uniform float interpolation;   ///< Cross-fade between the photos: 1 = tex0, 0 = tex1.

uniform float audioKick;   ///< Kick-drum envelope, 0..1 (fast attack, short decay).
uniform float audioSwell;   ///< Slow loudness envelope, 0..1 (seconds).

uniform float specularP;   ///< Specular knob, 0..1.

/// @brief The photo at a coordinate: the cross-fade of tex0 and tex1.
vec3 img(vec2 uv) {
    return (interpolation * texture(tex0, uv) + (1.0 - interpolation) * texture(tex1, uv)).rgb;
}

/// @brief Entry point of this shader stage (the file description says what it draws).
void main()
{
    vec3 lightDir = normalize(vec3(0.5, 0.6, 0.7));
    float diff = max(0.0, dot(vNormal, lightDir));
    float spec = pow(max(0.0, dot(reflect(-lightDir, vNormal), vec3(0.0, 0.0, 1.0))), 24.0) * (specularP > 0.01 ? specularP : 1.2);

    vec2 photoUv = fract(vNormal.xy * 0.5 + 0.5);
    vec3 photo = img(photoUv);

    vec3 col = vCol * (0.6 + 0.4 * photo) * (0.4 + 0.6 * diff);
    col += vec3(0.95, 0.95, 1.0) * spec * (1.0 + 3.0 * audioKick);
    col += vec3(1.0, 0.9, 0.7) * vBuckyPulse * 1.05;
    col *= (0.85 + 0.35 * audioSwell);
    col += vCol * (audioKick * 0.3);

    // Soft knee compression
    col /= 1.0 + 0.35 * max(col.r, max(col.g, col.b));
    fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
