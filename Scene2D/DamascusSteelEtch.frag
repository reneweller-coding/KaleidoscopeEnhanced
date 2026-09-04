#version 330 core
out vec4 fragColor;
/**
 * @file DamascusSteelEtch.frag
 * @brief DAMASCUS STEEL ETCH: a pattern-welded blade in the acid.  The
 * billet was folded and twisted, so its layers surface as a ladder of
 * flowing bands; over the scene arc the acid bites and the pattern comes
 * up out of a blank grey blade, dark layers first, then the bright ones.
 * An oil sheen sweeps along the blade on the scene clock, the forge glow
 * behind it rides the bass, and the treble is the edge catching the light.
 * Camera fixed on the blade.
 *
 * Audio Reactivity:
 *   sceneProgress -> the etch develops (the arc)
 *   sceneAdvance  -> the oil sheen sweeps (continuous)
 *   audioBass     -> the forge glow behind (slow)
 *   audioHigh     -> the edge highlight (light)
 *   audioKick     -> a hammer strike lights the forge (light)
 *
 * Per-activation variety: layersP, twistP, hueP.
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
uniform float audioBass;
uniform float audioHigh;
uniform float audioKick;
uniform float audioSwell;
uniform float audioLevel;
uniform float audioChromaHue;
uniform float audioValence;

uniform float layersP;
uniform float twistP;
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
    vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x),
               mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), f.x), f.y);
}
float fbm(vec2 p) { float v = 0.0, a = 0.5; for (int i = 0; i < 5; ++i) { v += a * noise2(p); p = p * 2.02 + 2.9; a *= 0.5; } return v; }

void main()
{
    float aspect = resolution.x / resolution.y;
    vec2 uv = gl_FragCoord.xy / resolution;
    vec2 p = (uv - 0.5) * vec2(aspect, 1.0);

    float hue = (hueP > 0.001) ? hueP : 0.0;
    float layers = 22.0 + 26.0 * clamp(layersP, 0.0, 1.0);              // welded layers
    float twist = 0.4 + 1.4 * clamp(twistP, 0.0, 1.0);
    float bass = clamp(audioBass, 0.0, 1.0);
    float hi = clamp(audioHigh * 2.0, 0.0, 1.0);
    float prog = clamp(sceneProgress, 0.0, 1.0);
    float clock = sceneAdvance * 0.5 + sceneTime * 0.1;

    // The forge behind: dark brick with a glow that rides the bass, and a
    // flash on the kick (light only -- nothing moves).
    vec3 back = img(uv * 0.8 + 0.1) * mix(vec3(0.12, 0.1, 0.09), imgPalette(hue * 0.159 + 0.05) * 0.25, 0.4);
    back *= 0.6 + 0.4 * fbm(p * 9.0);
    vec3 forge = mix(vec3(1.0, 0.4, 0.12), imgPalette(hue * 0.159 + 0.05), 0.3);
    back += forge * exp(-length(p - vec2(0.0, -0.45)) * 2.6) * (0.25 + 0.7 * bass + 0.8 * audioKick);
    vec3 col = back;

    // The blade: a long taper across the frame, with a bevel and an edge.
    float along = p.x / aspect;                                          // -0.5 .. 0.5 along the blade
    float spineY = 0.11 - 0.05 * smoothstep(-0.1, 0.5, along);           // the spine curves down to the tip
    float edgeY = -0.13 + 0.09 * smoothstep(0.0, 0.5, along);            // the edge rises to meet it
    float tip = smoothstep(0.46, 0.4, along);                            // the point
    float tang = smoothstep(-0.44, -0.38, along);                        // the tang at the left
    float inBlade = step(edgeY, p.y) * step(p.y, spineY) * tip;
    if (inBlade > 0.5)
    {
        // Position across the blade: 0 at the edge, 1 at the spine.
        float across = (p.y - edgeY) / max(spineY - edgeY, 1e-3);
        // The pattern: the layers, twisted along the blade.  The twist
        // shears the layer coordinate by position, which is exactly what a
        // twisted bar does to its own layers.
        float u = along * 6.0;
        float v = across * 2.0 - 1.0;
        float phase = u * twist;
        float layerCoord = (v * cos(phase) + sin(u * 2.4) * 0.35 * sin(phase)) * layers;
        // The ladder: grooves cut across the bar before forging show as
        // regular waves along its length.
        layerCoord += 3.0 * sin(u * 3.4) * twist;
        // Fine turbulence, so the bands are not machine-perfect.
        layerCoord += 1.6 * fbm(vec2(u * 2.0, v * 2.0));
        float band = 0.5 + 0.5 * sin(layerCoord * 3.14159);
        // The etch: the acid takes the dark layers first, then deepens.
        float etch = smoothstep(0.05, 0.75, prog);
        float dark = smoothstep(0.45, 0.55, band);
        // Blank steel before the etch, the pattern after.
        vec3 steelLight = mix(vec3(0.78, 0.79, 0.82), imgPalette(hue * 0.159 + 0.55), 0.12);
        vec3 steelDark  = mix(vec3(0.2, 0.2, 0.23), imgPalette(hue * 0.159 + 0.6) * 0.4, 0.25);
        vec3 blank = vec3(0.6, 0.61, 0.63);
        vec3 blade = mix(blank, mix(steelDark, steelLight, dark), etch);
        // The etched surface is matt in the dark bands and bright in the
        // light ones, so the sheen picks out only the light layers.
        float matt = mix(1.0, 0.35 + 0.65 * dark, etch);
        // The bevel: the blade is thinner toward the edge, so the light
        // rolls across it.
        float bevel = 0.4 + 0.75 * sqrt(max(1.0 - pow(across * 2.0 - 1.0, 2.0), 0.0));
        blade *= 0.45 + 0.7 * bevel;
        // The oil sheen: a bright band sweeping along the blade.
        float sheen = exp(-pow((along - (fract(clock * 0.13) * 1.3 - 0.65)) * 4.5, 2.0));
        blade += vec3(1.0, 0.98, 0.92) * sheen * matt * bevel * (0.3 + 0.5 * hi) * 0.9;
        // The forge glow reflected in the steel.
        blade += forge * (0.12 + 0.4 * bass) * matt * smoothstep(0.6, 0.0, across) * 0.5;
        // The edge itself: a bright hairline where the bevels meet.
        blade += vec3(1.0) * smoothstep(0.012, 0.0, p.y - edgeY) * (0.4 + 0.9 * hi);
        // The spine is darker, rounded over.
        blade *= 1.0 - 0.3 * smoothstep(0.9, 1.0, across);
        col = mix(col, blade, inBlade);
    }
    // The tang and its scales at the left end.
    float onTang = (1.0 - tang) * step(-0.03, p.y) * step(p.y, 0.06) * step(along, -0.3);
    vec3 handle = mix(vec3(0.3, 0.18, 0.1), imgPalette(hue * 0.159 + 0.08), 0.25);
    handle *= 0.7 + 0.4 * fbm(vec2(along * 40.0, p.y * 20.0));
    col = mix(col, handle * (0.5 + 0.5 * (0.6 + 0.5 * bass)), onTang);
    // The blade's shadow on the bench.
    col *= 1.0 - 0.3 * smoothstep(0.1, 0.0, abs(p.y - edgeY + 0.05)) * tip * (1.0 - inBlade);
    // Scale and forge dust: round specks drifting up through the glow.
    vec2 dg = (p + vec2(0.0, -clock * 0.06)) * 40.0;
    vec2 dc = floor(dg), df = fract(dg) - 0.5;
    vec2 dj = vec2(hash21(dc + 1.7), hash21(dc + 6.1)) - 0.5;
    float dust = smoothstep(0.19, 0.05, length(df - dj * 0.7)) * step(0.95, hash21(dc));
    col += forge * dust * (0.3 + 0.9 * bass) * 0.8;
    col *= 0.9 + 0.2 * audioLevel;

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
