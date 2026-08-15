#version 330 core
out vec4 fragColor;
// CosmicBoidsVortex.frag — Soft glowing 3D energy particle (additive blending).
in vec4 vCol;

void main() {
    vec2 d = gl_PointCoord - 0.5;
    float r2 = dot(d, d);
    if (r2 > 0.25) discard;
    float alpha = exp(-r2 * 12.0);
    fragColor = vec4(vCol.rgb * alpha, vCol.a * alpha);
}
