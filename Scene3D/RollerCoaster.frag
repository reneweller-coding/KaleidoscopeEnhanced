#version 330 core
out vec4 fragColor;
// Frag-side music pulse (added by the deaf-scene pass: reactivity
// measured ~0 -- the vert-side coupling barely moved any pixels).
uniform float audioLevel;
uniform float audioKick;
// RollerCoaster.frag — glowing structure: bright core, soft halo.
in vec4  vCol;
in float vSide;

void main()
{
    float d    = abs(vSide);
    float core = exp(-d * d * 12.0);
    float halo = exp(-d * d * 2.5) * 0.30;
    fragColor = vec4(vCol.rgb * (core + halo) * (0.85 + 0.30 * audioLevel + 0.35 * audioKick), 1.0);
}
