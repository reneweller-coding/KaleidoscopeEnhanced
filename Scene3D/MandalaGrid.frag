#version 330 core
out vec4 fragColor;
// MandalaGrid.frag — an 8-fold colour rosette flowing softly inward; the
// bar phase rolls a gentle ring of light through the pattern.
uniform float time;
uniform float sceneSeed;
uniform float audioAdvance;
uniform float audioBarPhase;
uniform float audioChromaHue;
uniform float audioSwell;
uniform float audioDrop;

in vec2  vPolar;
in float vLift;

vec3 hueRot(vec3 c, float a)
{
    vec3  k = vec3(0.57735026919);
    float cs = cos(a), sn = sin(a);
    return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
}

void main()
{
    float ang = vPolar.x + time * 0.04 + audioAdvance * 0.08;
    float r   = vPolar.y;

    // 6/8/10-fold mirror symmetry (rolled per activation).
    float sector = 6.2831853 / (6.0 + 2.0 * floor(sceneSeed * 2.999));
    float a8 = abs(mod(ang, sector * 2.0) - sector);

    // Slow plasma layers in folded polar space, flowing inward.
    float flow = time * 0.10 + audioAdvance * 0.20;
    float v = sin(a8 * 9.0 + r * 12.0 - flow * 2.0)
            + sin(r * 22.0 - flow * 3.0)
            + sin(a8 * 16.0 - r * 7.0 + flow);
    v *= 0.3333;

    vec3 col = hueRot(vec3(0.6 + 0.4 * sin(v * 3.14159),
                           0.45 + 0.4 * sin(v * 3.14159 + 2.09),
                           0.5 + 0.4 * sin(v * 3.14159 + 4.19)),
                      audioChromaHue + r * 1.2);

    // A soft ring of light breathes outward once per bar; petal edges glow.
    float ring  = exp(-abs(r - audioBarPhase) * 6.0);
    float petal = smoothstep(0.75, 1.0, sin(a8 * 24.0) * sin(r * 30.0));
    col *= 0.45 + 0.35 * ring + 0.45 * audioSwell + 0.6 * audioDrop;
    col += vec3(0.9, 0.8, 0.55) * petal * 0.18;
    col += col * vLift * 0.10;               // relief lighting
    col *= smoothstep(1.02, 0.94, r);        // clean rim

    // Gently desaturate — harmonic, not acid.
    float lum = dot(col, vec3(0.299, 0.587, 0.114));
    col = mix(col, vec3(lum), 0.22);

    fragColor = vec4(col * 1.25, 1.0);
}
