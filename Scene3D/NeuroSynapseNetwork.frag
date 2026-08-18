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

    // Damped: additive overlap of the full network washed the palette to
    // near-white (metric scan: saturation 0.02 at mean luma 132).
    vec3 col = vCol.rgb * glow * 0.32;
    fragColor = vec4(col, 1.0);
}
