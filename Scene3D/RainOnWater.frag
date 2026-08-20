#version 330 core
out vec4 fragColor;
// RainOnWater.frag — ink-dark water under a low moon, ripple rings catching
// its long trembling reflection, drizzle falling through the night sky behind.
uniform float time;
uniform float audioChromaHue;
uniform float audioSwell;
uniform float audioMode;
uniform float audioHat;

in vec3  vWorld;
in float vSlope;
in float vDist;
in float vSky;

/**
 * @file RainOnWater.frag
 * @brief Shades a night pond and the sky curtain behind it: near-black water,
 * a trembling moon-lane reflection, pale rings where raindrops (simulated in
 * RainOnWater.vert) are still expanding across the surface, and above the
 * horizon a low moon, moonlit cloud shelves, stars and falling drizzle.
 *
 * The moon-lane reflection flares wherever vSlope (the ripple surface slope
 * from the vertex shader) is non-zero, and converges on the moon's own
 * position at the horizon.  vSky (0 = water, 1 = sky curtain) selects which
 * half of the sheet a fragment belongs to; both halves are shaded in ANGULAR
 * coordinates (world position / distance), which is what lets the lane, the
 * moon and the drizzle line up across the horizon.
 *
 * Audio Reactivity:
 *   audioChromaHue -> key tint of the base water, the night sky and the
 *                     ring-crest skylight
 *   audioSwell     -> ring-crest skylight lift, so ripples read more alive
 *   audioMode      -> COLOUR TEMPERATURE OF THE MOON: a minor key hangs a
 *                     cold blue-white moon over the pond, a major key a warm
 *                     amber one.  It colours the disc, its halo, the lane and
 *                     the drizzle it lights.  The two ends are
 *                     luminance-matched against the original lane colour, so
 *                     only the warmth changes
 *   audioHat       -> hat/cymbal onsets drive the rain harder: the drops land
 *                     deeper (see .vert) AND the falling drizzle threads in
 *                     the air brighten with every onset
 *   audioLevel     -> depth of the raindrop rings (see .vert)
 *   audioZCR       -> fine wind-chop grain across the whole surface (.vert)
 */

vec3 hueRot(vec3 c, float a)
{
    vec3  k = vec3(0.57735026919);
    float cs = cos(a), sn = sin(a);
    return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
}

float hash21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

