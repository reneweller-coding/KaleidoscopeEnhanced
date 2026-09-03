#version 330 core
out vec4 fragColor;
/**
 * @file PendulumWaveTempo.frag
 * @brief PENDULUM WAVE TEMPO: the pendulum-wave demonstration -- a row of
 * pendulums whose periods are tempo divisions (the n-th pendulum makes
 * n/8 more swings than the first in one cycle), so the row drifts from a
 * line into a travelling wave, into two counter-waves, into chaos and back
 * into a line.  The swings run on the scene clock (continuous, never on a
 * beat tracker, so no resync can jolt them); the bobs are round photo
 * discs; the bob that passes through centre lights the beat.  Camera still.
 *
 * Audio Reactivity:
 *   sceneAdvance -> the swings (continuous; rate ~ the music's energy)
 *   audioBeat    -> bob and string highlight (light)
 *   audioSwell   -> lamp brightness (slow)
 *   audioBass    -> bob glow (light)
 *   audioLevel   -> brightness
 *
 * Per-activation variety: countP, ampP, hueP.
 */
uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float sceneAdvance;
uniform float sceneTime;
uniform float audioAdvance;
uniform float audioBeat;
uniform float audioSwell;
uniform float audioBass;
uniform float audioLevel;
uniform float audioChromaHue;
uniform float audioValence;

uniform float countP;
uniform float ampP;
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

float segDist(vec2 p, vec2 a, vec2 b)
{
    vec2 d = b - a; float t = clamp(dot(p - a, d) / dot(d, d), 0.0, 1.0);
    return length(p - (a + d * t));
}

void main()
{
    float aspect = resolution.x / resolution.y;
    vec2 p = (gl_FragCoord.xy / resolution - 0.5) * vec2(aspect, 1.0);

    float hue = (hueP > 0.001) ? hueP : 0.0;
    float n = floor(9.0 + 7.0 * clamp(countP, 0.0, 1.0));       // pendulums, once per activation
    float amp = 0.35 + 0.35 * clamp(ampP, 0.0, 1.0);             // swing amplitude (rad)
    float lamp = 0.6 + 0.8 * clamp(audioSwell, 0.0, 1.0);
    float clock = sceneAdvance * 0.9 + sceneTime * 0.15;         // the cycle clock

    // Background: the photo as the dark lab wall, lamp-lit from above.
    vec3 col = img(gl_FragCoord.xy / resolution) * mix(vec3(0.2), imgPalette(hue * 0.159 + 0.55) * 0.4, 0.5);
    col *= (0.5 + 0.5 * exp(-(0.5 - p.y) * 1.5)) * lamp;
    // The beam the pendulums hang from.
    float beamY = 0.42;
    col = mix(col, vec3(0.35, 0.28, 0.18) * lamp, smoothstep(0.02, 0.015, abs(p.y - beamY)));

    float beat = clamp(audioBeat, 0.0, 1.0);
    // Pendulums: pivot x_i along the beam; length L_i decreasing so the
    // i-th makes (base + i) swings per cycle; the wave seen from the front
    // is the row of bobs, each at angle a_i = amp * sin(2 pi f_i t).
    for (int i = 0; i < 16; ++i)
    {
        if (float(i) >= n) break;
        float fi = float(i);
        float x0 = (fi + 0.5) / n * aspect * 0.92 - aspect * 0.46;
        float swings = 8.0 + fi;                                    // per cycle
        float L = 0.7 * pow(8.0 / swings, 2.0) + 0.12;              // T ~ sqrt(L)
        float a = amp * sin(clock * swings * 0.35);
        vec2 bob = vec2(x0 + sin(a) * L, beamY - cos(a) * L);
        // String.
        float sd = segDist(p, vec2(x0, beamY), bob);
        col = mix(col, vec3(0.8) * lamp, smoothstep(0.0025, 0.0, sd) * 0.8);
        // Bob: a round photo disc with a rim; the one near the centre line
        // (a ~ 0, fastest) catches the beat light.
        float r = 0.028 + 0.006 * (1.0 - fi / n);
        float d = length(p - bob);
        float disc = smoothstep(r, r * 0.85, d);
        vec3 face = img(clamp((p - bob) / r * 0.5 + vec2(0.5 + fi * 0.05, 0.5), 0.0, 1.0));
        vec3 bc = mix(face, imgPalette(hue * 0.159 + fi / n), 0.35) * lamp;
        float centre = exp(-abs(a) * 12.0);
        bc += imgPalette(hue * 0.159 + 0.9) * centre * (0.2 + 1.0 * beat);
        bc += vec3(1.0) * pow(max(1.0 - length((p - bob) / r - vec2(-0.3, 0.3)), 0.0), 4.0) * 0.5;
        col = mix(col, bc, disc);
        // Glow with the bass.
        col += imgPalette(hue * 0.159 + fi / n) * exp(-d * 25.0) * 0.25 * clamp(audioBass, 0.0, 1.0);
        // Shadow on the wall behind.
        col *= 1.0 - 0.35 * smoothstep(r * 1.6, r * 0.9, length(p - bob - vec2(0.02, -0.03)));
    }
    col *= 0.75 + 0.5 * audioLevel;

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
