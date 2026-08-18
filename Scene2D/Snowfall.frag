#version 330 core
out vec4 fragColor;
// Snowfall.frag — a blizzard in front of the photograph.
// -----------------------------------------------------------------------
// Depth here is bought with layers rather than with geometry: several sheets of
// flakes, each with its own size, speed and blur.  The near sheets are big,
// fast and badly out of focus; the far ones are small, slow and sharp.  That
// combination — parallax plus a focus that changes with it — is what the eye
// reads as distance, and it is why a single layer of flakes always looks like
// dust on the lens instead of like weather.
//
// The wind is a single field shared by every layer, so the whole storm gusts
// together while the layers still drift past each other.
// -----------------------------------------------------------------------

uniform sampler2D tex0;
uniform vec2  resolution;
uniform float time;
uniform float interpolation;

uniform float audioLevel;
uniform float audioBeat;
uniform float audioKick;
uniform float audioHigh;
uniform float audioSubBass;
uniform float audioAdvance;
uniform float audioAmbient;
uniform float audioChromaHue;

uniform float densityP;     // preset: flakes per layer
uniform float windP;        // preset: gust strength
uniform float depthP;
uniform sampler2D tex1;
uniform float audioValence;       // preset: how much the photo recedes

vec3 img(vec2 uv) {
    return (interpolation * texture(tex0, uv) + (1.0 - interpolation) * texture(tex1, uv)).rgb;
}


// IMG-PALETTE (house standard): colours come from a rotating arc in the
// CURRENT slideshow image, so every activation inherits a fresh palette from
// the photos; the arc follows the musical key (audioChromaHue is circular-
// slewed = jump-free) with a slow advance drift, valence shapes saturation.
vec3 imgPalette(float t)
{
    float ang = audioChromaHue + audioAdvance * 0.04 + t * 6.2831853;
    float rad = 0.16 + 0.08 * sin(audioAdvance * 0.013);
    vec3  pc  = img(clamp(vec2(0.5) + rad * vec2(cos(ang), sin(ang)), 0.0, 1.0));
    float pg  = dot(pc, vec3(0.333));
    return mix(vec3(pg), pc, 0.55 + 0.45 * audioValence);
}


// House tint: bend a colour toward the photo palette while keeping its
// luminance -- the identity look survives, only the hue follows the photos.
vec3 palTint(vec3 c, float t, float k)
{
    vec3 tp = imgPalette(t);
    tp *= dot(c, vec3(0.3333)) / max(dot(tp, vec3(0.3333)), 1e-3);
    return mix(c, tp, k);
}
float hash11(float p) { return fract(sin(p * 127.1) * 43758.5453); }
vec2  hash21(float p)
{
    return fract(sin(vec2(p * 127.1, p * 311.7)) * 43758.5453);
}

// One sheet of flakes.  Returns coverage; 'soft' is how out of focus it is.
float layer(vec2 uv, float aspect, float cells, float speed, float soft, float seed)
{
    // The shared wind field.  It is a function of HEIGHT, so a gust travels
    // down the frame rather than shifting everything at once.
    float wind = windP * (0.35 * sin(audioAdvance * 0.5 + uv.y * 2.2)
                        + 0.20 * sin(audioAdvance * 0.9 + uv.y * 5.1))
               * (0.6 + 0.9 * audioSubBass + 0.5 * audioKick);

    vec2 p = vec2(uv.x * aspect, uv.y);
    // Falling: the phase comes from audioAdvance, so gusts change the drift
    // without the fall speed ever jumping.
    p.y += audioAdvance * speed * 0.06 + time * speed * 0.010;
    p.x += wind * speed * 0.35;

    vec2 gp = p * cells;
    vec2 gi = floor(gp);
    vec2 gf = fract(gp);

    float acc = 0.0;
    // Three cells across is enough: a flake never reaches further than one
    // cell from its own, and sampling more only costs.
    for (int y = -1; y <= 1; ++y)
        for (int x = -1; x <= 1; ++x)
        {
            vec2 o = vec2(float(x), float(y));
            vec2 h = hash21(dot(gi + o, vec2(41.0, 289.0)) + seed);

            // Not every cell carries a flake, or the storm is a regular grid.
            if (h.x > 0.30 + 0.62 * densityP)
                continue;

            // A slow sway, different per flake — snow does not fall straight.
            vec2 c = o + h + 0.16 * vec2(sin(audioAdvance * 1.4 + h.y * 31.0),
                                          0.0);
            float d = length((c - gf) * vec2(1.0, 1.0));

            float r = (0.05 + 0.16 * h.y) * (1.0 + 0.5 * soft);
            // The blur IS the depth cue: near flakes get a wide, soft falloff,
            // far ones a tight one.
            acc += smoothstep(r, r * (0.15 + 0.7 * soft), d);
        }
    return clamp(acc, 0.0, 1.0);
}

void main()
{
    vec2 uv = gl_FragCoord.xy / resolution;
    float aspect = resolution.x / max(resolution.y, 1.0);

    // The photo behind the storm: darkened and cooled, because that is what
    // heavy snowfall does to everything behind it.
    vec3 photo = texture(tex0, uv * (1.0 - 0.04 * depthP) + 0.02 * depthP).rgb;
    vec3 haze = palTint(mix(vec3(0.10, 0.13, 0.19), vec3(0.42, 0.48, 0.58),
                    0.25 + 0.45 * audioAmbient), 0.20, 0.22);
    vec3 col = mix(photo * 0.55, haze, 0.30 + 0.40 * depthP);

    // Flake tint: white, nudged a little by the harmony so the storm belongs
    // to the same picture as everything else.
    vec3 flake = mix(vec3(1.0), vec3(0.85, 0.92, 1.0), 0.5)
               * (0.85 + 0.3 * audioLevel);
    float hr = 0.06 * sin(audioChromaHue);
    flake.rb = mat2(cos(hr), -sin(hr), sin(hr), cos(hr)) * flake.rb;

    // Far to near.  Each layer is composited OVER the ones behind it, so the
    // near flakes actually hide the far ones instead of adding to them.
    float l4 = layer(uv, aspect, 26.0, 0.35, 0.15, 11.0);
    col = mix(col, flake * 0.75, l4 * 0.55);

    float l3 = layer(uv, aspect, 17.0, 0.60, 0.35, 37.0);
    col = mix(col, flake * 0.85, l3 * 0.70);

    float l2 = layer(uv, aspect, 10.0, 1.00, 0.65, 71.0);
    col = mix(col, flake * 0.95, l2 * 0.80);

    float l1 = layer(uv, aspect,  5.5, 1.65, 1.00, 103.0);
    col = mix(col, flake, l1 * 0.85);

    // Treble makes the whole storm sparkle — ice catching light.
    col += flake * (l1 + l2) * 0.10 * audioHigh;

    col *= 1.0 + 0.14 * audioBeat;
    col = col / (1.0 + col * 0.16);
    fragColor = vec4(col, interpolation);
}
