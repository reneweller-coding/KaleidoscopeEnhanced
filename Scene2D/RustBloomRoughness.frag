#version 330 core
out vec4 fragColor;
/**
 * @file RustBloomRoughness.frag
 * @brief RUST BLOOM ROUGHNESS: a chrome plate of the photo that rusts with
 * the roughness of the sound -- the psychoacoustic roughness (beating
 * partials, distortion) is the corrosion: as it rises, rust blooms across
 * the chrome from seeds, pitting the mirror; a harmony change is the
 * polish -- a wave of restored chrome sweeps the plate, and the rust
 * begins again.  Roughness is slow, so the bloom grows as a bloom does;
 * the polish sweep runs on the scene clock from the change.  Camera
 * fixed on the plate.
 *
 * Audio Reactivity:
 *   audioRoughness  -> rust extent (slow)
 *   audioHarmChange -> polish sweep (light-and-material, one sweep per change)
 *   sceneAdvance    -> sweep motion and reflection drift (continuous)
 *   audioKick       -> chrome highlight (light)
 *   audioLevel      -> brightness
 *
 * Per-activation variety: seedsP, pitP, hueP.
 */
uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float sceneAdvance;
uniform float sceneTime;
uniform float audioAdvance;
uniform float audioRoughness;
uniform float audioHarmChange;
uniform float audioKick;
uniform float audioLevel;
uniform float audioChromaHue;
uniform float audioValence;

uniform float seedsP;
uniform float pitP;
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

float hash21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise2(vec2 p)
{
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x),
               mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), f.x), f.y);
}
float fbm(vec2 p)
{
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 5; ++i) { v += a * noise2(p); p = p * 2.03 + 5.0; a *= 0.5; }
    return v;
}

void main()
{
    float aspect = resolution.x / resolution.y;
    vec2 p = (gl_FragCoord.xy / resolution - 0.5) * vec2(aspect, 1.0);
    vec2 uv = gl_FragCoord.xy / resolution;

    float hue = (hueP > 0.001) ? hueP : 0.0;
    float seeds = 2.0 + 3.0 * clamp(seedsP, 0.0, 1.0);
    float pitting = 0.3 + 0.7 * clamp(pitP, 0.0, 1.0);
    float rough = clamp(audioRoughness * 1.5, 0.0, 1.0);
    float change = clamp(audioHarmChange, 0.0, 1.0);        // pulses on a harmony change, decays

    // The chrome: the photo mirrored in a curved plate -- a reflection
    // that drifts slowly, with a bright environment highlight band.
    vec2 ruv = uv + vec2(0.02 * sin(sceneAdvance * 0.2 + uv.y * 4.0), 0.015 * cos(sceneAdvance * 0.17 + uv.x * 5.0));
    vec3 chrome = img(clamp(ruv, 0.0, 1.0));
    float band = pow(0.5 + 0.5 * sin(p.y * 5.0 + p.x * 1.5 - sceneAdvance * 0.3), 8.0);
    chrome = chrome * 0.9 + vec3(1.0) * band * (0.35 + 0.8 * audioKick);
    chrome = mix(chrome, chrome * imgPalette(hue * 0.159 + 0.5) * 1.5, 0.2);

    // Rust: blooms from seed points; the bloom radius grows with the
    // roughness; the front is ragged by noise.  The polish sweep -- a wave
    // running across the plate from the harmony change -- clears it: the
    // rust field is multiplied by (1 - sweep), and the sweep position runs
    // on the scene clock, its strength on the change envelope.
    float rust = 0.0;
    for (int i = 0; i < 5; ++i)
    {
        if (float(i) >= seeds) break;
        float fi = float(i);
        vec2 c = vec2((hash21(vec2(fi, 1.0)) - 0.5) * aspect, (hash21(vec2(fi, 2.0)) - 0.5)) * 0.9;
        float rr = length(p - c);
        float ragged = fbm(p * 6.0 + fi * 3.0) * 0.25;
        float reachR = 0.05 + 0.75 * rough * (0.7 + 0.3 * hash21(vec2(fi, 3.0)));
        rust = max(rust, smoothstep(reachR, reachR - 0.15 - ragged * 0.4, rr + ragged));
    }
    // Pitting inside the rust: fine noise.
    float pits = fbm(p * 25.0) * pitting;
    rust = clamp(rust * (0.7 + 0.5 * pits), 0.0, 1.0);
    // The polish sweep: a band travelling left to right whose height is
    // the change envelope; behind the band the plate is clean.
    float sweepX = fract(sceneAdvance * 0.25 + sceneTime * 0.05) * (aspect + 0.6) - aspect * 0.5 - 0.3;
    float sweep = smoothstep(0.25, 0.0, abs(p.x - sweepX)) * change;
    float cleaned = smoothstep(0.0, 0.3, sweepX - p.x) * change;
    rust *= 1.0 - clamp(sweep + cleaned, 0.0, 1.0);
    // Rust colour: layered oranges and browns from the palette and noise.
    vec3 rustA = mix(vec3(0.55, 0.22, 0.06), imgPalette(hue * 0.159 + 0.05), 0.3);
    vec3 rustB = mix(vec3(0.25, 0.1, 0.04), imgPalette(hue * 0.159 + 0.1) * 0.5, 0.3);
    vec3 rustCol = mix(rustA, rustB, pits) * (0.8 + 0.4 * fbm(p * 12.0 + 1.0));
    vec3 col = mix(chrome, rustCol, rust);
    // The rust front glows faintly (fresh oxide) and the polish band shines.
    float front = rust * (1.0 - rust) * 4.0;
    col += vec3(0.9, 0.5, 0.2) * front * 0.15;
    col += vec3(1.0) * sweep * 0.5;
    col *= 0.75 + 0.5 * audioLevel;

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
