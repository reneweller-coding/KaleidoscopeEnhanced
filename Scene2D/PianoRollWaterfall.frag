#version 330 core
out vec4 fragColor;
/**
 * @file PianoRollWaterfall.frag
 * @brief PIANO ROLL WATERFALL: the melody falling onto a keyboard.  The
 * 96-sample melody history is drawn as note bars descending toward a
 * keyboard along the bottom -- the newest sample just above the keys, the
 * oldest at the top -- scrolling steadily with the sample clock; the key
 * of each sounding pitch class lights (chroma), the hammer flashes on the
 * kick, the photo is the piano's lid mirror and the bars' colour.
 * Camera fixed above the keys.
 *
 * Audio Reactivity:
 *   audioMelody[96] / audioMelodyHead -> the falling bars (continuous history)
 *   audioChroma[12] -> key light (light)
 *   audioKick       -> hammer flash (light)
 *   audioSwell      -> stage light (slow)
 *   audioLevel      -> brightness
 *
 * Per-activation variety: octavesP, widthP, hueP.
 */
uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float sceneAdvance;
uniform float sceneTime;
uniform float audioAdvance;
uniform float audioMelody[96];
uniform float audioMelodyHead;
uniform float audioChroma[12];
uniform float audioKick;
uniform float audioSwell;
uniform float audioLevel;
uniform float audioChromaHue;
uniform float audioValence;

uniform float octavesP;
uniform float widthP;
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

float melodyAt(float ago)
{
    float head = audioMelodyHead * 96.0;
    float f = head - ago;
    int i0 = int(floor(f)); float t = f - floor(f);
    int a = ((i0 % 96) + 96) % 96; int b = ((i0 + 1) % 96 + 96) % 96;
    return mix(audioMelody[a], audioMelody[b], t);
}

void main()
{
    float aspect = resolution.x / resolution.y;
    vec2 p = (gl_FragCoord.xy / resolution - 0.5) * vec2(aspect, 1.0);

    float hue = (hueP > 0.001) ? hueP : 0.0;
    float octaves = 2.0 + 2.0 * clamp(octavesP, 0.0, 1.0);
    float keys = octaves * 12.0;
    float span = aspect * (0.85 + 0.12 * clamp(widthP, 0.0, 1.0));
    float light = 0.6 + 0.6 * clamp(audioSwell, 0.0, 1.0);
    float keyTop = -0.28;

    // The lid: the photo mirrored and dark above the keys (the piano's
    // polished lid), the stage light on it.
    vec3 col = img(vec2(p.x / aspect + 0.5, 0.9 - (p.y + 0.5) * 0.4)) * imgPalette(hue * 0.159 + 0.6) * 0.45 * light + 0.03;
    col *= 0.5 + 0.5 * smoothstep(0.5, keyTop, p.y);
    // Key lanes on the lid: faint lines so the bars have a grid to fall along.
    col += vec3(0.05) * pow(0.5 + 0.5 * cos((p.x / span + 0.5) * keys * 6.2831853), 30.0) * step(abs(p.x), span * 0.5) * step(keyTop, p.y);
    // The bars: for each screen row above the keys, the age of the sample
    // (rows nearer the keys are newer); the pitch gives the x position.
    float ago = (p.y - keyTop) / (0.5 - keyTop) * 90.0;
    if (p.y > keyTop && p.y < 0.5)
    {
        float m = melodyAt(ago);
        // A bar exists where the melody value is non-zero: its x is the
        // pitch mapped onto the keys.
        float key = floor(m * keys);                                   // quantised to a key: bars, not a wavy line
        float x = ((key + 0.5) / keys - 0.5) * span;
        float keyW = span / keys;
        float bar = smoothstep(keyW * 0.5, keyW * 0.42, abs(p.x - x)) * step(0.02, m);
        // The bar segments: brightness by the age (newest bright), colour
        // by the pitch class of the sample.
        int cls = int(mod(floor(m * keys), 12.0));
        vec3 bc = imgPalette(hue * 0.159 + float(cls) / 12.0) * 1.5 + 0.2;
        col = mix(col, bc * (1.0 - ago / 96.0 * 0.6) * light, bar * 0.9);
        col += bc * exp(-abs(p.x - x) * 12.0) * step(0.02, m) * 0.2 * (1.0 - ago / 96.0);
    }
    // The keyboard: white and black keys; the sounding classes light.
    if (p.y <= keyTop && p.y > -0.5)
    {
        float kx = (p.x / span + 0.5) * keys;
        float ki = floor(kx);
        float kf = fract(kx);
        int cls = int(mod(ki, 12.0));
        bool black = (cls == 1 || cls == 3 || cls == 6 || cls == 8 || cls == 10);
        float e = clamp(audioChroma[cls] * 1.5, 0.0, 1.0);
        vec3 white = vec3(0.92, 0.9, 0.85) * light;
        vec3 blackKey = vec3(0.08, 0.08, 0.09);
        float blackZone = step(keyTop - 0.13, p.y);                    // black keys are short
        vec3 key = (black && blackZone > 0.5) ? blackKey : white;
        float gap = smoothstep(0.06, 0.0, min(kf, 1.0 - kf)) * 0.6;
        key *= 1.0 - gap;
        vec3 lit = imgPalette(hue * 0.159 + float(cls) / 12.0) * 1.6 + 0.2;
        key = mix(key, lit, e * 0.8);
        key += lit * audioKick * e * 0.6;
        col = mix(col, key, step(abs(p.x), span * 0.5));
        // Key front edge.
        col *= 0.75 + 0.25 * smoothstep(-0.5, -0.45, p.y);
    }
    // The hammer line: a bright rule at the key top, flashing on the kick.
    col += imgPalette(hue * 0.159 + 0.9) * smoothstep(0.005, 0.0, abs(p.y - keyTop)) * step(abs(p.x), span * 0.5) * (0.3 + 1.2 * audioKick);
    col *= 0.75 + 0.5 * audioLevel;

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
