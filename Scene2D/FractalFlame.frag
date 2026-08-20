#version 330 core
out vec4 fragColor;
/**
 * @file FractalFlame.frag
 * @brief Displays and grades the density field produced by the compute-shader chaos-game fractal flame.
 *
 * The GPU chaos game (CfxFlame compute pass) does the actual fractal iteration into texFlame; this pass only tone-maps it: a 6-tap bloom, a filmic knee, a bounded hue rotation, and a peek of the photo showing through the flame's dark gaps. audioBeat and audioLevel drive a beat-pumped zoom and a slow rotation around the frame centre, with audioAdvance integrating the rotation so it stays jump-free, audioKick and audioLevel intensify the bloom halo, audioChromaHue rotates the flame's hue within a bounded sine sweep, and audioMusic gates how much of the photo shows through the flame's dark regions.
 */
// FractalFlame.frag — displays the compute-shader flame density field.
// The chaos game (Blend/CfxFlame.comp) does all the work; this pass only
// grades it: a filmic curve, a slow chromatic bloom and a whisper of the
// photo underneath so the slideshow still breathes through the fractal.

uniform sampler2D tex0;
uniform sampler2D texFlame;      // <- requests the fractal-flame sim
uniform vec2  resolution;
uniform float time;
uniform float interpolation;

uniform float audioLevel;
uniform float audioBeat;
uniform float audioKick;
uniform float audioChromaHue;
uniform float audioAdvance;
uniform float audioMusic;

uniform float glowP;             // preset: bloom strength
uniform float photoP;            // preset: how much photo shows through

void main()
{
    vec2 uv = gl_FragCoord.xy / resolution;

    // Slow drift + beat-pumped zoom around the centre keeps the frame alive
    // even where the attractor itself is momentarily still.
    vec2 c = uv - 0.5;
    float z = 1.0 - 0.035 * audioBeat - 0.02 * audioLevel;
    float a = 0.035 * sin(audioAdvance * 0.20);
    mat2 R = mat2(cos(a), -sin(a), sin(a), cos(a));
    vec2 fuv = R * c * z + 0.5;

    vec3 flame = texture(texFlame, fuv).rgb;

    // Cheap 6-tap bloom on the density: the filaments get their halo.
    vec3 bloom = vec3(0.0);
    float r = 0.006 + 0.010 * audioLevel;
    for (int i = 0; i < 6; ++i)
    {
        float t = float(i) * 1.0472;
        bloom += texture(texFlame, fuv + vec2(cos(t), sin(t)) * r).rgb;
    }
    bloom /= 6.0;

    vec3 col = flame + bloom * (0.55 + glowP) * (0.8 + 0.6 * audioKick);

    // Filmic knee — the log-density already compresses, this just keeps the
    // hottest cores from clipping to flat white.
    col = col / (1.0 + col * 0.55);

    // Hue rotation is bounded through a sine so a full-turn chromaHue offset
    // can never send the flame through an implausible colour sweep.
    float hr = 0.16 * sin(audioChromaHue);
    float cs = cos(hr), sn = sin(hr);
    mat3 hue = mat3(0.299 + 0.701 * cs + 0.168 * sn,
                    0.587 - 0.587 * cs + 0.330 * sn,
                    0.114 - 0.114 * cs - 0.497 * sn,
                    0.299 - 0.299 * cs - 0.328 * sn,
                    0.587 + 0.413 * cs + 0.035 * sn,
                    0.114 - 0.114 * cs + 0.292 * sn,
                    0.299 - 0.300 * cs + 1.250 * sn,
                    0.587 - 0.588 * cs - 1.050 * sn,
                    0.114 + 0.886 * cs - 0.203 * sn);
    col = clamp(hue * col, 0.0, 4.0);

    // The chaos game writes its density in fully-saturated primaries and the
    // knee above is a per-channel divide, so it compresses the bright channel
    // harder than the dark ones and SHARPENS hue rather than softening it: over
    // 47% of the frame came out past HSV saturation 0.8. Pulling a fixed
    // fraction back toward the flame's own luminance keeps the palette and the
    // filament structure exactly as the sim drew them, only less screaming.
    float _fl = dot(col, vec3(0.299, 0.587, 0.114));
    col = mix(vec3(_fl), col, 0.68);

    // The photo only shows where the flame is dark, so it reads as the room
    // the fractal is burning in rather than a competing layer.
    vec3 photo = texture(tex0, uv).rgb;
    float hole = 1.0 - clamp(dot(col, vec3(0.33)), 0.0, 1.0);
    col += photo * photo * (0.05 + photoP) * hole * audioMusic;

    fragColor = vec4(col, interpolation);
}
