#version 330 core
out vec4 fragColor;
/**
 * @file ErodedLand.frag
 * @brief A relief-shaded landscape being carved by simulated water erosion, viewed from a slowly drifting aerial camera.
 *
 * texErosion (written by the CfxErosion compute pass, R = height, G = water) is lit with a travelling sun and shaded from its own height gradient; water is found geometrically as concave dips in the terrain rather than stored separately. Altitude bands (valley floor, rock, snow) are recoloured with a sample from the photo itself.
 *
 * Audio Reactivity:
 *  - audioAdvance   -> camera pan and zoom over the terrain (integrated, never jump-cuts)
 *  - audioKick      -> flashes the freshly carved water channels
 *  - audioBeat      -> light pulse over the whole image
 *  - audioAmbient   -> tints the pooled water
 *  - audioRoughness -> RELIEF STEEPNESS: consonant, smooth music shades the terrain
 *                      gently, dissonant clusters exaggerate the height gradient into
 *                      jagged, harshly lit rock
 *  - audioSharpness -> SPECULAR TIGHTNESS of the sun glint on water and snow: a dull
 *                      mix gives a broad wet sheen, cymbals pull it into hard sparkles
 *  - audioMode      -> SUNLIGHT COLOUR TEMPERATURE: minor keys light the land with a
 *                      cold blue-grey overcast, major keys with a warm golden sun
 */
// ErodedLand.frag — a landscape carving itself.  Blend/CfxErosion.comp runs
// thousands of droplets downhill every frame; this pass shades the result as
// a relief map with a travelling sun, water in the valleys and the photo's
// palette used for the rock.

uniform sampler2D tex0;
uniform sampler2D texErosion;    // <- requests the erosion sim (R=h, G=water)
uniform vec2  resolution;
uniform float time;
uniform float interpolation;

uniform float audioLevel;
uniform float audioBeat;
uniform float audioKick;
uniform float audioAmbient;
uniform float audioChromaHue;
uniform float audioAdvance;
uniform float audioRoughness;   // 0=consonant .. 1=dissonant -> relief steepness
uniform float audioSharpness;   // 0=dull .. 1=bright/harsh -> sun-glint tightness
uniform float audioMode;        // 0=minor/cold .. 1=major/warm -> sunlight colour

uniform float sunP;
uniform float waterP;

float hAt(vec2 uv) { return texture(texErosion, uv).r; }

