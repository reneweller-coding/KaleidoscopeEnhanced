#version 330 core
out vec4 fragColor;
/**
 * @file PapercutShadowBox.frag
 * @brief PAPERCUT SHADOW BOX: layered paper cut-outs in a lit box.  Six
 * sheets stand one behind the other, each cut into a silhouette (hills,
 * trees, waves -- from noise), each a little further from the light and
 * therefore darker; the light behind is the photo, seen through the
 * cut-outs, in the palette's colour.  The sheets slide past one another
 * with parallax on the scene clock (a steady drift, never a jolt); the
 * chroma tints the sheets, the swell lifts the backlight, and the kick
 * lights the paper edges.
 *
 * Audio Reactivity:
 *   sceneAdvance -> parallax drift (continuous)
 *   audioChroma  -> sheet tint via the palette (light)
 *   audioSwell   -> backlight (slow)
 *   audioKick    -> paper edges flash (light)
 *   audioLevel   -> brightness
 *
 * Per-activation variety: layersP, cutP (cut roughness), hueP.
 */
uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float sceneAdvance;
uniform float sceneTime;
uniform float audioAdvance;
uniform float audioSwell;
uniform float audioKick;
uniform float audioLevel;
uniform float audioChromaHue;
uniform float audioValence;

uniform float layersP;
uniform float cutP;
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
    for (int i = 0; i < 4; ++i) { v += a * noise2(p); p = p * 2.03 + 11.0; a *= 0.5; }
    return v;
}

void main()
{
    float aspect = resolution.x / resolution.y;
    vec2 p = (gl_FragCoord.xy / resolution - 0.5) * vec2(aspect, 1.0);

    float hue = (hueP > 0.001) ? hueP : 0.0;
    int nLayers = 4 + int(clamp(layersP, 0.0, 1.0) * 3.0);
    float rough = 0.3 + 0.7 * clamp(cutP, 0.0, 1.0);
    float drift = sceneAdvance * 0.06 + sceneTime * 0.012;

    // Backlight: the photo, blurred by sampling a coarse mip, warm.
    vec3 light = (interpolation * textureLod(tex0, p * vec2(0.5, 0.8) + 0.5, 3.0).rgb + (1.0 - interpolation) * textureLod(tex1, p * vec2(0.5, 0.8) + 0.5, 3.0).rgb);
    light = light * imgPalette(hue * 0.159 + 0.1) * 2.5 * (0.7 + 0.6 * clamp(audioSwell, 0.0, 1.0)) + 0.15;
    vec3 col = light;

    // Sheets from the back to the front: each a silhouette (everything below
    // a noisy skyline is paper), darker toward the front, with parallax.
    for (int k = 0; k < 7; ++k)
    {
        if (k >= nLayers) break;
        float fk = float(k);
        float depth = 1.0 - fk / float(nLayers);         // 1 back .. ~0 front
        float par = 0.03 + 0.12 * (1.0 - depth);          // front sheets drift more
        float x = p.x + drift * par * 6.0 + fk * 3.7;
        float skyline = -0.55 + 0.65 * depth + 0.22 * fbm(vec2(x * 1.5, fk)) * rough + 0.06 * sin(x * 7.0 + fk);
        float paper = 1.0 - smoothstep(skyline, skyline + 0.004, p.y);
        // Cut-out ornaments: holes in the paper (trees, windows) that let
        // the light through.
        float holes = smoothstep(0.62, 0.7, fbm(vec2(x * 4.0, p.y * 6.0 + fk * 2.0)));
        paper *= 1.0 - holes * step(p.y, skyline - 0.05);
        // Colour: dark paper, lit a little from the back by the layers behind.
        vec3 sheet = imgPalette(hue * 0.159 + 0.55 + 0.08 * fk) * (0.08 + 0.35 * depth);
        // Edge light on the skyline, flashing on the kick.
        float edge = exp(-abs(p.y - skyline) * 60.0);
        sheet += imgPalette(hue * 0.159 + 0.95) * edge * (0.2 + 0.8 * audioKick) * (0.3 + 0.7 * depth);
        col = mix(col, sheet, paper);
        // A faint glow bleeds around each sheet's edge from behind.
        col += light * exp(-max(p.y - skyline, 0.0) * 14.0) * 0.08 * (1.0 - paper);
    }
    col *= 0.7 + 0.5 * audioLevel;
    col *= 1.0 - 0.3 * smoothstep(0.75, 1.15, length(p));

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
