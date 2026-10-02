#version 330 core
out vec4 fragColor;   ///< The pixel's colour (output).
/**
 * @file BacteriophageIcosahedralCapsidInjection.frag
 * @brief BACTERIOPHAGE ICOSAHEDRAL CAPSID INJECTION: T4 Bacteriophage viral injection nanomachine.
 * Icosahedral protein capsid, contractile tail sheath, baseplate spikes, and high-pressure viral
 * DNA genome injection pulse into a host bacterium with cryo-EM photo texturing.  A whole SWARM
 * of phages descending through the host cell's cytoplasm (see the .vert).
 *   audioAdvance -> navigates viral tail sheath contraction & DNA translocation drift
 *   audioKick    -> flashes high-pressure viral DNA genome ejection & baseplate perforation
 *   audioSwell   -> widens icosahedral capsid diameter & protein capsomer luminescence,
 *                   and breathes the host cytoplasm behind the swarm
 *   audioCentroid-> shifts viral protein / nucleic acid fluorescence spectra
 *
 * Per-activation variety:
 *   phageScaleP float T4 phage macromolecular complex scale (0.8..2.2)
 *   specularP   float protein capsomer facet specular gain  (0.8..2.5)
 */

in vec2 vUV;   ///< Texture coordinate 0..1 over the screen (from the vertex stage).
in vec3 vNormal;   ///< Surface normal (from the vertex stage).
in vec3 vCol;   ///< Colour (from the vertex stage).
in float vInjectGlow;
in float vBack;
in float vFog;

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
    vec3 photo = img(vUV);

    // ---- HOST CYTOPLASM CURTAIN --------------------------------------
    // Flat, unlit, deliberately dim: it only lifts the gaps between the
    // phages off pure black and gives the far swarm something to fade into.
    if (vBack > 0.5)
    {
        float pg = dot(photo, vec3(0.3333));
        vec3  bg = vCol * (0.72 + 0.55 * pg);
        bg += vCol * audioKick * 0.25;
        // Ceiling raised from 0.5: the curtain is the only layer covering the
        // whole frame, and at its old level it sat below the threshold at which
        // a tile registers as content, so the picture scored as mostly black.
        fragColor = vec4(clamp(bg, 0.0, 0.62), 1.0);
        return;
    }

    vec3 lightDir = normalize(vec3(0.5, 0.6, 0.7));
    float diff = max(0.0, dot(vNormal, lightDir));
    float spec = pow(max(0.0, dot(reflect(-lightDir, vNormal), vec3(0.0, 0.0, 1.0))), 24.0) * (specularP > 0.01 ? specularP : 1.2);

    vec3 col = vCol * (0.6 + 0.4 * photo) * (0.62 + 0.85 * diff);
    col += vec3(0.95, 0.95, 1.0) * min(spec * (1.0 + 3.0 * audioKick), 1.4);
    col += vec3(0.3, 1.0, 0.7) * min(vInjectGlow * 0.8, 1.1);   // was the whole-frame cyan flood
    col *= (0.85 + 0.35 * audioSwell);
    col += vCol * (audioKick * 0.3);

    // Distance haze: the far phages sink into the same cytoplasm the curtain
    // is made of, so the swarm reads as depth instead of as dark cut-outs.
    // The old 0.10/0.19 haze at 70% mix was BRIGHTER than the phages:
    // the whole frame recorded as one teal flood with silhouette holes.
    vec3 hazeCol = vec3(0.02, 0.055, 0.065) * (0.85 + 0.35 * audioSwell);
    col = mix(col, hazeCol, vFog * 0.55);

    // Soft knee compression
    col /= 1.0 + 0.35 * max(col.r, max(col.g, col.b));
    fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
