#version 330 core
out vec4 fragColor;
/**
 * @file SaffmanTaylorFingers.frag
 * @brief SAFFMAN-TAYLOR FINGERS: viscous fingering in a Hele-Shaw cell.
 * A less viscous fluid (the photo) is pushed into a more viscous one (the
 * palette) between two plates; the interface is unstable and grows fingers
 * that split at their tips.  The pattern grows over the scene arc -- the
 * radius expands and higher modes (the tip splits) come in later, all
 * continuous; the swell is the injection pressure (a slow modulation of
 * the growth), the kick lights the interface, the bass the injection port.
 * Camera still.
 *
 * Audio Reactivity:
 *   sceneProgress -> growth (the arc)
 *   audioSwell    -> pressure (slow modulation of the radius)
 *   audioKick     -> interface light (light)
 *   audioBass     -> injection glow (light)
 *   audioLevel    -> brightness
 *
 * Per-activation variety: modesP, splitP, hueP.
 */
uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float sceneAdvance;
uniform float sceneTime;
uniform float sceneProgress;
uniform float audioAdvance;
uniform float audioSwell;
uniform float audioKick;
uniform float audioBass;
uniform float audioLevel;
uniform float audioChromaHue;
uniform float audioValence;

uniform float modesP;
uniform float splitP;
uniform float hueP;

vec3 img(vec2 uv) {
    return (interpolation * texture(tex0, uv) + (1.0 - interpolation) * texture(tex1, uv)).rgb;
}

vec3 imgPalette(float t)
{
    float ang = audioChromaHue + audioAdvance * 0.04 + t * 6.2831853;
    float rad = 0.16 + 0.08 * sin(audioAdvance * 0.013);
    vec3  col = img(clamp(vec2(0.5) + rad * vec2(cos(ang), sin(ang)), 0.0, 1.0));
    float g   = dot(col, vec3(0.333));
    return mix(vec3(g), col, 0.55 + 0.45 * audioValence);
}

float hash11(float n) { return fract(sin(n * 127.1) * 43758.5453); }

// The interface radius at angle a for growth g (0..1).
float interfaceR(float a, float g, float modes, float split)
{
    float R = 0.05 + 0.75 * g;
    float r = R;
    // Low modes grow first, higher modes later (tip splitting).
    for (int n = 3; n < 24; ++n)
    {
        float fn = float(n);
        if (fn > modes) break;
        float onset = clamp((fn - 3.0) / modes, 0.0, 1.0) * 0.8;
        float amp = smoothstep(onset, onset + 0.35, g) * (0.18 / sqrt(fn)) * R * (0.6 + 0.8 * hash11(fn * 3.1)) * split;
        r += amp * cos(fn * a + hash11(fn * 7.7) * 6.28 + 0.3 * sin(g * 3.0 + fn));
    }
    return r;
}

void main()
{
    float aspect = resolution.x / resolution.y;
    vec2 p = (gl_FragCoord.xy / resolution - 0.5) * vec2(aspect, 1.0);

    float hue = (hueP > 0.001) ? hueP : 0.0;
    float modes = 8.0 + 14.0 * clamp(modesP, 0.0, 1.0);
    float split = 0.6 + 0.8 * clamp(splitP, 0.0, 1.0);
    float g = clamp(sceneProgress, 0.0, 1.0) * (0.85 + 0.15 * clamp(audioSwell, 0.0, 1.0));
    float r = length(p);
    float a = atan(p.y, p.x);

    float ri = interfaceR(a, g, modes, split);
    // Signed distance-ish: inside the fingers (the injected fluid) or outside.
    float inside = smoothstep(0.006, -0.006, r - ri);
    // Injected fluid: the photo, seen through the glass plate, with the
    // flow lines radial; the outer fluid: the palette, viscous and dark.
    vec2 flowUV = vec2(fract(a / 6.2831853 + 0.5), clamp(r / max(ri, 1e-3), 0.0, 1.0));
    vec3 inner = img(vec2(p.x / aspect + 0.5, p.y + 0.5)) * 1.2;
    inner = mix(inner, inner * imgPalette(hue * 0.159 + 0.1) * 1.6, 0.25);
    inner *= 0.8 + 0.2 * sin(flowUV.y * 40.0 - sceneAdvance * 0.5);
    vec3 outer = imgPalette(hue * 0.159 + 0.55) * 0.9 + 0.12;
    outer *= 0.85 + 0.15 * sin(r * 50.0 + a * 3.0);
    vec3 col = mix(outer, inner, inside);
    // The interface: a bright meniscus line, lit on the kick.
    float line = exp(-abs(r - ri) * 90.0);
    col += imgPalette(hue * 0.159 + 0.9) * line * (0.4 + 1.2 * audioKick);
    // The injection port at the centre glows with the bass.
    col += imgPalette(hue * 0.159 + 0.0) * exp(-r * 18.0) * (0.3 + 1.2 * clamp(audioBass, 0.0, 1.0));
    // Plate edge vignette.
    col *= 0.85 + 0.15 * (1.0 - smoothstep(0.7, 1.0, r));
    col *= 0.75 + 0.5 * audioLevel;

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
