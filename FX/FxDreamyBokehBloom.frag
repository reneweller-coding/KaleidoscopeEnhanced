#version 330 core
out vec4 fragColor;
// FxDreamyBokehBloom.frag
// -----------------------------------------------------------------------
// FX DREAMY BOKEH BLOOM: Smooth depth-of-field bokeh blur and lens bloom
// transition. The outgoing scene melts into a soft out-of-focus bokeh field
// of luminous circular aperture discs and resolves into the incoming scene.
//   interpolation -> sweeps camera focus distance & circle-of-confusion blur
//   audioKick     -> flashes luminous bokeh highlight discs
//   audioSwell    -> broadens dreamy lens bloom radius
//
// Per-activation variety:
//   bokehP float circle-of-confusion blur radius (0.5..2.2)
//   bloomP float luminous highlight bloom gain   (0.5..2.0)
//   speedP float animation speed multiplier      (0.5..2.0)
//   hueP   float bokeh chromatic hue offset      (0..6.28)
// -----------------------------------------------------------------------

uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float audioPhase;
uniform float audioAdvance;
uniform float audioSwell;
uniform float audioLevel;
uniform float audioKick;
uniform float audioCentroid;
uniform float audioValence;
uniform float audioSubBass;
uniform float audioBass;
uniform float audioMid;
uniform float audioHigh;
uniform float audioFlux;
uniform float audioChromaHue;

uniform float bokehP;
uniform float bloomP;
uniform float speedP;
uniform float hueP;

vec3 hueRot(vec3 c, float a) {
    vec3 k = vec3(0.57735026919);
    float cs = cos(a), sn = sin(a);
    return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
}

void main() {
    float bkh = (bokehP > 0.0) ? bokehP : 1.0;
    float blm = (bloomP > 0.0) ? bloomP : 1.0;
    float spd = (speedP > 0.0) ? speedP : 1.0;
    float hue = (hueP   > 0.0) ? hueP   : 0.0;

    vec2 uv = gl_FragCoord.xy / resolution.xy;

    float t = time * 0.4 * spd + audioAdvance * 0.2;
    float tProg = clamp(interpolation, 0.0, 1.0);
    float midTransition = sin(tProg * 3.14159265);

    // Multi-tap bokeh disc sampling
    float blurRadius = midTransition * 0.025 * bkh * (1.0 + audioBass * 0.5);

    vec3 c1Acc = vec3(0.0);
    vec3 c0Acc = vec3(0.0);
    float totalWeight = 0.0;

    // 12-tap golden angle Fermat spiral disc
    float goldenAngle = 2.39996323;
    for (int i = 0; i < 12; ++i) {
        float r = sqrt(float(i + 1) / 12.0) * blurRadius;
        float theta = float(i) * goldenAngle;
        vec2 offset = vec2(cos(theta), sin(theta)) * r;

        vec3 s1 = texture(tex1, fract(uv + offset)).rgb;
        vec3 s0 = texture(tex0, fract(uv + offset)).rgb;

        // Weight highlights more heavily for bokeh bloom
        float w1 = 1.0 + dot(s1, vec3(0.333)) * blm;
        float w0 = 1.0 + dot(s0, vec3(0.333)) * blm;

        c1Acc += s1 * w1;
        c0Acc += s0 * w0;
        totalWeight += (w1 + w0) * 0.5;
    }

    vec3 c1 = c1Acc / (totalWeight * 0.5);
    vec3 c0 = c0Acc / (totalWeight * 0.5);

    vec3 col = mix(c1, c0, tProg);

    // Luminous bloom glow on kick
    float bloomGlow = midTransition * (audioKick * 0.5 + audioSwell * 0.3);
    col += bloomGlow * vec3(1.0, 0.95, 0.85);

    if (audioChromaHue != 0.0) col = hueRot(col, audioChromaHue);
    if (hue > 0.001) col = hueRot(col, hue);

    fragColor = vec4(col, 1.0);
}
