#version 330 core
out vec4 fragColor;
/**
 * @file ParticleFlow.frag
 * @brief Two million curl-noise-advected particles (simulated upstream into
 *        texParticles), rendered here as a silky, glowing flow of the photo.
 *
 * This pass adds a directional smear along a slowly rotating axis (its angle
 * driven by audioAdvance) so the particle field reads as motion blur without
 * per-particle history, plus an 8-tap halo whose radius grows with audioBeat
 * and whose strength is boosted by audioKick. audioLevel widens the smear
 * length, and audioHigh sparkles the densest filaments white. A very dark,
 * squared copy of the plain photo (tex0) is added underneath to keep the
 * gaps between filaments from going fully black.
 */
// The sim (Blend/CfxParticleStep.comp) carries the photo's colours into a
// divergence-free curl-noise flow; this pass adds the silk: an anisotropic
// smear along the local flow direction plus a soft glow.

uniform sampler2D tex0;
uniform sampler2D texParticles;   // <- requests the particle sim
uniform vec2  resolution;
uniform float time;
uniform float interpolation;

uniform float audioLevel;
uniform float audioKick;
uniform float audioBeat;
uniform float audioAdvance;
uniform float audioChromaHue;
uniform float audioHigh;

uniform float smearP;             // preset: streak length
uniform float glowP;              // preset: halo strength

void main()
{
    vec2 uv = gl_FragCoord.xy / resolution;
    vec3 col = texture(texParticles, uv).rgb;

    // Directional smear: 5 taps along a slowly rotating axis read as motion
    // blur without needing per-particle history.
    float ang = audioAdvance * 0.13 + 2.4 * texture(texParticles, uv * 0.25).r;
    vec2 dir = vec2(cos(ang), sin(ang));
    float len = (0.0012 + 0.0028 * smearP) * (1.0 + 0.8 * audioLevel);
    vec3 sm = vec3(0.0);
    for (int i = 1; i <= 5; ++i)
        sm += texture(texParticles, uv + dir * len * float(i)).rgb
            * (1.0 - float(i) * 0.15);
    col = max(col, sm * 0.30);

    // Halo
    vec3 glow = vec3(0.0);
    float r = 0.008 + 0.012 * audioBeat;
    for (int i = 0; i < 8; ++i)
    {
        float t = float(i) * 0.7854;
        glow += texture(texParticles, uv + vec2(cos(t), sin(t)) * r).rgb;
    }
    col += glow * (0.06 + 0.10 * glowP) * (1.0 + audioKick);

    // Hats sparkle on the densest filaments only.
    float dens = clamp(dot(col, vec3(0.33)), 0.0, 1.0);
    col += vec3(0.9, 0.95, 1.0) * pow(dens, 6.0) * audioHigh * 0.5;

    col = col / (1.0 + col * 0.45);

    // The sim carries the photo's colours but the per-channel knee above is a
    // divide, so it compresses each filament's bright channel harder than its
    // dark ones and comes out MORE saturated than the picture it started from:
    // 57% of the frame past HSV saturation 0.8. Pulling a fixed fraction back
    // toward the filament's own luminance restores the photo's own colour
    // relationship without touching the flow structure or its brightness.
    float _pl = dot(col, vec3(0.299, 0.587, 0.114));
    col = mix(vec3(_pl), col, 0.66);

    // A very dark version of the photo underneath keeps the frame from going
    // black in the gaps between filaments — but only just: any more and the
    // slideshow reads as the subject and the particles as an overlay.
    vec3 photo = texture(tex0, uv).rgb;
    col += photo * photo * 0.022 * (1.0 - dens);

    fragColor = vec4(col, interpolation);
}
