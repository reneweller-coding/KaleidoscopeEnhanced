#version 330 core
out vec4 fragColor;
/**
 * @file FataMorganaMirage.frag
 * @brief FATA MORGANA MIRAGE: a ship on the horizon seen through layered
 * air -- the mirage stretches it, inverts it, stacks it into towers that
 * shift as the air layers breathe.  The photo is the scene beyond the
 * horizon: it is drawn in horizontal slices, each slice mapped by a
 * refraction profile that wobbles slowly on the scene clock; the heat is
 * the swell (stronger stretching), the shimmer is the treble, the bass
 * is the warm haze.  Camera fixed on the shore.
 *
 * Audio Reactivity:
 *   sceneAdvance -> layer breathing (continuous)
 *   audioSwell   -> mirage strength (slow)
 *   audioHigh    -> shimmer (light-sized wobble)
 *   audioBass    -> haze warmth (light)
 *   audioLevel   -> brightness
 *
 * Per-activation variety: layersP, stackP, hueP.
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
uniform float audioHigh;
uniform float audioBass;
uniform float audioLevel;
uniform float audioChromaHue;
uniform float audioValence;

uniform float layersP;
uniform float stackP;
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

void main()
{
    float aspect = resolution.x / resolution.y;
    vec2 p = (gl_FragCoord.xy / resolution - 0.5) * vec2(aspect, 1.0);

    float hue = (hueP > 0.001) ? hueP : 0.0;
    float layers = 3.0 + 4.0 * clamp(layersP, 0.0, 1.0);
    float stack = 0.5 + 0.5 * clamp(stackP, 0.0, 1.0);
    float heat = 0.4 + 0.8 * clamp(audioSwell, 0.0, 1.0);
    float hi = clamp(audioHigh * 2.0, 0.0, 1.0);
    float clock = sceneAdvance * 0.3 + sceneTime * 0.06;
    float horizon = -0.05;

    // The true scene: the photo as a distant shore with a ship, the lower
    // part sea; we take its horizon band as the object of the mirage.
    // Mirage mapping: for a screen row above the horizon, the air layers
    // map it to a source row that folds back and forth (stretch, invert,
    // repeat) -- a triangle-wave profile in height whose period breathes.
    float y = p.y - horizon;                                       // height above the horizon
    float band = 0.25;                                             // the mirage band height
    vec3 col;
    if (y > 0.0 && y < band)
    {
        float n = y / band * layers;                               // layer coordinate
        float breathe = 1.0 + 0.25 * sin(clock * 0.7 + p.x * 2.0) * heat;
        float tri = abs(fract(n * 0.5 * breathe) * 2.0 - 1.0);    // folds: 0..1..0
        float src = mix(y / band, tri, stack * heat);              // blend true view and folded view
        // Shimmer: small horizontal wobble by the treble on a fine noise.
        float wob = (noise2(vec2(p.x * 30.0 + clock * 4.0, y * 60.0)) - 0.5) * 0.01 * (0.3 + hi);
        vec2 uv = vec2(p.x / aspect + 0.5 + wob, 0.45 + src * 0.25);
        col = img(clamp(uv, 0.0, 1.0));
        // Layer seams: thin bright lines where the folds turn.
        float seam = smoothstep(0.06, 0.0, abs(tri - 1.0)) + smoothstep(0.06, 0.0, tri);
        col += vec3(0.9, 0.95, 1.0) * seam * 0.12 * heat;
    }
    else if (y >= band)
    {
        // Sky above: the photo top, pale.
        col = img(vec2(p.x / aspect + 0.5, 0.7 + (y - band) * 0.5)) * mix(vec3(0.9, 0.95, 1.0), imgPalette(hue * 0.159 + 0.6), 0.2);
        col = mix(col, vec3(0.75, 0.85, 0.95), 0.4);
    }
    else
    {
        // Sea below: the photo bottom, mirrored faintly, darker.
        col = img(vec2(p.x / aspect + 0.5, 0.45 + y * 0.5)) * mix(vec3(0.4, 0.55, 0.7), imgPalette(hue * 0.159 + 0.55), 0.3);
        col *= 0.8 + 0.2 * sin(p.x * 60.0 + y * 40.0 + clock * 3.0);
    }
    // Haze: warm with the bass near the horizon.
    vec3 haze = mix(vec3(0.85, 0.8, 0.7), imgPalette(hue * 0.159 + 0.1), 0.3);
    col = mix(col, haze, exp(-abs(y) * 8.0) * (0.25 + 0.35 * clamp(audioBass, 0.0, 1.0)));
    col *= 0.75 + 0.5 * audioLevel;

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
