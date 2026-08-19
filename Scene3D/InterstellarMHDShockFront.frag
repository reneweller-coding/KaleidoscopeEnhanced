#version 330 core
out vec4 fragColor;
/**
 * @file InterstellarMHDShockFront.frag
 * @brief INTERSTELLAR MHD SHOCK FRONT: 3D tessellated stellar wind bow shock front
 * impacting a dense interstellar molecular cloud. Magnetohydrodynamic ripples, compression
 * heating, emission lines, and dynamic photo-palette reflection sheets.
 *   audioAdvance -> drives supersonic stellar wind flow velocity
 *   audioKick    -> flashes bow shock compression boundary detonations
 *   audioSwell   -> thickens interstellar molecular cloud emission haze
 *   audioCentroid-> shifts ionization front emission spectra
 *
 * Per-activation variety:
 *   shockCurvP float bow shock paraboloid curvature           (0.2..0.8)
 *   mhdWaveP   float Kelvin-Helmholtz ripple wavenumber       (4.0..16.0)
 *   nebulaP    float interstellar gas opacity & luminance     (0.8..2.5)
 */

in vec2 vUV;
in vec3 vNormal;
in vec3 vCol;
in float vShock;

uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float audioKick;
uniform float audioSwell;

uniform float nebulaP;

vec3 img(vec2 uv) {
    return (interpolation * texture(tex0, uv) + (1.0 - interpolation) * texture(tex1, uv)).rgb;
}

void main()
{
    vec3 lightDir = normalize(vec3(0.0, 0.0, 1.0));
    float diff = max(0.0, dot(vNormal, lightDir));
    float fresnel = pow(1.0 - abs(dot(vNormal, vec3(0.0, 0.0, 1.0))), 3.0);
    
    vec3 photo = img(vUV);
    
    vec3 col = vCol * (0.6 + 0.4 * photo) * (0.5 + 0.5 * diff);
    col += vCol * fresnel * 1.8;
    col += vec3(0.9, 0.95, 1.0) * vShock * 2.0;
    col *= (nebulaP > 0.01 ? nebulaP : 1.2) * (0.85 + 0.35 * audioSwell);
    col += vCol * (audioKick * 0.3);
    
    // Soft knee compression
    col /= 1.0 + 0.35 * max(col.r, max(col.g, col.b));
    fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
