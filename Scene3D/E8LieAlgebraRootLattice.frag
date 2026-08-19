#version 330 core
out vec4 fragColor;
/**
 * @file E8LieAlgebraRootLattice.frag
 * @brief E8 LIE ALGEBRA ROOT LATTICE: 240 root vectors of the exceptional 8D Lie group E8,
 * projected into 3D as rotatable faceted Gosset polytope cube clusters with sharp Bragg
 * reflections, edge bevel glows, and dynamic photo-palette mapping.
 *   audioAdvance -> rotates 8D Lie algebra projection planes
 *   audioKick    -> flashes root lattice Bragg diffraction resonance peaks
 *   audioSwell   -> widens polytope cluster radius & facet luminance
 *   audioCentroid-> shifts root vector weight shell colors
 *
 * Per-activation variety:
 *   rootScaleP float 8D polytope projection radius          (0.8..2.2)
 *   cubeSizeP  float root vertex cubelet facet size         (0.04..0.16)
 *   specularP  float faceted cube specular reflection gain  (0.8..2.5)
 */

in vec3 vNormal;
in vec3 vCol;
in float vWeight;
in vec3 vLocalPos;

uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float audioKick;
uniform float audioSwell;

uniform float specularP;

vec3 img(vec2 uv) {
    return (interpolation * texture(tex0, uv) + (1.0 - interpolation) * texture(tex1, uv)).rgb;
}

void main()
{
    vec3 lightDir = normalize(vec3(0.5, 0.7, 0.6));
    float diff = max(0.0, dot(vNormal, lightDir));
    float spec = pow(max(0.0, dot(reflect(-lightDir, vNormal), vec3(0.0, 0.0, 1.0))), 32.0) * (specularP > 0.01 ? specularP : 1.2);
    
    // Cubelet edge bevel glow
    vec3 aPos = abs(vLocalPos);
    float edgeDist = max(max(aPos.x, aPos.y), aPos.z);
    float edgeGlow = smoothstep(0.42, 0.5, edgeDist);
    
    vec2 photoUv = fract(vLocalPos.xy * 2.0 + 0.5);
    vec3 photo = img(photoUv);
    
    vec3 col = vCol * (0.6 + 0.4 * photo) * (0.4 + 0.6 * diff);
    col += vec3(0.95, 0.95, 1.0) * spec * (1.0 + 3.0 * audioKick);
    col += vCol * edgeGlow * 1.5;
    col *= (0.85 + 0.35 * audioSwell);
    col += vCol * (audioKick * 0.3);
    
    // Soft knee compression
    col /= 1.0 + 0.35 * max(col.r, max(col.g, col.b));
    fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
