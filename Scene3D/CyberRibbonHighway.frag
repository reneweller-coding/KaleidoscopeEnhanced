#version 330 core
out vec4 fragColor;

in vec4  vCol;
in float vSide;
in float vLength;

void main() {
    // Additive glowing ribbon edges & center stripe
    float edge = 1.0 - abs(vSide);
    float glow = pow(edge, 1.8) * 1.5;

    // Glowing dashed lane divider in center
    float centerLine = smoothstep(0.12, 0.0, abs(vSide)) * step(0.35, fract(vLength * 120.0));
    glow += centerLine * 2.0;

    vec3 col = vCol.rgb * glow;
    fragColor = vec4(col, 1.0);
}
