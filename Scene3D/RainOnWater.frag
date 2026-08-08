#version 120
// RainOnWater.frag — ink-dark water, ripple rings caught by a low moon,
// its long reflection trembling where the rings pass.
uniform float time;
uniform float audioChromaHue;
uniform float audioSwell;

varying vec3  vWorld;
varying float vSlope;
varying float vDist;

vec3 hueRot(vec3 c, float a)
{
    vec3  k = vec3(0.57735026919);
    float cs = cos(a), sn = sin(a);
    return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
}

void main()
{
    // Near-black water with the faintest key-tinted blue.
    vec3 col = hueRot(vec3(0.020, 0.045, 0.085), audioChromaHue * 0.3)
             * (0.8 + 0.4 * clamp(vDist / 90.0, 0.0, 1.0));

    // Moon reflection lane; ripples crossing it flare softly.
    float lane = exp(-abs(vWorld.x - 8.0) * 0.030)
               * clamp(vDist / 60.0, 0.0, 1.0);
    col += vec3(0.85, 0.85, 0.75) * lane
         * (0.45 + 2.2 * abs(vSlope)) * 1.1;

    // Ring crests themselves catch a whisper of skylight everywhere.
    col += vec3(0.30, 0.38, 0.48) * clamp(abs(vSlope) * 1.2, 0.0, 1.0)
         * 0.9 * (0.8 + 0.4 * audioSwell);

    col *= exp(-vDist * 0.007);
    gl_FragColor = vec4(col * 1.3, 1.0);
}
