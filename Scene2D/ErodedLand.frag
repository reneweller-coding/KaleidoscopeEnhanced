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

    float hx = hAt(c + vec2(px.x * 1.5, 0.0)) - hAt(c - vec2(px.x * 1.5, 0.0));
    float hy = hAt(c + vec2(0.0, px.y * 1.5)) - hAt(c - vec2(0.0, px.y * 1.5));
    // Sensory dissonance exaggerates the gradient: smooth, consonant music
    // shades the land gently, rough clusters make it read as jagged, harshly
    // lit rock.  A pure shape parameter -- nothing here reaches 'time'.
    float relief = 90.0 * (1.0 + 0.45 * clamp(audioRoughness, 0.0, 1.0));
    vec3 n = normalize(vec3(-hx * relief, -hy * relief, 1.0));

    // Water lives where the terrain is CONCAVE — the carved channels — which
    // the erosion writes into the shape itself.  Measured over a WIDE radius
    // and with a threshold: the raw pixel-scale Laplacian of an eroded surface
    // is positive nearly everywhere, so a naive version floods the whole map
    // and hides the very drainage network it is supposed to reveal.
    float lap = hAt(c + vec2(px.x * 5.0, 0.0)) + hAt(c - vec2(px.x * 5.0, 0.0))
              + hAt(c + vec2(0.0, px.y * 5.0)) + hAt(c - vec2(0.0, px.y * 5.0))
              - 4.0 * h;
    float water = smoothstep(0.004, 0.030, lap) * smoothstep(0.55, 0.15, h);

    // A sun that travels: the relief reads completely differently at different
    // grazing angles, and the movement is what shows the erosion at work.
    float sa = time * 0.05 + 1.2;
    vec3 L = normalize(vec3(cos(sa), sin(sa) * 0.55, 0.42 + 0.25 * sunP));
    float diff = max(dot(n, L), 0.0);

    // Cheap ambient occlusion from the height itself: valleys sit in shadow.
    float ao = clamp(0.35 + 0.8 * h, 0.0, 1.0);

    // A proper altitude ramp, tinted by the photo's palette.  Sampling the
    // photo AT fract(h) was the first idea and gave a near-uniform dark wash,
    // because after erosion the height range is narrow and the lookup lands in
    // essentially one spot of the picture.
    vec3 pal = texture(tex0, vec2(0.5, clamp(h, 0.0, 1.0))).rgb;
    pal = mix(vec3(dot(pal, vec3(0.33))), pal, 0.5) + 0.12;
    vec3 lowC  = vec3(0.20, 0.26, 0.16) * 2.0;      // valley floor
    vec3 midC  = vec3(0.42, 0.34, 0.26) * 2.0;      // rock
    vec3 highC = vec3(0.62, 0.60, 0.58) * 2.0;      // bare stone
    vec3 rock = mix(lowC, midC, smoothstep(0.15, 0.50, h));
    rock = mix(rock, highC, smoothstep(0.50, 0.78, h));
    rock *= pal;

    // The musical mode sets the WEATHER: minor keys give a cold, blue-grey
    // overcast light, major keys a warm golden sun.  Luminance-neutral, so it
    // recolours the land without touching the exposure.
    vec3 sunCol = mix(vec3(0.78, 0.86, 1.08), vec3(1.10, 0.99, 0.82),
                      clamp(audioMode, 0.0, 1.0));

    vec3 col = rock * (0.25 + 1.35 * diff * sunCol) * ao;

    // Snow on the peaks, catching the sun.
    float snow = smoothstep(0.72, 0.95, h);
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
