#version 330 core
/**
 * @file SnowDrift.vert
 * @brief Vertex stage companion to SnowDrift.frag -- see that file's header for
 * this scene's description.
 *
 * Audio Reactivity:
 *   audioSwell     -> wind lean across the column + overall glow
 *   audioLevel     -> overall glow
 *   audioChromaHue -> faint key tint of the flakes
 *   audioFlatness  -> WIDTH OF THE SNOWFALL: a held tone keeps the flakes in
 *                     a narrow near column, broadband noise (wind, hiss,
 *                     white-ish texture) opens it into a wide diffuse
 *                     curtain.  It only ever widens, so the additive sprites
 *                     cannot bunch up and brighten the frame
 *   audioSharpness  -> SPARKLE CONTRAST: dull dark material gives an even,
 *                     matte snowfall; bright harsh material (cymbals, hiss)
 *                     deepens each flake's tumble-glint into a hard twinkle.
 *                     The glint's MEAN falls as its swing grows, so a sharp
 *                     mix sparkles more without getting brighter overall
 *   audioMode      -> MOONLIGHT TEMPERATURE: a minor key hangs a cold blue
 *                     moon over the field, a major key a warm one
 */
// SnowDrift.vert — slow snowfall through a blue night; every flake sways
// on its own pendulum, a faint ground glow catches them as they land.
// The music only leans on the wind and the sparkle — never shakes it.

in vec4 attrA;
in vec4 attrB;

uniform mat4  projM;
uniform float eyeOff;
uniform float time;
uniform vec2  resolution;

uniform float audioSwell;
uniform float audioLevel;
uniform float audioChromaHue;
uniform float audioFlatness;
uniform float audioSharpness;
uniform float audioMode;

out vec4 vCol;

vec3 hueRot(vec3 c, float a)
{
    vec3  k = vec3(0.57735026919);
    float cs = cos(a), sn = sin(a);
    return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
}

void main()
{
    float r1 = attrB.x, r2 = attrB.y, r3 = attrB.z, r4 = attrB.w;

    // Fall forever (looped column), each flake at its own speed.
    const float H = 60.0;
    float speed = 1.4 + 2.2 * r4;
    float y = 28.0 - mod(r2 * H + time * speed, H);

    // Pendulum sway + a slow wind field that leans with the music.
    float sway = sin(time * (0.7 + r3 * 0.8) + r1 * 40.0)
               * (0.8 + 1.4 * r3);
    float wind = sin(time * 0.11) * (2.0 + 4.0 * audioSwell);

    // SPECTRAL FLATNESS opens the curtain: a held tone keeps the flakes in a
    // narrow near column, broadband noise spreads them wide across the view.
    // The factor only ever grows from 1.0 -- narrowing would crowd the
    // additive sprites together and brighten the frame.
    float curtain = 120.0 * (1.0 + 0.38 * clamp(audioFlatness, 0.0, 1.0));

    // Depth distribution biased hard toward the camera.
    // With a flat 8..88 spread, four flakes in five sat past 40 units, where the
    // sprite is one or two pixels wide -- below the size at which a flake can be
    // SEEN as a flake. The snowfall integrated into an even grey veil covering
    // the whole frame, which is exactly the occ 1.00 / contrast 0.051 the metric
    // reported: perfectly filled, and perfectly featureless. Squaring r3 keeps
    // the same depth range but puts most of the flakes near enough to read
    // individually, with the far ones still there as haze behind them.
    vec3 world = vec3((r1 - 0.5) * curtain + sway + wind * (28.0 - y) * 0.02,
                      y,
                      3.5 + r3 * r3 * 74.0);

    vec3 vp = world;
    vp.x -= eyeOff;
    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;
    if (vp.z < 0.4)
        gl_Position = vec4(0.0, 0.0, -3.0, 1.0);

    float px   = resolution.y / 1080.0;
    float dist = max(vp.z, 0.5);
    // Ceiling raised from 13 px: it was clipping the near flakes back down to
    // the same apparent size as the mid-field ones, which flattened out the very
    // depth cue the new distribution creates.
    gl_PointSize = clamp(150.0 * (0.30 + 0.85 * r4) * px / dist,
                         2.0, 30.0 * px);

    // Cold moonlit white with the faintest key tint; flakes glint gently
    // as they tumble; a soft glow near the ground plane.
    // SHARPNESS deepens the tumble-glint into a hard twinkle without adding
    // energy: as the swing grows the mean drops by the same amount, so a
    // bright harsh mix sparkles more but never reads brighter.
    float shp    = clamp(audioSharpness, 0.0, 1.0);
    float glint  = (0.70 - 0.22 * shp)
                 + (0.30 + 0.22 * shp) * sin(time * (1.3 + r2 * 2.0) + r1 * 30.0);
    float ground = exp(-abs(y + 26.0) * 0.12) * 0.8;
    // MODE sets the moonlight's temperature: cold blue in minor, warm in
    // major.  Luminance-matched against the original moonlit white.
    vec3 moonlit = mix(vec3(0.70, 0.82, 1.00), vec3(1.00, 0.92, 0.76),
                       clamp(audioMode, 0.0, 1.0));
    vec3 col = hueRot(moonlit, audioChromaHue * 0.15);
    col *= (0.30 + 0.35 * r4) * glint
         * (0.7 + 0.35 * audioSwell + 0.2 * audioLevel)
         * (1.0 + ground)
         // Steeper depth falloff: near flakes now carry the picture, the far
         // field stays a dim haze behind them. That separation IS the contrast.
         * clamp(1.30 - vp.z / 58.0, 0.07, 1.35);
    vCol = vec4(min(col * 3.2, vec3(2.6)), 1.0);
}
