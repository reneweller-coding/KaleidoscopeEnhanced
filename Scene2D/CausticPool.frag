#version 330 core
out vec4 fragColor;
/**
 * @file CausticPool.frag
 * @brief The photograph seen as a pool floor through a rippling water surface lit by caustics.
 *
 * texCaustics (written by the CfxPhoton compute pass) supplies both the refraction, whose gradient bends the tex0 lookup so the floor appears to wobble under moving water, and the light pattern itself, blurred into a soft glow and blended in multiplicatively so it reveals the floor rather than sitting on top of it. The warpP and glowP presets scale refraction strength and blur radius.
 *
 * Audio Reactivity:
 *  - audioSubBass   -> strengthens the refraction, so the floor wobbles harder
 *  - audioLevel     -> brightens the multiplicative caustic light
 *  - audioBeat      -> brightens the squared caustic glow term
 *  - audioAmbient   -> dims or lifts the whole image
 *  - audioSharpness -> caustic-net CRISPNESS: a bright, incisive mix tightens the
 *                      glow blur radius to a sharp filigree net, a dull mix lets
 *                      it bloom into a soft wide shimmer
 *  - audioRolloff   -> water COLOUR TEMPERATURE: bass-concentrated music gives a
 *                      deep, cold blue pool, energy reaching into the highs turns
 *                      it into shallow bright turquoise
 *  - audioLowMid    -> harmonic warmth thickens the water: more low-mid body means
 *                      a denser depth tint away from the lit caustic lines
 */
// CausticPool.frag — the photo as a pool floor under a rippling surface.
// Blend/CfxPhoton.comp splats refracted photons into texCaustics; here the
// same caustic field also displaces the floor, so the picture appears to be
// seen THROUGH moving water rather than having a light pattern laid over it.

uniform sampler2D tex0;
uniform sampler2D texCaustics;    // <- requests the wave + photon sim
uniform vec2  resolution;
uniform float time;
uniform float interpolation;

uniform float audioLevel;
uniform float audioBeat;
uniform float audioKick;
uniform float audioSubBass;
uniform float audioChromaHue;
uniform float audioAmbient;
uniform float audioSharpness;   // 0=dull/dark .. 1=sharp/bright -> caustic-net crispness
uniform float audioRolloff;     // 0=bass-bound .. 1=reaching into the highs -> water colour temperature
uniform float audioLowMid;      // 150-500 Hz harmonic warmth -> water body / depth-tint density

uniform float warpP;              // refraction strength
uniform float glowP;

void main()
{
    vec2 uv = gl_FragCoord.xy / resolution;
    vec2 px = 1.0 / resolution;

    vec3 caus = texture(texCaustics, uv).rgb;

    // Gradient of the caustic field ~ the surface slope: use it to refract
    // the floor.  Cheap, and automatically in step with the light pattern.
    float cx = dot(texture(texCaustics, uv + vec2(px.x * 3.0, 0.0)).rgb
                 - texture(texCaustics, uv - vec2(px.x * 3.0, 0.0)).rgb, vec3(0.33));
    float cy = dot(texture(texCaustics, uv + vec2(0.0, px.y * 3.0)).rgb
                 - texture(texCaustics, uv - vec2(0.0, px.y * 3.0)).rgb, vec3(0.33));
    vec2 refr = vec2(cx, cy) * (0.020 + 0.050 * warpP) * (1.0 + 0.6 * audioSubBass);

    vec3 floorCol = texture(tex0, uv + refr).rgb;

    // Caustic glow, slightly blurred so the net has body.  A sharp, incisive
    // mix (cymbals, bright transients) pulls the blur in so the net reads as a
    // crisp filigree; a dull, dark mix lets it bloom soft and wide.
    vec3 soft = vec3(0.0);
    float r = (0.003 + 0.005 * glowP) * (1.28 - 0.46 * audioSharpness);
    for (int i = 0; i < 6; ++i)
    {
        float a = float(i) * 1.0472;
        soft += texture(texCaustics, uv + vec2(cos(a), sin(a)) * r).rgb;
    }
    soft /= 6.0;

    vec3 light = caus + soft * 0.7;

    // PROCEDURAL caustic net on top: the photon sim alone often reads as a
    // flat wallpaper -- this guarantees visibly dancing water. (The classic
    // iterated sine-warp caustic; time-driven, resolution-independent.)
    {
        vec2 p2 = mod(uv * vec2(resolution.x / resolution.y, 1.0) * 6.2831853,
                      6.2831853) - 250.0;
        vec2 ii = p2;
        float c = 1.0;
        const float inten = 0.005;
        for (int n = 0; n < 4; n++) {
            float tt = time * 0.4 * (1.0 - (3.5 / float(n + 1)));
            ii = p2 + vec2(cos(tt - ii.x) + sin(tt + ii.y),
                           sin(tt - ii.y) + cos(tt + ii.x));
            c += 1.0 / length(vec2(p2.x / (sin(ii.x + tt) / inten),
                                   p2.y / (cos(ii.y + tt) / inten)));
        }
        c /= 4.0;
        c = 1.17 - pow(c, 1.4);
        float proc = clamp(pow(abs(c), 8.0), 0.0, 1.4);
        light += vec3(proc) * (0.55 + 0.35 * audioLevel);
    }

    // Water tint deepens with distance from the light: the classic pool look.
    // Spectral rolloff sets the water's COLOUR TEMPERATURE -- a bass-bound mix
    // reads as a deep, cold blue basin, energy reaching into the highs as
    // shallow bright turquoise.  Low-mid warmth thickens the water body, so a
    // fat harmonic pad makes the unlit areas visibly denser.
    vec3 water = mix(vec3(0.16, 0.44, 0.74), vec3(0.40, 0.76, 0.70),
                     clamp(audioRolloff, 0.0, 1.0));
    float depthT = 1.0 - clamp(dot(light, vec3(0.4)), 0.0, 1.0);
    float depthMix = (0.36 + 0.22 * clamp(audioLowMid, 0.0, 1.0)) * depthT;
    // Vertical depth gradient: the far end of the pool lies deeper.
    depthMix = clamp(depthMix + 0.18 * (1.0 - uv.y), 0.0, 0.9);
    vec3 col = floorCol * mix(vec3(1.0), water, depthMix);

    // Multiplicative caustics: light REVEALS the floor, it does not sit on it.
    col *= 1.0 + light * (1.6 + 1.2 * audioLevel);
    col += light * light * (0.25 + 0.35 * audioBeat);

    col *= 0.85 + 0.35 * audioAmbient;
    col = col / (1.0 + col * 0.30);
    fragColor = vec4(col, interpolation);
}
