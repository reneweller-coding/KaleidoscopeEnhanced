#version 330 core
out vec4 fragColor;
// NeuralAxonSynapseCloud.frag

uniform vec2  resolution;
uniform float time;
uniform float audioChromaHue;
uniform float hueP;

in vec4 vColor;
in float vSize;

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

    float alpha = exp(-distSq * 3.5);
    vec3 col = vColor.rgb * alpha * 0.6;

    col = hueRot(col, audioChromaHue + hue);
    fragColor = vec4(col, alpha);
}
