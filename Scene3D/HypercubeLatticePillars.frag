#version 330 core
out vec4 fragColor;
// HypercubeLatticePillars.frag

uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float audioPhase;
uniform float audioAdvance;
uniform float audioSwell;
uniform float audioLevel;
uniform float audioKick;
uniform float audioCentroid;
uniform float audioValence;
uniform float audioSubBass;
uniform float audioBass;
uniform float audioMid;
uniform float audioHigh;
uniform float audioFlux;
uniform float audioChromaHue;

uniform float hueP;

in vec3 vNormal;
in vec2 vTexCoord;
in vec4 vColor;
in float vHeight;

/**
 * @file HypercubeLatticePillars.frag
 * @brief Shades a lattice of tesseract/hypercube pillar monoliths: a dark
 * photo-textured monolith face with sci-fi neon edge lines picked out near
 * each cube corner (vTexCoord), lit with a simple diffuse+specular term.
 *
 * audioHigh brightens the neon edge color, audioKick intensifies the
 * specular highlight, and audioChromaHue (plus the hueP preset) rotates
 * the final color's hue. Most of the other declared audio* uniforms in
 * this file (audioPhase, audioAdvance, audioSwell, audioLevel,
 * audioCentroid, audioValence, audioSubBass, audioBass, audioMid,
 * audioFlux) are unused by this particular fragment stage.
 */

vec3 img(vec2 uv) {
    return (interpolation * texture(tex0, uv) + (1.0 - interpolation) * texture(tex1, uv)).rgb;
}

vec3 hueRot(vec3 c, float a) {
    vec3 k = vec3(0.57735026919);
    float cs = cos(a), sn = sin(a);
    return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
}

void main() {
    float hue = (hueP > 0.0) ? hueP : 0.0;

    vec3 N = normalize(vNormal);
    vec3 L = normalize(vec3(0.5, 0.8, 1.0));
    vec3 V = vec3(0.0, 0.0, 1.0);
    vec3 H = normalize(L + V);

    float diff = max(dot(N, L), 0.0);
    float spec = pow(max(dot(N, H), 0.0), 32.0);

    // Monolith face texture
    vec3 photo = img(fract(vTexCoord));

    // Sci-fi neon edge line on cube corners
    vec2 edgeDist = abs(vTexCoord - vec2(0.5)) * 2.0;
    float maxEdge = max(edgeDist.x, edgeDist.y);
    float neonLine = smoothstep(0.85, 0.98, maxEdge);

    vec3 darkMonolith = vec3(0.05, 0.06, 0.08) * photo;
    vec3 neonCol = vColor.rgb * (1.5 + 1.5 * audioHigh);

    vec3 col = mix(darkMonolith, neonCol, neonLine);
    col += vec3(1.0) * spec * (0.8 + 1.2 * audioKick);

    col = hueRot(col, audioChromaHue + hue);
    col = pow(col, vec3(0.88));

    fragColor = vec4(col, 1.0);
}
