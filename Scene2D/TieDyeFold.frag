#version 330 core
out vec4 fragColor;
/**
 * @file TieDyeFold.frag
 * @brief TIE-DYE FOLD: the photo folded radially like a shirt tied for
 * dyeing -- the plane folded into wedges, the dye soaking in along the folds
 * in rings and spirals.  The dye diffuses on the swell (the wet-in-wet
 * bleeding grows as the music swells and stays), the fold turns steadily on
 * the scene clock, and the kick brightens the dye fronts.  Camera still.
 *
 * Audio Reactivity:
 *   sceneAdvance -> fold rotation and dye spiral (continuous)
 *   audioSwell   -> dye diffusion width (slow)
 *   audioKick    -> dye fronts brighten (light)
 *   audioBass    -> dye saturation (light/colour)
 *   audioLevel   -> brightness
 *
 * Per-activation variety: foldsP, spiralP, hueP.
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
uniform float audioBass;
uniform float audioLevel;
uniform float audioChromaHue;
uniform float audioValence;

uniform float foldsP;
uniform float spiralP;
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
    for (int i = 0; i < 4; ++i) { v += a * noise2(p); p = p * 2.03 + 5.0; a *= 0.5; }
    return v;
}

void main()
{
    float aspect = resolution.x / resolution.y;
    vec2 p = (gl_FragCoord.xy / resolution - 0.5) * vec2(aspect, 1.0);

    float hue = (hueP > 0.001) ? hueP : 0.0;
    float folds = floor(5.0 + 7.0 * clamp(foldsP, 0.0, 1.0));   // once per activation
    float spiral = 0.5 + 2.5 * clamp(spiralP, 0.0, 1.0);
    float rot = sceneAdvance * 0.12 + sceneTime * 0.02;

    // Fold the plane into wedges (a pleat: angle reflected into one sector).
    float r = length(p);
    float a = atan(p.y, p.x) + rot;
    float sector = 6.2831853 / folds;
    float fa = mod(a, sector);
    fa = min(fa, sector - fa);                 // reflect -> the pleat
    vec2 fp = vec2(cos(fa), sin(fa)) * r;
    // Along the pleat, the fabric is wrinkled: distort by noise, slowly.
    vec2 wr = vec2(fbm(fp * 3.0 + sceneAdvance * 0.05), fbm(fp * 3.0 + 9.0 - sceneAdvance * 0.04)) - 0.5;
    fp += wr * 0.08;
    // The photo on the folded fabric.
    vec3 fabric = img(fract(fp * 0.7 + 0.5));
    // Dye: rings from the tie points, spiralling, soaked in along the
    // wrinkles; the front width grows with the swell (diffusion).
    float diff = 0.05 + 0.25 * clamp(audioSwell, 0.0, 1.0);
    float ringPhase = r * 6.0 - fa * spiral + wr.x * 3.0 - sceneAdvance * 0.15;
    float rings = 0.5 + 0.5 * sin(ringPhase * 3.0);
    float dye = smoothstep(0.5 - diff, 0.5 + diff, rings);
    // Dye colours: the palette, forced to full saturation with a hue wheel
    // (a grey photo would otherwise give grey dye).
    vec3 wheelA = 0.5 + 0.5 * cos(6.2831853 * (hue * 0.159 + 0.0 + vec3(0.0, 0.33, 0.66)));
    vec3 wheelB = 0.5 + 0.5 * cos(6.2831853 * (hue * 0.159 + 0.33 + vec3(0.0, 0.33, 0.66)));
    vec3 wheelC = 0.5 + 0.5 * cos(6.2831853 * (hue * 0.159 + 0.66 + vec3(0.0, 0.33, 0.66)));
    vec3 dyeA = mix(imgPalette(hue * 0.159 + 0.0), wheelA, 0.6);
    vec3 dyeB = mix(imgPalette(hue * 0.159 + 0.33), wheelB, 0.6);
    vec3 dyeC = mix(imgPalette(hue * 0.159 + 0.66), wheelC, 0.6);
    float band = fract(ringPhase * 0.477);
    vec3 dyeCol = mix(mix(dyeA, dyeB, smoothstep(0.0, 0.5, band)), dyeC, smoothstep(0.5, 1.0, band));
    float sat = 0.6 + 0.6 * clamp(audioBass, 0.0, 1.0);
    dyeCol = mix(vec3(dot(dyeCol, vec3(0.333))), dyeCol, sat) * 1.4;
    vec3 col = mix(fabric * 0.9, dyeCol * (0.4 + 0.6 * fabric), dye * 0.85);
    // The dye fronts: where the front runs, a brighter seam on the kick.
    float front = exp(-abs(rings - 0.5) / max(diff, 0.02) * 2.0);
    col += dyeCol * front * (0.1 + 0.5 * audioKick);
    // The fold seams: dark creases at the sector boundaries.
    float seam = exp(-min(fa, sector - fa) * 40.0);
    col *= 1.0 - 0.45 * seam;
    // The centre tie: a bright knot.
    col += imgPalette(hue * 0.159 + 0.9) * exp(-r * 6.0) * 0.5;
    col *= 0.75 + 0.5 * audioLevel;

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
