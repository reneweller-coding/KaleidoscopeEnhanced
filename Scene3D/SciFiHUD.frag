#version 330 core
out vec4 fragColor;
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
    fragColor = vec4(vCol.rgb * (core + halo), 1.0);
}
