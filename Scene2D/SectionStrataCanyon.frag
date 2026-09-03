#version 330 core
out vec4 fragColor;
/**
 * @file SectionStrataCanyon.frag
 * @brief SECTION STRATA CANYON: the song as geology.  A canyon wall fills
 * the frame; every section of the song that has played is a rock layer,
 * in that section's colour (a palette hue keyed to the section id), the
 * oldest at the bottom; the current section is the layer being laid down
 * on top, growing with its age.  The wall passes steadily on the scene
 * clock (a slow lateral drift of the erosion pattern, not of the camera);
 * the photo is the rock texture; the bass is the light in the seams, the
 * kick a rockfall spark, the swell the sun on the rim.  Camera fixed.
 *
 * Audio Reactivity:
 *   audioSectionId / Count / Age -> strata (structure)
 *   sceneAdvance    -> erosion drift (continuous)
 *   audioBass       -> seam light (light)
 *   audioKick       -> rockfall spark (light)
 *   audioSwell      -> rim sunlight (slow)
 *   audioLevel      -> brightness
 *
 * Per-activation variety: layerP (layer thickness), erosionP, hueP.
 */
uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float sceneAdvance;
uniform float sceneTime;
uniform float audioAdvance;
uniform float audioSectionId;
uniform float audioSectionCount;
uniform float audioSectionAge;
uniform float audioBass;
uniform float audioKick;
uniform float audioSwell;
uniform float audioLevel;
uniform float audioChromaHue;
uniform float audioValence;

uniform float layerP;
uniform float erosionP;
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

float hash11(float n) { return fract(sin(n * 127.1) * 43758.5453); }
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
    for (int i = 0; i < 4; ++i) { v += a * noise2(p); p = p * 2.03 + 5.0; a *= 0.5; }
    return v;
}

void main()
{
    float aspect = resolution.x / resolution.y;
    vec2 p = (gl_FragCoord.xy / resolution - 0.5) * vec2(aspect, 1.0);

    float hue = (hueP > 0.001) ? hueP : 0.0;
    float layerH = 0.07 + 0.05 * clamp(layerP, 0.0, 1.0);
    float erosion = 0.3 + 0.7 * clamp(erosionP, 0.0, 1.0);
    float sun = 0.5 + 0.7 * clamp(audioSwell, 0.0, 1.0);
    float clock = sceneAdvance * 0.05 + sceneTime * 0.01;
    // Sections: count laid down so far, the current one growing with age
    // (age saturates over ~40 s so the layer does not grow forever).
    float count = clamp(audioSectionCount, 0.0, 12.0);
    float curId = audioSectionId;
    float curGrow = clamp(audioSectionAge / 40.0, 0.0, 1.0);
    float base = -0.5;
    // Total height of the stack: finished layers plus the growing one.
    float stackTop = base + count * layerH + curGrow * layerH;

    // Sky above the rim: warm, hazed; the sun on the rim.
    vec3 sky = mix(vec3(0.85, 0.6, 0.4), vec3(0.4, 0.55, 0.8), smoothstep(-0.2, 0.5, p.y)) * sun;
    sky = mix(sky, sky * imgPalette(hue * 0.159 + 0.6) * 1.5, 0.15);
    vec3 col = sky;
    // The wall: erosion (fbm) makes the rim ragged and the layers wavy.
    float er = fbm(vec2(p.x * 2.0 + clock, p.y * 3.0)) * erosion * 0.08;
    float wallTop = stackTop + er;
    if (p.y < wallTop)
    {
        float y = p.y - base - er * 0.5;
        float layerF = y / layerH;
        float layer = floor(layerF);
        float within = fract(layerF);
        // Which section this layer is: the layers from the bottom are the
        // sections in order (id = layer index, wrapped to the palette).
        float secId = (layer >= count) ? curId : layer;
        vec3 rock = img(vec2(fract(p.x * 0.4 + clock * 0.2 + layer * 0.13), fract(y * 1.2))) * 0.9;
        vec3 tint = imgPalette(hue * 0.159 + fract(secId * 0.23 + 0.05));
        rock = mix(rock, rock * tint * 1.8, 0.55);
        // Layer shading: each stratum a slightly different hardness -> a
        // ledge (bright top) and an undercut (dark bottom).
        float ledge = smoothstep(0.85, 1.0, within) * 0.5;
        float undercut = smoothstep(0.15, 0.0, within) * 0.35;
        rock *= 0.7 + ledge - undercut;
        rock *= 0.8 + 0.2 * fbm(p * 20.0);
        // Light from the rim: the top layers catch the sun.
        rock *= (0.45 + 0.55 * smoothstep(base, wallTop, p.y)) * sun;
        // Seams between layers glow with the bass.
        float seam = smoothstep(0.06, 0.0, min(within, 1.0 - within));
        rock += tint * seam * (0.1 + 0.7 * clamp(audioBass, 0.0, 1.0));
        // The growing layer is brighter at its top edge (the fresh deposit).
        if (layer >= count) rock += tint * smoothstep(0.06, 0.0, wallTop - p.y) * 0.6;
        col = rock;
    }
    // The rim line lit by the sun.
    col += vec3(1.0, 0.9, 0.7) * smoothstep(0.012, 0.0, abs(p.y - wallTop)) * sun * 0.6;
    // Rockfall sparks on the kick: round grains falling from the rim, on the clock.
    vec2 gu = (p + vec2(0.0, sceneAdvance * 0.5)) * 40.0; vec2 gc = floor(gu); vec2 gf = fract(gu) - 0.5;
    vec2 go = vec2(hash21(gc + 1.3), hash21(gc + 5.9)) - 0.5;
    float grains = smoothstep(0.2, 0.06, length(gf - go * 0.6)) * step(0.96, hash21(gc)) * step(p.y, wallTop) * audioKick;
    col += vec3(1.0, 0.85, 0.6) * grains;
    col *= 0.75 + 0.5 * audioLevel;

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
