#version 330 core
out vec4 fragColor;
// Frag-side music pulse (added by the deaf-scene pass: reactivity
// measured ~0 -- the vert-side coupling barely moved any pixels).
uniform float audioLevel;
uniform float audioKick;
// SciFiHUD.frag — crisp glowing HUD line: bright core, soft halo.  vCol
// already carries the vertex shader's fade (crosshair gaps, sweep trail,
// lock-ring pulses) baked in.
in vec4  vCol;
in float vSide;

void main()
{
    float d    = abs(vSide);
    float core = exp(-d * d * 30.0);
    float halo = exp(-d * d * 6.0) * 0.35;
    fragColor = vec4(vCol.rgb * (core + halo) * (0.85 + 0.30 * audioLevel + 0.35 * audioKick), 1.0);
}
