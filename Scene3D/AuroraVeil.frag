#version 120
// AuroraVeil.frag — translucent curtain: bright lower hem, airy top.
varying vec4  vCol;
varying float vSide;

void main()
{
    float hem  = exp(-(vSide + 1.0) * (vSide + 1.0) * 1.4);
    float body = exp(-vSide * vSide * 0.9) * 0.16;
    gl_FragColor = vec4(vCol.rgb * (hem + body), 1.0);
}
