#version 330 core
out vec4 fragColor;

in vec4  vCol;
in float vLife;

void main() {
    // Round gaussian point sprite
    vec2 pc = gl_PointCoord - 0.5;
    float r2 = dot(pc, pc);
    if (r2 > 0.25) discard;

    // Tight core, short tail: the broad old tail was pure overdraw — the
    // additive network integrates sprite area, so the tail is what washed
    // the palette to near-white (metric scan: saturation 0.02).
    float glow = exp(-r2 * 16.0) + exp(-r2 * 5.0) * 0.25;
    glow *= (1.0 + vLife * 2.0);

    vec3 col = vCol.rgb * glow * 0.15;
    // Catalogue review: soft-knee exposure — hot audio compresses
    // instead of clipping the whole frame to white.
    vec3 _catTone = (col) * 0.6;
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(_catTone, 1.0);
}
