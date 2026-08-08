#version 120
// SineTunnel.frag — smooth colour bands flow along the tube; a gentle
// helix stripe winds around it.  Deep teal-violet palette, no strobes.
uniform float time;
uniform float audioAdvance;
uniform float audioChromaHue;
uniform float audioSwell;
uniform float audioKick;

varying vec2  vUV;
varying float vDist;
varying float vAng;

vec3 hueRot(vec3 c, float a)
{
    vec3  k = vec3(0.57735026919);
    float cs = cos(a), sn = sin(a);
    return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
}

void main()
{
    float flow = time * 0.35 + audioAdvance * 0.9;

    // Longitudinal colour bands drifting toward the viewer.
    float band = 0.5 + 0.5 * sin(vUV.y * 26.0 - flow * 3.0);
    // A slow double helix stripe around the wall.
    float helix = 0.5 + 0.5 * sin(vAng * 2.0 + vUV.y * 40.0 - flow * 2.0);

    vec3 a = hueRot(vec3(0.10, 0.55, 0.60), audioChromaHue);
    vec3 b = hueRot(vec3(0.45, 0.15, 0.70), audioChromaHue);
    vec3 col = mix(a, b, band);
    col += vec3(0.85, 0.75, 0.55) * pow(helix, 6.0) * 0.7;

    col *= (0.75 + 0.4 * audioSwell + 0.35 * audioKick)
         * exp(-vDist * 0.010);
    gl_FragColor = vec4(col * 1.5, 1.0);
}
