#version 330 core
out vec4 fragColor;
// EchoSpiral.frag — wide soft band with a luminous centre line.
in vec4  vCol;
in float vSide;

void main()
{
    float d    = abs(vSide);
    float core = exp(-d * d * 8.0);
    float halo = exp(-d * d * 1.8) * 0.35;
    // Catalogue review: soft-knee exposure — hot audio compresses
    // instead of clipping the whole frame to white.
    vec3 _catTone = (vCol.rgb * (core + halo)) * 0.6;
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(_catTone, 1.0);
}
