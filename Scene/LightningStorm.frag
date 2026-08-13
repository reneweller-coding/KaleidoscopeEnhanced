#version 330 core
out vec4 fragColor;
// LightningStorm.frag — the branching discharge from Blend/CfxLightningStep.
// A bolt is mostly AFTERGLOW: the visible event is short, the bloom and the
// lit-up surroundings are what the eye actually reads, so most of the work
// here is a wide halo and using the bolt's own brightness to light the photo.

uniform sampler2D tex0;
uniform sampler2D texLightning;   // <- requests the discharge sim
uniform vec2  resolution;
uniform float time;
uniform float interpolation;

uniform float audioLevel;
uniform float audioKick;
uniform float audioBeat;
uniform float audioDrop;
uniform float audioChromaHue;

uniform float glowP;
uniform float skyP;               // how much of the photo the flash reveals

void main()
{
    vec2 uv = gl_FragCoord.xy / resolution;
    vec3 bolt = texture(texLightning, uv).rgb;

    // Two halo scales: a tight one for the filament, a very wide one for the
    // sheet-lightning glow that fills the sky.
    vec3 near = vec3(0.0), far = vec3(0.0);
    float r1 = 0.005 + 0.006 * glowP;
    float r2 = 0.055 + 0.070 * glowP;
    for (int i = 0; i < 10; ++i)
    {
        float a = float(i) * 0.6283;
        vec2 d = vec2(cos(a), sin(a));
        near += texture(texLightning, uv + d * r1).rgb;
        far  += texture(texLightning, uv + d * r2).rgb;
    }
    near /= 10.0; far /= 10.0;

    float flash = clamp(dot(far, vec3(0.4)), 0.0, 1.5);

    vec3 col = bolt * 1.5 + near * 0.9 + far * (0.55 + 0.5 * glowP);

    // The storm lights the scene: the photo is dark until a bolt fires, then
    // it is briefly revealed, cold and desaturated like real lightning.
    vec3 photo = texture(tex0, uv).rgb;
    float lum = dot(photo, vec3(0.299, 0.587, 0.114));
    vec3 lit = mix(vec3(lum), photo, 0.5) * vec3(0.80, 0.88, 1.10);
    col += lit * (0.045 + (0.35 + 0.5 * skyP) * flash);

    col *= 1.0 + 0.5 * audioDrop;
    col = col / (1.0 + col * 0.38);
    fragColor = vec4(col, interpolation);
}
