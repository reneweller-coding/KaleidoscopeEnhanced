#version 330 core
out vec4 fragColor;

in vec4  vCol;
in float vLife;

void main() {
    // Round gaussian point sprite
    vec2 pc = gl_PointCoord - 0.5;
    float r2 = dot(pc, pc);
    if (r2 > 0.25) discard;

    float glow = exp(-r2 * 14.0) + exp(-r2 * 3.5) * 0.4;
    glow *= (1.0 + vLife * 2.0);

    vec3 col = vCol.rgb * glow;
    fragColor = vec4(col, 1.0);
}
