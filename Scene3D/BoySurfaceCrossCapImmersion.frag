#version 330 core
out vec4 fragColor;
/**
 * @file BoySurfaceCrossCapImmersion.frag
 * @brief BOY SURFACE CROSS-CAP IMMERSION: 3D non-orientable immersion of the real projective
 * plane RP^2 without singular points. Displays three-fold rotational symmetry, self-intersecting
 * triple-point core, double-sided Fresnel glow, and continuous photo-palette texturing.
 *   audioAdvance -> rotates non-orientable surface sheets through 3D space
 *   audioKick    -> flashes triple-point self-intersection contact core
 *   audioSwell   -> enriches projective surface volume & translucency
 *   audioCentroid-> shifts three-fold symmetry harmonic colors
 *
 * Per-activation variety:
 *   boyScaleP float projective surface scale                (0.8..2.2)
 *   symmetryP float 3-fold symmetry warping factor          (0.6..1.8)
 *   fresnelP  float double-sided edge rim glow              (0.8..2.5)
 */

in vec2 vUV;
in vec3 vNormal;
in vec3 vCol;
in float vTriplePoint;

uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float audioKick;
uniform float audioSwell;

uniform float fresnelP;

vec3 img(vec2 uv) {
    return (interpolation * texture(tex0, uv) + (1.0 - interpolation) * texture(tex1, uv)).rgb;
}

void main()
{
    vec3 lightDir = normalize(vec3(0.5, 0.6, 0.7));
    float diff = max(0.0, abs(dot(vNormal, lightDir)));
    float fresnel = pow(1.0 - abs(dot(vNormal, vec3(0.0, 0.0, 1.0))), 2.5) * (fresnelP > 0.01 ? fresnelP : 1.2);
    
    vec3 photo = img(vUV);
    
    vec3 col = vCol * (0.6 + 0.4 * photo) * (0.5 + 0.5 * diff);
    col += vCol * fresnel * 1.6;
    col += vec3(0.95, 0.95, 1.0) * vTriplePoint * 2.2;
    col *= (0.85 + 0.35 * audioSwell);
    col += vCol * (audioKick * 0.3);
    
    // Soft knee compression
    col /= 1.0 + 0.35 * max(col.r, max(col.g, col.b));
    fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
