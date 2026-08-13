#version 330 core
out vec4 fragColor;
// OceanNight.frag — deep blue water, a moon-glitter lane running to the
// horizon, foam sparkle on the crests.
uniform float time;
uniform float audioCentroid;
uniform float audioChromaHue;
uniform float audioDrop;

in vec3  vWorld;
in float vSpec;
in float vDist;

vec3 hueRot(vec3 c, float a)
{
    vec3  k = vec3(0.57735026919);
    float cs = cos(a), sn = sin(a);
    return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
}

void main()
{
    // Deep water gradient, slightly keyed to the music.
    vec3 deep = hueRot(vec3(0.035, 0.10, 0.22), audioChromaHue * 0.4);
    vec3 col  = deep * (0.7 + 0.5 * clamp(vWorld.y * 0.25 + 0.6, 0.0, 1.0));

    // Moon-glitter lane: broad, brightening toward the horizon.
    float lane = exp(-abs(vWorld.x) * 0.016) * clamp(vDist / 90.0, 0.0, 1.0);
    float glitter = pow(vSpec, 3.0)
                  * (0.6 + 0.4 * sin(vWorld.x * 3.1 + vWorld.z * 2.7
                                     + time * 5.0));
    col += vec3(0.95, 0.92, 0.78) * lane * glitter * 3.2;
    col += vec3(0.40, 0.44, 0.50) * lane * 0.55;

    // Foam sparkle on high crests.
    float foam = smoothstep(1.2, 2.8, vWorld.y);
    col += vec3(0.45, 0.55, 0.65) * foam * 0.55;

    // Sky glow above the horizon line reflected in the far water.
    col += vec3(0.10, 0.13, 0.20) * clamp(vDist / 160.0, 0.0, 1.0);

    col *= 1.0 + 1.1 * audioDrop;
    col *= mix(vec3(0.9, 0.95, 1.05), vec3(1.05, 1.0, 0.92), audioCentroid);
    col *= exp(-vDist * 0.006);                 // haze

    fragColor = vec4(col * 1.25, 1.0);
}
