#version 330 core
out vec4 fragColor;   ///< The pixel's colour (output).
/**
 * @file MagnetotacticBacteriaChains.frag
 * @brief MAGNETOTACTIC BACTERIA CHAINS: a whole CULTURE of helical swimming chains of
 * magnetotactic bacteria -- 306 of them spread through the cell at every depth -- containing
 * biomineralized magnetite nanocrystal cubes aligned along 3D geomagnetic field lines.
 * Octahedral crystal faceting, magnetic dipole orientation glints, and photo texturing.
 * Each chain carries its own level (how deep it swims x how strongly it mineralised), so
 * bright chains cross dark ones over the black of the medium.
 *   audioAdvance -> drives swimming flagellar propulsion, the glide along each field line,
 *                   & helical precession
 *   audioKick    -> flashes magnetic dipole alignment specular glints
 *   audioSwell   -> thickens flagellar envelope & cellular sheath glow, and swells the
 *                   magnetite crystals
 *   audioCentroid-> shifts magnetosome biomineral color spectra
 *
 * Per-activation variety:
 *   magnetosomeSizeP float magnetite crystal facet size      (0.03..0.12)
 *   specularP        float crystal facet specular brightness (0.8..2.5)
 */

in vec3 vNormal;   ///< Surface normal (from the vertex stage).
in vec3 vCol;   ///< Colour (from the vertex stage).
in float vChainID;
in vec3 vLocalPos;   ///< Object-space position (from the vertex stage).
in float vChainLit;

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
    vec3 viewDir  = vec3(0.0, 0.0, 1.0);
    vec3 N = normalize(vNormal);
    vec3 H = normalize(lightDir + viewDir);

    float diff  = max(0.0, dot(N, lightDir));
    float ndh   = max(0.0, dot(N, H));
    float specB = pow(ndh,  9.0);      // the crystal's broad metallic sheen
    float specT = pow(ndh, 48.0);      // the dipole-alignment glint itself

    // OCTAHEDRAL FACETING.  The old term was
    //     smoothstep(0.42, 0.5, max(|x|, |y|, |z|))
    // on a cube-surface position -- but every fragment of a cube lies on a face,
    // so one of the three is ALWAYS exactly 0.5 and that smoothstep was
    // identically 1.0 on every pixel of every crystal.  It was a constant worth
    // more than three times the whole shaded term, which is why the culture
    // measured flat.  The SECOND largest coordinate is 0 at a face centre and
    // 0.5 on a crystal edge, so this lights the facet borders instead.
    vec3  aPos = abs(vLocalPos);
    float mxc  = max(max(aPos.x, aPos.y), aPos.z);
    float mnc  = min(min(aPos.x, aPos.y), aPos.z);
    float midC = aPos.x + aPos.y + aPos.z - mxc - mnc;
    float facet = smoothstep(0.26, 0.50, midC);

    vec2 photoUv = fract(vLocalPos.xy * 2.0 + 0.5);
    vec3 photo = img(photoUv);

    // Magnetite is its own colour -- a blue-black metallic mineral -- as well as
    // whatever the photo palette gives it.  Half the photo library is deep-space
    // imagery whose palette ring is near black; with every term proportional to
    // the palette the whole culture went black with it.
    vec3 body = mix(vCol, vec3(0.55, 0.63, 0.82) * 0.82, 0.40);

    vec3 col = body * (0.6 + 0.4 * photo) * (0.35 + 1.70 * diff) * vChainLit;
    col += body * facet * 1.90 * vChainLit;

    // The frame carries 306 chains instead of one clump, so the glint has to be
    // bounded: specularP alone reaches 2.5, and a kick multiplies it by four
    // again.  Bright chains glint harder than the ones sunk in the medium.
    float glint = min((specB * 0.34 + specT * 1.05 * (specularP > 0.01 ? specularP : 1.2))
                      * (1.0 + 3.0 * audioKick), 1.5);
    col += vec3(0.95, 0.95, 1.0) * glint * (0.35 + 0.65 * vChainLit);

    // EXPOSURE.  Everything above is per-chain and per-facet, i.e. it varies;
    // the old shading summed to roughly a quarter of this and then had 78% of
    // its value replaced by the constant edge term, so the culture came out at
    // luma 0.015 against a 0.06 floor.
    col *= 3.6 * (0.85 + 0.35 * audioSwell);

    col += body * min(audioKick * 0.3, 0.35) * vChainLit;

    // Ceiling just under the knee's clipping point (1.40 in -> 0.94 out).
    col = min(col, vec3(1.40));

    // Soft knee compression
    col /= 1.0 + 0.35 * max(col.r, max(col.g, col.b));
    fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
