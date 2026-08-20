#version 330 core
out vec4 fragColor;
// Skyburst.frag — sparks are emissive, so there is no lighting here at all.
// What there IS: a colour that cools along the trail.  A burning ember goes
// from white-hot through yellow to red as it loses heat, and reproducing that
// gradient along each streak is what separates a firework from confetti.

in vec3  vWorld;
in float vAge;         // 0 at the spark's head, 1 at the tail / sky elevation
in float vHue;         // shell hue / sky azimuth
in float vBright;
in float vDist;
in float vKind;        // 0 = spark trail, 1 = sky dome

/**
 * @file Skyburst.frag
 * @brief Shades the firework spark trails built by Skyburst.comp as pure
 * emissive light (no lighting model): a blackbody-style cooling gradient
 * from white-hot at the head (vAge near 0) through the shell's own hue to
 * deep red at the tail (vAge near 1), against a faint night sky.
 *
 * audioChromaHue tints the shell's base colour via hue2rgb/imgPalette (with
 * audioAdvance and audioValence shaping that photo-sampled palette);
 * audioLevel scales the streak's overall glow; audioHigh brightens the
 * white-hot head so dense bursts read as light rather than coloured lines;
 * audioAmbient lifts the background sky; audioBeat, audioSubBass and
 * audioKick pulse the final exposure. skyP blends a dim, low slideshow-photo
 * sample into the night sky background.
 *
 * vKind = 1 marks the sky dome that Skyburst.comp now builds as real
 * geometry: an elevation gradient from a town-glow horizon up to deep zenith
 * blue, an underlit cloud deck, a dense twinkling star field, the lights of
 * the town below the horizon, and the same skyP photo blend. audioAmbient
 * lifts the whole dome, its town glow, its clouds and its street lights, and
 * audioBeat/audioSubBass pulse it with everything else.
 */

uniform sampler2D tex0;
uniform float interpolation;
uniform float time;

uniform float audioLevel;
uniform float audioBeat;
uniform float audioKick;
uniform float audioHigh;
uniform float audioSubBass;
uniform float audioChromaHue;
uniform float audioAmbient;

uniform float glowP;
uniform float skyP;
uniform sampler2D tex1;
uniform float audioAdvance;
uniform float audioValence;

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
    pc = mix(vec3(pg), pc, 0.55 + 0.45 * audioValence);
    // LUMINANCE-NORMALISED.  Every coloured thing here -- the cloud tops, the
    // town glow, the shell colours -- is this palette times a shading term, so
    // an activation whose sampling arc lands on a dark corner of the slideshow
    // photo takes the whole picture down with it.  Hue and saturation stay the
    // photo's; only the LEVEL is pinned.  The lift is capped, and a large lift
    // is walked back toward the colour's own grey: multiplying a dark, strongly
    // tinted pixel up is exactly how a photo palette turns into a candy wash.
    float pl = max(dot(pc, vec3(0.2126, 0.7152, 0.0722)), 0.05);
    float k  = clamp(0.34 / pl, 0.25, 3.5);
    pc = clamp(pc * k, 0.0, 1.3);
    return mix(pc, vec3(dot(pc, vec3(0.2126, 0.7152, 0.0722))),
               clamp((k - 1.4) * 0.35, 0.0, 0.5));
}

vec3 hue2rgb(float h)
{
    return imgPalette(h) * 1.35;   // photo-arc palette (house standard), was HSV rainbow
}

