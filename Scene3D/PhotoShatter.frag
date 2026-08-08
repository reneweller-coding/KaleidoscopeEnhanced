#version 120
// PhotoShatter.frag — plain image shards with a hot edge while flying.
uniform sampler2D tex0;
uniform float audioDrop;
uniform float audioChromaHue;

varying vec2  vUV;
varying float vLight;

vec3 hueRot(vec3 c, float a)
{
    vec3  k = vec3(0.57735026919);
    float cs = cos(a), sn = sin(a);
    return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
}

void main()
{
    vec3 col = texture2D(tex0, vUV).rgb * vLight;

    // Hot fracture edges, strongest during the blast.
    vec2  cellUV = fract(vUV * vec2(75.0, 40.0));
    vec2  b      = min(cellUV, 1.0 - cellUV);
    float edge   = 1.0 - smoothstep(0.0, 0.10, min(b.x, b.y));
    col += hueRot(vec3(1.0, 0.55, 0.20), audioChromaHue)
         * edge * (0.15 + 1.6 * audioDrop);

    gl_FragColor = vec4(col * 1.15, 1.0);
}
