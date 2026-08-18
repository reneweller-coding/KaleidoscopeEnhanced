#version 330 core
out vec4 fragColor;
// PhotoShatter.frag — plain image shards with a hot edge while flying.
uniform sampler2D tex0;
uniform float audioDrop;
uniform float audioChromaHue;

in vec2  vUV;
in float vLight;

/**
 * @file PhotoShatter.frag
 * @brief Shades one flying shard of the shattered current photo (tex0):
 * the plain image, lit by vLight, with hot fracture-line edges.
 *
 * audioDrop is what ignites the fracture edges — they stay faint between
 * drops and blaze orange on one — and audioChromaHue hue-rotates that
 * edge colour so it tracks the music's key.
 */

vec3 hueRot(vec3 c, float a)
{
    vec3  k = vec3(0.57735026919);
    float cs = cos(a), sn = sin(a);
    return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
}

void main()
{
    vec3 col = texture(tex0, vUV).rgb * vLight;

    // Hot fracture edges, strongest during the blast.
    vec2  cellUV = fract(vUV * vec2(75.0, 40.0));
    vec2  b      = min(cellUV, 1.0 - cellUV);
    float edge   = 1.0 - smoothstep(0.0, 0.10, min(b.x, b.y));
    col += hueRot(vec3(1.0, 0.55, 0.20), audioChromaHue)
         * edge * (0.15 + 1.6 * audioDrop);

    fragColor = vec4(col * 1.15, 1.0);
}