float vnoise(vec2 p)
{
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = hash21(i),               b = hash21(i + vec2(1.0, 0.0));
    float c = hash21(i + vec2(0.0, 1.0)), d = hash21(i + vec2(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

float fbm(vec2 p)
{
    float s = 0.0, a = 0.55;
    for (int i = 0; i < 4; ++i) { s += a * vnoise(p); p = p * 2.03 + 11.7; a *= 0.5; }
    return s;
}

// Where the moon hangs, in angular coordinates (radians off the view axis).
const float kMoonX = 0.031;
const float kMoonY = 0.055;
const float kTanY  = 0.5206;      // tan(55 deg / 2) -- the scene projection

void main()
{
    // Angular position of this fragment: world offset over distance.  Both
    // halves of the sheet share this frame, so the moon in the sky and the
    // lane on the water are anchored to the same direction.
    float d  = max(vDist, 1.0);
    float ax = vWorld.x / d;
    float ay = vWorld.y / d;
    float sh = ay / kTanY;                    // 1.0 = top edge of the frame

    // The key's MODE sets the moon's warmth: cold blue-white when the harmony
    // is minor, warm amber when it is major.  Luminance-matched -- a tint,
    // not a gain.
    vec3 moonCol = mix(vec3(0.70, 0.80, 0.95), vec3(0.95, 0.87, 0.68),
                       clamp(audioMode, 0.0, 1.0));

    // The night sky's own gradient: a moonlit band along the horizon fading to
    // near-black overhead.  The water borrows it too — a pond is a mirror, and
    // the ink-dark version with nothing in it was most of why this scene read
    // as a motif stranded on black.
    vec3 horizC = hueRot(vec3(0.100, 0.135, 0.210), audioChromaHue * 0.3);
    vec3 zenC   = hueRot(vec3(0.016, 0.026, 0.055), audioChromaHue * 0.3);

    vec3 col;
    float veil;                               // drizzle strength here

    if (vSky > 0.5)
    {
        // ---------------- THE SKY ----------------
        float g = clamp(sh, 0.0, 1.0);
        col = mix(horizC, zenC, sqrt(g));

        // Cloud shelves drifting past, lit from below by the moon.
        float cl = fbm(vec2(vWorld.x * 0.016 + time * 0.006, vWorld.y * 0.030));
        cl = smoothstep(0.34, 0.92, cl);
        col += moonCol * min(cl * 0.13 * (1.0 - 0.55 * g), 0.13);

        // Stars, in the gaps the clouds leave.
        vec2  sp = vWorld.xy * 0.28;
        vec2  si = floor(sp);
        float sr = hash21(si);
        vec2  sf = fract(sp) - 0.5
                 - (vec2(hash21(si + 3.17), hash21(si + 7.71)) - 0.5) * 0.6;
        float tw = 0.55 + 0.45 * sin(time * (1.3 + sr * 3.0) + sr * 40.0);
        col += vec3(0.85, 0.90, 1.00)
             * min(step(0.90, sr) * exp(-dot(sf, sf) * 90.0) * tw * 0.9, 0.9)
             * (1.0 - 0.8 * cl);

        // The moon itself, low over the water: a soft halo and a small disc.
        float md = length(vec2(ax - kMoonX, ay - kMoonY));
        col += moonCol * min(exp(-md * md * 110.0) * 0.50, 0.50);
        col += moonCol * (1.0 - smoothstep(0.025, 0.038, md)) * 0.70;

        veil = 1.0;
    }
    else
    {
        // ---------------- THE WATER ----------------
        float horiz = clamp(vDist / 150.0, 0.0, 1.0);

        // Near-black water with the faintest key-tinted blue...
        col = hueRot(vec3(0.020, 0.045, 0.085), audioChromaHue * 0.3)
            * (0.8 + 0.4 * horiz);

        // ...lifted by the skylight it mirrors, strongest toward the horizon
        // where the surface is seen at a glancing angle.
        col += horizC * (0.10 + 0.55 * horiz * horiz);

        // Moon reflection lane.  Written in ANGULAR terms so it converges on
        // the moon at the horizon the way a real lane does, and widens as it
        // comes toward the camera instead of switching off there.
        float wide = 1.9 + 2.3 * horiz;
        float lane = exp(-abs(ax - kMoonX) * wide)
                   * (0.40 + 0.60 * horiz);
        col += moonCol * min(lane * (0.45 + 2.2 * abs(vSlope)) * 1.1, 0.75);

        // Ring crests themselves catch a whisper of skylight everywhere.
        col += vec3(0.30, 0.38, 0.48) * clamp(abs(vSlope) * 1.2, 0.0, 1.0)
             * 0.95 * (0.8 + 0.4 * audioSwell);

        col *= exp(-vDist * 0.0045);
        veil = 0.45;                          // rain reads softer over water
    }

    // DRIZZLE: thin threads of falling rain drawn across the whole view in the
    // same angular frame, so they carry straight over the horizon.  Hats and
    // cymbals ARE the rain, so every onset drives the threads harder.  Only
    // the BRIGHTNESS is audio-driven; the fall rate is a per-column constant,
    // so the accumulated phase can never jump.
    float hat = clamp(audioHat, 0.0, 1.0);
    float cu  = ax * 26.0 + ay * 3.0;
    float ci  = floor(cu);
    float hx  = hash21(vec2(ci, 5.0));
    float yc  = ay * 20.0 + time * (3.4 + hx * 2.4);
    float fy  = fract(yc);
    float thread = exp(-abs(fract(cu) - 0.5) * 13.0)
                 * smoothstep(0.45, 0.70, fy) * (1.0 - smoothstep(0.88, 1.00, fy))
                 // mod() keeps the hash argument small: after a few minutes a
                 // raw falling counter is large enough that sin() loses the
                 // fractional bits the hash lives in, and the rain would fall
                 // into a visible repeating pattern.
                 * step(0.42, hash21(vec2(ci, mod(floor(yc), 64.0))));
    col += moonCol * min(thread * (0.20 + 0.30 * hat) * veil, 0.50);

    // Final exposure.  Every additive term above is individually capped with
    // min(), and the colour-tinted result is capped once more here: the moon
    // tint alone runs to 0.95 on a channel, so a scalar cap upstream would not
    // have been enough to keep the picture off the clipping ceiling.
    col *= 1.50;
    fragColor = vec4(min(col, vec3(1.0)), 1.0);
}
