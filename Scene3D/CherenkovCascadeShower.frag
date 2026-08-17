#version 330 core
out vec4 fragColor;

in vec4 vCol;
in vec2 vUV;

uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

void main() {
    vec2 circ = gl_PointCoord - 0.5;
    float distSq = dot(circ, circ);
    if (distSq > 0.25) discard;

    float core = exp(-distSq * 16.0);
    vec3 photo = (interpolation * texture(tex0, vUV) + (1.0 - interpolation) * texture(tex1, vUV)).rgb;

    vec3 col = mix(vCol.rgb, photo * 1.5, 0.4) * core;
    fragColor = vec4(col, vCol.a * core);
}
