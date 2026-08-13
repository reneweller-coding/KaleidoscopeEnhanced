#version 330 core
out vec4 fragColor;
// MosaicWave.frag — front = the image; back = hue-inverted twin.  Thin dark
// grout lines keep the mosaic readable.
uniform sampler2D tex0;
uniform float audioChromaHue;
uniform float audioDrop;

in vec2  vUV;
in float vFlip;
in float vLight;

vec3 hueRot(vec3 c, float a)
{
    vec3  k = vec3(0.57735026919);
    float cs = cos(a), sn = sin(a);
    return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
}

void main()
{
    vec3 col = texture(tex0, vUV).rgb;

    // While a tile shows its back, show the key-rotated twin image.
    if (vFlip < 0.0)
        col = hueRot(col.bgr, audioChromaHue * 2.0 + 2.6);

    // Grout between tiles.
    vec2  cellUV = fract(vUV * vec2(100.0, 30.0));
    vec2  b      = min(cellUV, 1.0 - cellUV);
    float grout  = smoothstep(0.0, 0.05, min(b.x, b.y));

    // Edge-on tiles darken naturally with the flip angle.
    col *= (0.25 + 0.75 * abs(vFlip)) * vLight * grout;
    col *= 1.0 + 0.9 * audioDrop;

    fragColor = vec4(col * 1.2, 1.0);
}
