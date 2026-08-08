#version 120
// SciFiHUD.frag — crisp glowing HUD line: bright core, soft halo.  vCol
// already carries the vertex shader's fade (crosshair gaps, sweep trail,
// lock-ring pulses) baked in.
varying vec4  vCol;
varying float vSide;

void main()
{
    float d    = abs(vSide);
    float core = exp(-d * d * 30.0);
    float halo = exp(-d * d * 6.0) * 0.35;
    gl_FragColor = vec4(vCol.rgb * (core + halo), 1.0);
}
