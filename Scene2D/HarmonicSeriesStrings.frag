#version 330 core
out vec4 fragColor;
/**
 * @file HarmonicSeriesStrings.frag
 * @brief HARMONIC SERIES STRINGS: a monochord and its overtones.  Eight
 * strings span the frame, the n-th sounding the n-th harmonic; each shows
 * its standing wave as a lit envelope (n antinodes) -- never the fast
 * vibration itself, only the envelope, so nothing flickers -- and the
 * envelope's brightness is the energy of the band that harmonic falls in.
 * The nodes are round beads of light; the bridge glows with the bass; the
 * kick plucks (a brightness pulse down every string); the photo is the
 * soundboard.  Camera still.
 *
 * Audio Reactivity:
 *   audioSpectrum[32] -> envelope brightness per harmonic (light)
 *   audioKick         -> pluck pulse (light)
 *   audioBass         -> bridge glow (light)
 *   sceneAdvance      -> the pulse travel (continuous)
 *   audioLevel        -> brightness
 *
 * Per-activation variety: stringsP, ampP, hueP.
 */
uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float sceneAdvance;
uniform float sceneTime;
uniform float audioAdvance;
uniform float audioSpectrum[32];
uniform float audioKick;
uniform float audioBass;
uniform float audioLevel;
uniform float audioChromaHue;
uniform float audioValence;

uniform float stringsP;
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

void main()
{
    float aspect = resolution.x / resolution.y;
    vec2 p = (gl_FragCoord.xy / resolution - 0.5) * vec2(aspect, 1.0);

    float hue = (hueP > 0.001) ? hueP : 0.0;
    int nStrings = 6 + int(clamp(stringsP, 0.0, 1.0) * 4.0);
    float amp = 0.02 + 0.03 * clamp(ampP, 0.0, 1.0);
    float x0 = -aspect * 0.42, x1 = aspect * 0.42;
    float u = clamp((p.x - x0) / (x1 - x0), 0.0, 1.0);

    // Soundboard: the photo as spruce, warm, with a rosette.
    vec3 col = img(gl_FragCoord.xy / resolution) * mix(vec3(0.75, 0.6, 0.4), imgPalette(hue * 0.159 + 0.08), 0.3) * 0.6;
    col *= 0.85 + 0.15 * sin(p.y * 200.0 + p.x * 10.0);
    col += imgPalette(hue * 0.159 + 0.1) * exp(-length(p - vec2(0.0, -0.05)) * 3.0) * 0.1;
    // Bridges at both ends, glowing with the bass.
    float bridge = smoothstep(0.02, 0.012, abs(abs(p.x) - aspect * 0.43));
    col = mix(col, vec3(0.25, 0.18, 0.1), bridge);
    col += imgPalette(hue * 0.159 + 0.0) * bridge * clamp(audioBass, 0.0, 1.0) * 0.8;

    for (int n = 1; n <= 10; ++n)
    {
        if (n > nStrings) break;
        float fn = float(n);
        float y = 0.4 - (fn - 0.5) / float(nStrings) * 0.8;
        int band = int(clamp(fn * 2.5, 0.0, 31.0));
        float e = clamp(audioSpectrum[band] * 1.6, 0.0, 1.0);
        // The standing-wave envelope: |sin(n pi u)| scaled by the amplitude
        // and the energy; drawn as a soft band above and below the string.
        float env = abs(sin(fn * 3.14159 * u)) * amp * (0.4 + 0.8 * e);
        float dy = abs(p.y - y);
        float envelope = smoothstep(env + 0.004, env - 0.004, dy) * step(x0, p.x) * step(p.x, x1);
        float core = smoothstep(0.004, 0.0015, dy) * step(x0, p.x) * step(p.x, x1);
        vec3 sc = imgPalette(hue * 0.159 + fract(fn * 0.083)) * 1.5 + 0.2;
        // Pluck: a pulse travelling from the bridge down the string on the
        // clock, brightened by the kick.
        float pulse = exp(-pow((u - fract(sceneAdvance * 0.5 + fn * 0.1)) * 8.0, 2.0)) * (0.2 + 1.2 * audioKick);
        col += sc * envelope * (0.15 + 0.35 * e) * (1.0 + pulse);
        col = mix(col, vec3(0.9, 0.85, 0.7) * (0.6 + 0.6 * e) + sc * pulse, core);
        // Nodes: round beads where the envelope is zero (k/n along the string).
        for (int k = 1; k < 10; ++k)
        {
            if (k >= n) break;
            float nx = x0 + (x1 - x0) * float(k) / fn;
            float bead = smoothstep(0.012, 0.006, length(p - vec2(nx, y)));
            col = mix(col, sc * (0.5 + 0.8 * e), bead);
        }
        // The harmonic number as a small tick at the left.
        col += sc * smoothstep(0.004, 0.0, abs(p.y - y)) * step(x0 - 0.08, p.x) * step(p.x, x0 - 0.08 + 0.01 * fn) * 0.6;
    }
    col *= 0.75 + 0.5 * audioLevel;

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
