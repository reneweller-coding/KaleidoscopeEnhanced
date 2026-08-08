#version 120
// ChromeFlow.frag — fake-environment chrome: the normal indexes a smooth
// striped "sky" so the surface reads as polished metal; a warm key-light
// band and a cool counter-band glide as the surface rolls.
uniform float time;
uniform float audioChromaHue;
uniform float audioSwell;
uniform float audioCentroid;

varying vec2  vUV;
varying vec3  vNrm;
varying float vDist;

vec3 hueRot(vec3 c, float a)
{
    vec3  k = vec3(0.57735026919);
    float cs = cos(a), sn = sin(a);
    return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
}

void main()
{
    // "Environment" lookup: horizon stripes indexed by the normal.  The
    // normals are gentle, so the stripe frequency is high enough that the
    // rolling surface sweeps through several bands.
    float envY = vNrm.y * 2.2 + vNrm.x * 3.0 + vNrm.z * 2.6;
    float band1 = pow(clamp(sin(envY * 9.0 + time * 0.2) * 0.5 + 0.5,
                            0.0, 1.0), 3.0);
    float band2 = pow(clamp(sin(envY * 4.0 - time * 0.13 + 2.0) * 0.5 + 0.5,
                            0.0, 1.0), 5.0);

    vec3 base = mix(vec3(0.03, 0.04, 0.06), vec3(0.12, 0.13, 0.17),
                    clamp(envY * 0.5 + 0.4, 0.0, 1.0));
    vec3 warm = hueRot(vec3(0.95, 0.65, 0.30), audioChromaHue * 0.5);
    vec3 cool = hueRot(vec3(0.30, 0.50, 0.95), audioChromaHue * 0.5);

    vec3 col = base
             + warm * band1 * (0.55 + 0.25 * audioSwell)
             + cool * band2 * (0.40 + 0.20 * audioCentroid);

    // Broad specular from a fixed moon-light.
    float spec = pow(clamp(dot(vNrm, normalize(vec3(0.35, 0.9, -0.25))),
                           0.0, 1.0), 24.0);
    col += vec3(0.9, 0.92, 0.95) * spec * 0.7;

    col *= exp(-vDist * 0.008);
    gl_FragColor = vec4(col * 1.1, 1.0);
}