void main()
{
    if (vKind > 0.5)
    {
        // ---- THE NIGHT SKY ---------------------------------------------
        // Real geometry, and (since Skyburst.comp's SKY_R came down from 300 to
        // 190) real geometry that is actually INSIDE the 220-unit far plane.
        // At 300 the far clip discarded 94.6 % of the frame, so the background
        // behind the fireworks stayed exactly as black as it had been before
        // the dome existed.
        //
        // The second half of the problem was that even unclipped this sky was
        // a smooth gradient: measured on its own it came out contrast 0.019
        // with not a single tile of the frame carrying content, and a smooth
        // full-frame wash is worse than nothing for occupancy -- it becomes the
        // frame's modal brightness, so everything else then has to clear TWO
        // brightness buckets instead of one.  The base gradient is therefore
        // kept deliberately dark and the light is spent on things that have
        // EDGES: a cloud deck, a dense star field, and the town's own lights.
        //
        // vAge is the dome's normalised elevation; with SKY_LOW = -0.55 the
        // horizon falls at 0.55/1.55 = 0.355.  vHue is its azimuth.
        float el = vAge;
        float above = smoothstep(0.342, 0.372, el);

        vec3 high = vec3(0.010, 0.014, 0.034);
        vec3 low  = vec3(0.043, 0.041, 0.062);
        vec3 skyc = mix(low, high, smoothstep(0.37, 0.90, el));

        // Below the horizon: unlit ground, still carrying the town's spill so
        // it reads as land rather than as a hole cut in the picture.
        vec3 ground = mix(vec3(0.010, 0.009, 0.011), vec3(0.030, 0.026, 0.023),
                          smoothstep(0.06, 0.355, el));
        vec3 col = mix(ground, skyc, above);

        // Town glow hugging the horizon, tinted from the photo palette.
        col += hue2rgb(fract(0.08 + 0.3 * vHue)) * 0.075
             * exp(-max(el - 0.372, 0.0) * 20.0) * (0.6 + 0.7 * audioAmbient);

        // CLOUD DECK, underlit by that same town glow.  Three octaves put
        // through a hard threshold, so the deck has edges rather than being a
        // haze; the lit tops sit roughly 0.2 luma above the sky they float in,
        // which is the two buckets a tile needs before it counts.  44 cycles of
        // the coarse octave around the full horizon is a bit under one tile
        // across the frame; the drift is 0.012 rad/s plus the music-integrated
        // advance, and the fastest octave runs at 0.10 rad/s.
        float cu = vHue * 44.0 + time * 0.012 + audioAdvance * 0.007;
        float cv = (el - 0.372) * 30.0;
        float n1 = sin(cu * 1.0 + sin(cv * 0.7 + time * 0.06) * 1.7)
                 * cos(cv * 0.9 - time * 0.05);
        float n2 = sin(cu * 2.7 - time * 0.08 + cv * 1.3)
                 * cos(cv * 2.1 + time * 0.07 - cu * 0.9);
        float n3 = sin(cu * 6.1 + cv * 4.3 - time * 0.10)
                 * cos(cu * 4.7 - cv * 5.9 + time * 0.09);
        float dens = 0.5 + 0.30 * n1 + 0.14 * n2 + 0.06 * n3;
        float band = smoothstep(0.365, 0.44, el) * (1.0 - smoothstep(0.60, 0.88, el));
        float cl   = smoothstep(0.46, 0.70, dens) * band;
        float lit  = pow(clamp(1.0 - (el - 0.372) * 3.0, 0.0, 1.0), 1.4);
        vec3  cloud = hue2rgb(fract(0.10 + 0.25 * vHue)) * (0.055 + 0.42 * lit);
        col *= (1.0 - 0.85 * cl);
        col += cloud * cl * (0.7 + 0.6 * audioAmbient) * 2.2;

        // Stars.  The old 190 x 78 cell grid, thresholded at 0.945, put about
        // ONE star in a whole 12x8 tile -- and a tile needs 2 % of its pixels
        // to be interesting, so most of the sky still scanned as empty.  300 x
        // 68 at a 0.72 threshold puts four to six in every tile, each about 2
        // px across once the frame is downscaled, which is the smallest thing
        // that survives that downscale at all.  They are also most of this
        // scene's motion when no shell happens to be open (0.14 .. 0.68 Hz).
        vec2  sp   = vec2(vHue * 300.0, el * 68.0);
        vec2  cell = floor(sp), f = fract(sp);
        float hs   = fract(sin(dot(cell, vec2(91.31, 47.13))) * 43758.5453);
        if (hs > 0.72)
        {
            float tw = 0.60 + 0.40 * sin(time * (0.9 + 3.4 * fract(hs * 17.0))
                                         + hs * 60.0);
            col += vec3(0.82, 0.88, 1.0)
                 * pow(max(1.0 - length(f - 0.5) * 2.2, 0.0), 2.0)
                 * (0.55 + 0.95 * fract(hs * 31.0)) * tw * 0.60
                 * smoothstep(0.372, 0.44, el) * (1.0 - 0.85 * cl);
        }

        // THE TOWN the fireworks are being let off over: window and street
        // lights below the horizon.  The ground was a flat near-black card and
        // it is a third of the picture; these are what give those three tile
        // rows something to register.
        vec2  tp = vec2(vHue * 420.0, el * 112.0);
        vec2  tc = floor(tp), tf = fract(tp);
        float th = fract(sin(dot(tc, vec2(61.7, 29.3))) * 24634.6345);
        if (th > 0.70)
        {
            float twk = 0.78 + 0.22 * sin(time * (0.6 + 2.4 * fract(th * 11.0))
                                          + th * 41.0);
            col += vec3(1.0, 0.82, 0.52)
                 * pow(max(1.0 - length(tf - 0.5) * 2.2, 0.0), 2.0)
                 * (0.45 + 1.0 * fract(th * 53.0)) * twk * 0.75
                 * smoothstep(0.358, 0.33, el) * smoothstep(0.04, 0.14, el)
                 * (0.55 + 0.5 * audioAmbient);
        }

        // The slideshow photo shows through very dimly, low on the sky.
        vec3 photo = textureLod(tex0, fract(vec2(vHue + time * 0.003,
                                                 clamp(el, 0.0, 1.0) * 0.4)), 0.0).rgb;
        col = mix(col, col * 0.6 + photo * 0.13, 0.5 * skyP);

        col *= (1.0 + 0.6 * audioAmbient)
             * (1.0 + 0.10 * audioBeat + 0.08 * audioSubBass);
        col = col / (1.0 + col * 0.22);
        fragColor = vec4(min(col, vec3(1.0)), interpolation);
        return;
    }

    // Blackbody-ish cooling: white at the head, the shell's own colour in the
    // middle, deep red at the tail.
    vec3 shell = hue2rgb(fract(vHue + 0.04 * sin(audioChromaHue)));
    vec3 col = mix(vec3(1.0, 0.97, 0.90), shell, smoothstep(0.0, 0.45, vAge));
    col = mix(col, vec3(0.55, 0.10, 0.02), smoothstep(0.55, 1.0, vAge));

    // Exposure came down with the streak width: the trails are now about four
    // times as wide on screen (see Skyburst.comp), and light landing on a pixel
    // that is already at white is light thrown away.  Spreading it is what
    // raises the frame, not gaining it up.
    col *= vBright * (1.15 + 2.3 * glowP) * (0.7 + 0.8 * audioLevel);

    // The head of each streak burns out white, which is what makes a dense
    // burst read as light rather than as coloured lines.
    col += vec3(1.0) * pow(max(1.0 - vAge * 2.2, 0.0), 3.0)
         * vBright * (0.38 + 1.35 * audioHigh);

    // A faint night sky and haze, so the sparks sit in air rather than in a
    // vacuum.  The slideshow photo shows through very dimly, low on the frame.
    vec2 suv = vec2(vWorld.x / 90.0 + 0.5, clamp(vWorld.y / 40.0, 0.0, 1.0));
    vec3 photo = textureLod(tex0, fract(suv * vec2(1.0, 0.4) + vec2(time * 0.003, 0.0)), 0.0).rgb;
    vec3 sky = mix(vec3(0.012, 0.016, 0.032), vec3(0.05, 0.06, 0.10), suv.y);
    sky = mix(sky, sky * 0.6 + photo * 0.18, 0.5 * skyP) * (1.0 + 0.6 * audioAmbient);

    float haze = clamp(vDist / 90.0, 0.0, 1.0);
    col = mix(col, col * 0.5 + sky, pow(haze, 1.5) * 0.6);
    col += sky * 0.5;

    col *= 1.0 + 0.22 * audioBeat + 0.16 * audioSubBass + 0.2 * audioKick;
    col = col / (1.0 + col * 0.22);
    fragColor = vec4(col, interpolation);
}