void main()
{
    vec2 uv = gl_FragCoord.xy / resolution;

    // Slow pan + zoom so the camera drifts over the terrain.
    vec2 c = (uv - 0.5) * (0.80 - 0.06 * sin(audioAdvance * 0.07)) + 0.5;
    c += vec2(0.03 * sin(audioAdvance * 0.05), 0.03 * cos(audioAdvance * 0.04));

    vec2 px = 1.0 / resolution;
    float h = hAt(c);

    // Relief normal from TWO scales.  A single 1.5-pixel stencil only sees the
    // finest ripples, and after erosion the height field's whole range is narrow
    // (the palette comment below already noticed this), so hx and hy came out
    // tiny, the normal sat at almost exactly +Z everywhere, and `diff` was the
    // same number for the entire frame -- one flat lit wash, measured contrast
    // 0.047. The coarse stencil picks up the LANDFORMS, which is where a relief
    // map's contrast actually lives, and the steeper constant compensates for
    // the compressed range.
    float hx1 = hAt(c + vec2(px.x * 1.5, 0.0)) - hAt(c - vec2(px.x * 1.5, 0.0));
    float hy1 = hAt(c + vec2(0.0, px.y * 1.5)) - hAt(c - vec2(0.0, px.y * 1.5));
    float hx2 = hAt(c + vec2(px.x * 7.0, 0.0)) - hAt(c - vec2(px.x * 7.0, 0.0));
    float hy2 = hAt(c + vec2(0.0, px.y * 7.0)) - hAt(c - vec2(0.0, px.y * 7.0));
    float hx = hx1 + hx2 * 0.42;
    float hy = hy1 + hy2 * 0.42;
    // Sensory dissonance exaggerates the gradient: smooth, consonant music
    // shades the land gently, rough clusters make it read as jagged, harshly
    // lit rock.  A pure shape parameter -- nothing here reaches 'time'.
    float relief = 230.0 * (1.0 + 0.45 * clamp(audioRoughness, 0.0, 1.0));
    vec3 n = normalize(vec3(-hx * relief, -hy * relief, 1.0));

    // Locally normalised height, from a wide 8-tap neighbourhood.  The altitude
    // bands below (valley / rock / stone / snow) are cut at fixed thresholds
    // 0.15 / 0.50 / 0.72, but an eroded field lives inside a narrow band, so
    // every pixel landed in the SAME band -- `snow` in particular was
    // identically zero over the whole map. Measuring each point against its own
    // surroundings puts the bands back onto the terrain, whatever absolute
    // range the simulation happens to settle into.
    float r18x = px.x * 18.0, r18y = px.y * 18.0;
    float s0 = hAt(c + vec2( r18x, 0.0)),   s1 = hAt(c + vec2(-r18x, 0.0));
    float s2 = hAt(c + vec2(0.0,  r18y)),   s3 = hAt(c + vec2(0.0, -r18y));
    float s4 = hAt(c + vec2( r18x * 0.7,  r18y * 0.7));
    float s5 = hAt(c + vec2(-r18x * 0.7,  r18y * 0.7));
    float s6 = hAt(c + vec2( r18x * 0.7, -r18y * 0.7));
    float s7 = hAt(c + vec2(-r18x * 0.7, -r18y * 0.7));
    float hLo = min(min(min(s0, s1), min(s2, s3)), min(min(s4, s5), min(s6, s7)));
    float hHi = max(max(max(s0, s1), max(s2, s3)), max(max(s4, s5), max(s6, s7)));
    hLo = min(hLo, h); hHi = max(hHi, h);
    float hN = (h - hLo) / max(hHi - hLo, 1e-4);
    // Keep some absolute altitude so the map still has a real high ground.
    float hb = clamp(mix(h, hN, 0.70), 0.0, 1.0);

    // Water lives where the terrain is CONCAVE — the carved channels — which
    // the erosion writes into the shape itself.  Measured over a WIDE radius
    // and with a threshold: the raw pixel-scale Laplacian of an eroded surface
    // is positive nearly everywhere, so a naive version floods the whole map
    // and hides the very drainage network it is supposed to reveal.
    float lap = hAt(c + vec2(px.x * 5.0, 0.0)) + hAt(c - vec2(px.x * 5.0, 0.0))
              + hAt(c + vec2(0.0, px.y * 5.0)) + hAt(c - vec2(0.0, px.y * 5.0))
              - 4.0 * h;
    float water = smoothstep(0.004, 0.030, lap) * smoothstep(0.58, 0.15, hb);

    // A sun that travels: the relief reads completely differently at different
    // grazing angles, and the movement is what shows the erosion at work.
    float sa = time * 0.05 + 1.2;
    vec3 L = normalize(vec3(cos(sa), sin(sa) * 0.55, 0.42 + 0.25 * sunP));
    float diff = max(dot(n, L), 0.0);

    // Cheap ambient occlusion from the height itself: valleys sit in shadow.
    // Against the LOCALLY normalised height, so a valley reads as a valley even
    // when the whole map sits inside a narrow absolute band.
    float ao = clamp(0.22 + 0.95 * hb, 0.0, 1.0);

    // A proper altitude ramp, tinted by the photo's palette.  Sampling the
    // photo AT fract(h) was the first idea and gave a near-uniform dark wash,
    // because after erosion the height range is narrow and the lookup lands in
    // essentially one spot of the picture.
    vec3 pal = texture(tex0, vec2(0.5, hb)).rgb;
    pal = mix(vec3(dot(pal, vec3(0.33))), pal, 0.5) + 0.12;
    vec3 lowC  = vec3(0.20, 0.26, 0.16) * 2.0;      // valley floor
    vec3 midC  = vec3(0.42, 0.34, 0.26) * 2.0;      // rock
    vec3 highC = vec3(0.62, 0.60, 0.58) * 2.0;      // bare stone
    vec3 rock = mix(lowC, midC, smoothstep(0.15, 0.50, hb));
    rock = mix(rock, highC, smoothstep(0.50, 0.78, hb));
    rock *= pal;

    // The musical mode sets the WEATHER: minor keys give a cold, blue-grey
    // overcast light, major keys a warm golden sun.  Luminance-neutral, so it
    // recolours the land without touching the exposure.
    vec3 sunCol = mix(vec3(0.78, 0.86, 1.08), vec3(1.10, 0.99, 0.82),
                      clamp(audioMode, 0.0, 1.0));

    vec3 col = rock * (0.25 + 1.35 * diff * sunCol) * ao;

    // Snow on the peaks, catching the sun.
    float snow = smoothstep(0.74, 0.96, hb);
    col = mix(col, vec3(0.92, 0.95, 1.02) * sunCol * (0.35 + diff), snow * 0.8);

    // Water pooling in the carved channels.
    vec3 wcol = vec3(0.10, 0.35, 0.55) * (0.6 + 0.8 * audioAmbient);
    float wm = clamp(water * (0.5 + 0.8 * waterP), 0.0, 1.0);
    // Zwicker sharpness tightens the sun glint on the water: a dull, dark mix
    // leaves a broad wet sheen, cymbals and hats pull it into hard sparkles.
    // Exponent only -- the glint's peak brightness is unchanged.
    float specPow = mix(22.0, 72.0, clamp(audioSharpness, 0.0, 1.0));
    col = mix(col, wcol + vec3(pow(max(dot(n, L), 0.0), specPow)) * 0.7, wm * 0.55);

    // Kicks flash the freshly cut channels.
    col += wcol * wm * audioKick * 0.8;

    col *= 1.0 + 0.12 * audioBeat;
    col = col / (1.0 + col * 0.25);
    fragColor = vec4(col, interpolation);
}
