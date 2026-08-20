#version 330 core
out vec4 fragColor;
/**
 * @file GeothermalFumaroleMineralSpires.frag
 * @brief GEOTHERMAL FUMAROLE MINERAL SPIRES: Deep-sea hydrothermal vent chimneys and volcanic
 * solfatara mineral towers. Sulfide mineral precipitations, superheated black smoker hydrothermal
 * venting, mineral crust crystalline sheen, and geothermal photo texturing.  A whole FIELD of
 * chimneys marching away from the camera (see the .vert), standing against a far curtain of
 * mineral steam.
 *   audioAdvance -> drives hydrothermal fluid convective ascent & gas plume eruption
 *   audioKick    -> flashes superheated hydrothermal steam cavitation bursts
 *   audioSwell   -> widens mineral chimney spire girth & sulfide precipitate density,
 *                   and breathes the far steam curtain
 *   audioCentroid-> shifts mineral sulfide (chalcopyrite/pyrite/sulfur) color spectra
 *
 * Per-activation variety:
 *   spireScaleP float hydrothermal chimney spire diameter    (0.8..2.2)
 *   ventGlowP   float superheated hydrothermal vent luminance (0.8..2.5)
 *   specularP   float mineral crystal facet sheen gain        (0.8..2.5)
 */

in vec2 vUV;
in vec3 vNormal;
in vec3 vCol;
in float vVentGlow;
in float vBack;
in float vFog;

uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float audioKick;
uniform float audioSwell;

uniform float ventGlowP;
uniform float specularP;

vec3 img(vec2 uv) {
    return (interpolation * texture(tex0, uv) + (1.0 - interpolation) * texture(tex1, uv)).rgb;
}

void main()
{
    vec3 photo = img(vUV);

    // ---- FAR STEAM CURTAIN -------------------------------------------
    // Flat, unlit, deliberately dim: it only lifts the sky off pure black
    // and gives the receding chimneys an atmosphere to fade into.
    if (vBack > 0.5)
    {
        float pg  = dot(photo, vec3(0.3333));
        vec3  bg  = vCol * (0.72 + 0.55 * pg);
        bg += vCol * audioKick * 0.25;
        // Ceiling raised from 0.55: this curtain is the only layer covering the
        // whole frame, and it was sitting under the level at which a tile counts
        // as carrying content at all.
        fragColor = vec4(clamp(bg, 0.0, 0.68), 1.0);
        return;
    }

    vec3 lightDir = normalize(vec3(0.4, 0.6, 0.7));
    float diff = max(0.0, dot(vNormal, lightDir));
    float spec = pow(max(0.0, dot(reflect(-lightDir, vNormal), vec3(0.0, 0.0, 1.0))), 24.0) * (specularP > 0.01 ? specularP : 1.2);

    vec3 col = vCol * (0.6 + 0.4 * photo) * (0.42 + 0.62 * diff);
    col += vec3(0.95, 0.95, 1.0) * min(spec * (1.0 + 3.0 * audioKick), 1.4);
    col += vec3(1.0, 0.6, 0.1) * min(vVentGlow * (ventGlowP > 0.01 ? ventGlowP : 1.3) * 2.2, 2.6);
    col *= (0.85 + 0.35 * audioSwell);
    col += vCol * (audioKick * 0.3);

    // Distance haze: the far rows sink into the same mineral steam the
    // curtain is made of, so the field reads as depth instead of as small
    // dark cut-outs on black.
    vec3 hazeCol = vec3(0.20, 0.145, 0.095) * (0.85 + 0.35 * audioSwell);
    col = mix(col, hazeCol, vFog * 0.72);

    // Soft knee compression
    col /= 1.0 + 0.35 * max(col.r, max(col.g, col.b));
    fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
