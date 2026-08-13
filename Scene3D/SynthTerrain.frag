#version 330 core
out vec4 fragColor;
// SynthTerrain.frag — dark ground, glowing synthwave grid lines.
uniform float time;
uniform float audioKick;
uniform float audioChromaHue;
uniform float audioCentroid;
uniform float audioDrop;
uniform float audioBarPhase;

in vec3  vWorld;
in float vDist;

vec3 hueRot(vec3 c, float a)
{
    vec3  k = vec3(0.57735026919);
    float cs = cos(a), sn = sin(a);
    return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
}

void main()
{
    // Grid lines every 6 world units, glowing.
    float gx = abs(fract(vWorld.x / 6.0) - 0.5) * 2.0;
    float gz = abs(fract(vWorld.y / 6.0) - 0.5) * 2.0;
    float line = max(smoothstep(0.90, 1.0, gx), smoothstep(0.90, 1.0, gz));

    // A bright scan pulse sweeps toward the horizon once per bar.
    float sweep = exp(-abs(fract(vWorld.y * 0.004 - audioBarPhase) - 0.5) * 14.0);

    vec3 ground = mix(vec3(0.02, 0.01, 0.05), vec3(0.05, 0.02, 0.10),
                      clamp(vWorld.z / 22.0, 0.0, 1.0));
    vec3 lineCol = mix(vec3(1.0, 0.25, 0.75), vec3(0.25, 0.85, 1.0),
                       clamp(vWorld.z / 20.0, 0.0, 1.0));
    lineCol = hueRot(lineCol, audioChromaHue * 1.2);

    vec3 col = ground
             + lineCol * line * (0.9 + 1.1 * audioKick + 1.6 * audioDrop
                                     + 0.8 * sweep)
             + lineCol * sweep * 0.10;
    col *= mix(vec3(0.85, 0.9, 1.1), vec3(1.1, 1.0, 0.85), audioCentroid);
    col *= exp(-vDist * 0.010);                    // horizon fog

    fragColor = vec4(col, 1.0);
}
