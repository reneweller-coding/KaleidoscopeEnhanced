#version 330 core
out vec4 fragColor;
// NeuralAxonSynapseCloud.frag

uniform vec2  resolution;
uniform float time;
uniform float audioChromaHue;
uniform float hueP;

in vec4 vColor;
in float vSize;

/**
 * @file NeuralAxonSynapseCloud.frag
 * @brief Renders one particle of the 60,000-point cortical-connectome cloud
 * as a soft gaussian point sprite, then hue-rotates it.
 *
 * Per-particle position, cluster/dendrite placement and the
 * action-potential flash brightness are all computed upstream in
 * NeuralAxonSynapseCloud.vert from a wide set of audio uniforms; this
 * fragment shader only discards outside the circular sprite, shapes the
 * gaussian core, and applies a final hueRot() driven directly by
 * audioChromaHue plus the hueP preset, so the whole connectome's colour
 * can still be nudged live.
 */

vec3 hueRot(vec3 c, float a) {
    vec3 k = vec3(0.57735026919);
    float cs = cos(a), sn = sin(a);
    return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
}

void main() {
    float hue = (hueP > 0.0) ? hueP : 0.0;

    // Soft Gaussian point sprite circle
    vec2 circCoord = gl_PointCoord * 2.0 - 1.0;
    float distSq = dot(circCoord, circCoord);
    if (distSq > 1.0) discard;

    float alpha = exp(-distSq * 5.0);
    vec3 col = vColor.rgb * alpha * 0.5;

    col = hueRot(col, audioChromaHue + hue);
    fragColor = vec4(col, alpha);
}
