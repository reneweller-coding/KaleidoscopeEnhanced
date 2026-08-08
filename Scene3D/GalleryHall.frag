#version 120
// GalleryHall.frag — gold-framed image crops under warm gallery light;
// ceiling strips are soft white bars.
uniform sampler2D tex0;
uniform float audioChromaHue;
uniform float audioDrop;

varying vec2  vUV;
varying vec4  vSeed;
varying float vLight;
varying float vKind;

vec3 hueRot(vec3 c, float a)
{
    vec3  k = vec3(0.57735026919);
    float cs = cos(a), sn = sin(a);
    return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
}

void main()
{
    vec3 col;
    if (vKind < 0.5)
    {
        // Seeded crop of the image inside a gold frame.
        vec2 crop = vSeed.xy * 0.5;
        col = texture2D(tex0, crop + vUV * 0.5).rgb;

        vec2  b     = min(vUV, 1.0 - vUV);
        float frame = 1.0 - smoothstep(0.045, 0.09, min(b.x, b.y));
        vec3  gold  = hueRot(vec3(0.85, 0.62, 0.22),
                             audioChromaHue * 0.3) * 0.9;
        col = mix(col, gold, frame);

        // Warm spotlight falls from above.
        col *= vLight * mix(1.15, 0.75, vUV.y) * vec3(1.06, 1.0, 0.9);
    }
    else
    {
        // Ceiling light strip: soft-edged white bar.
        vec2  b    = min(vUV, 1.0 - vUV);
        float body = smoothstep(0.0, 0.25, min(b.x, b.y));
        col = vec3(1.0, 0.97, 0.9) * body * vLight;
    }

    col *= 1.0 + 0.7 * audioDrop;
    gl_FragColor = vec4(col * 1.2, 1.0);
}
