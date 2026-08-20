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
 *   audioKick    -> also swells the far-field dust motes
 *
 * The frame is filled by three NESTED counter-rotating shells of the same
 * immersion (hero / mid / outer) plus a frustum-spread dust field; the vertex
 * stage splits the host grid into those four sub-meshes and hands each one its
 * own brightness in vDim.
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
in float vDim;

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

    // Per-shell / dust brightness (hero 1.0, mid 0.62, outer 0.36, motes ~0.3)
    col *= vDim;

    // Highlight rolloff: transparent below 0.7, hard-limited above it, so more
    // nested geometry can never push the frame into clipping.
    float m = max(col.r, max(col.g, col.b));
    col *= 1.0 / (1.0 + max(0.0, m - 0.7));
    fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
