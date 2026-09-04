#version 330 core
out vec4 fragColor;
/**
 * @file EclipseLeafCrescents.frag
 * @brief ECLIPSE LEAF CRESCENTS: the ground under a canopy during a
 * partial eclipse.  Every gap between the leaves is a pinhole, so the
 * dapples on the ground stop being round and become crescents, all
 * pointing the same way, thinning as the eclipse deepens over the scene
 * arc and filling again.  The canopy sways gently on the clock, which
 * moves the dapples; the swell is the daylight, the treble the sparkle on
 * their rims.  The photo is the forest floor.  Camera fixed on the ground.
 *
 * Audio Reactivity:
 *   sceneProgress -> the eclipse: crescents thin toward maximum and fill again
 *   sceneAdvance  -> canopy sway, the dapples drift (continuous)
 *   audioSwell    -> daylight level (slow)
 *   audioHigh     -> rim sparkle (light)
 *   audioLevel    -> brightness
 *
 * Per-activation variety: gapsP, sizeP, hueP.
 */
uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float sceneAdvance;
uniform float sceneTime;
uniform float sceneProgress;
uniform float audioAdvance;
uniform float audioSwell;
uniform float audioHigh;
uniform float audioLevel;
uniform float audioChromaHue;
uniform float audioValence;

uniform float gapsP;
uniform float sizeP;
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
    vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x),
               mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), f.x), f.y);
}
float fbm(vec2 p) { float v = 0.0, a = 0.5; for (int i = 0; i < 4; ++i) { v += a * noise2(p); p = p * 2.03 + 4.1; a *= 0.5; } return v; }

// One projected sun image: a disc with a bite taken out of it, the bite
// deeper the further the eclipse has progressed.  cover is 0 (full sun)
// to 0.92 (a thin crescent); the moon comes in from a fixed direction.
float sunImage(vec2 q, float radius, float cover, vec2 moonDir)
{
    float sun = smoothstep(radius, radius * 0.72, length(q));
    vec2 moonC = moonDir * radius * (1.9 * cover - 0.9);
    float moon = smoothstep(radius * 1.02, radius * 0.74, length(q - moonC));
    return clamp(sun - moon, 0.0, 1.0);
}

void main()
{
    float aspect = resolution.x / resolution.y;
    vec2 uv = gl_FragCoord.xy / resolution;
    vec2 p = (uv - 0.5) * vec2(aspect, 1.0);

    float hue = (hueP > 0.001) ? hueP : 0.0;
    float gaps = 5.0 + 4.0 * clamp(gapsP, 0.0, 1.0);                    // dapple density
    float size = 0.055 + 0.045 * clamp(sizeP, 0.0, 1.0);
    float day = 0.55 + 0.6 * clamp(audioSwell, 0.0, 1.0);
    float hi = clamp(audioHigh * 2.0, 0.0, 1.0);
    float clock = sceneAdvance * 0.35 + sceneTime * 0.07;
    // The eclipse over the arc: full sun, deepening to a thin crescent at
    // the middle of the scene, then filling again.  Smooth throughout.
    float prog = clamp(sceneProgress, 0.0, 1.0);
    float cover = 0.9 * smoothstep(0.0, 0.5, prog) * smoothstep(1.0, 0.5, prog);
    vec2 moonDir = normalize(vec2(0.75, 0.66));

    // The forest floor: the photo, damp and dim, with leaf litter texture.
    vec3 floorCol = img(uv * vec2(1.1, 0.8) + vec2(0.0, 0.1));
    floorCol *= mix(vec3(0.5, 0.45, 0.35), imgPalette(hue * 0.159 + 0.15), 0.35);
    floorCol *= 0.7 + 0.5 * fbm(p * 9.0);
    // Ambient light falls as the eclipse deepens -- the whole wood goes
    // dim and a little blue, which is what a deep partial eclipse looks like.
    float ambient = day * (1.0 - 0.55 * cover);
    vec3 col = floorCol * (0.32 + 0.6 * ambient) + 0.02;
    col = mix(col, col * vec3(0.8, 0.88, 1.1), cover * 0.6);

    // The dapples.  A jittered lattice of gaps in the canopy; each casts
    // one image of the sun.  The lattice drifts with the sway, so the
    // whole pattern moves gently and continuously.
    vec2 sway = vec2(0.045 * sin(clock * 0.5), 0.03 * cos(clock * 0.37));
    vec3 sunCol = mix(vec3(1.0, 0.94, 0.75), imgPalette(hue * 0.159 + 0.08), 0.3);
    for (int layer = 0; layer < 2; ++layer)
    {
        float fl = float(layer);
        float scale = gaps * (1.0 + fl * 0.7);
        vec2 g = (p + sway * (1.0 + fl * 0.6)) * scale + fl * 13.7;
        vec2 cell = floor(g);
        // Look at the nine neighbouring cells so crescents may overlap and
        // nothing is clipped at a cell border.
        for (int j = -1; j <= 1; ++j)
        for (int i = -1; i <= 1; ++i)
        {
            vec2 c = cell + vec2(float(i), float(j));
            float h = hash21(c + fl * 31.7);
            if (h < 0.42) continue;                                      // not every gap is open
            vec2 jit = vec2(hash21(c + 1.7), hash21(c + 9.3)) - 0.5;
            vec2 centre = (c + 0.5 + jit * 0.8) / scale - sway * (1.0 + fl * 0.6);
            float rad = size * (0.6 + 0.7 * hash21(c + 5.1)) / (1.0 + fl * 0.35);
            vec2 q = p - centre;
            // The gap's own slow wobble, so no dapple is ever perfectly still.
            q += vec2(0.006 * sin(clock * 0.8 + h * 6.28), 0.006 * cos(clock * 0.7 + h * 4.0));
            float im = sunImage(q, rad, cover, moonDir);
            if (im <= 0.0) continue;
            // A pinhole image has a soft edge; the penumbra widens with the
            // gap size.  Sparkle on the rim with the treble.
            float rim = smoothstep(rad * 1.05, rad * 0.8, length(q)) * (1.0 - smoothstep(rad * 0.85, rad * 0.6, length(q)));
            col += sunCol * im * ambient * 1.9;
            col += sunCol * rim * im * hi * 0.5;
        }
    }
    // Leaf shadows drifting over everything: a soft canopy pattern that
    // darkens between the dapples.
    float canopy = fbm((p + sway * 1.6) * 5.5);
    col *= 0.72 + 0.45 * smoothstep(0.35, 0.75, canopy);
    // A few leaves in frame at the top, dark and out of focus.
    float leaves = smoothstep(0.55, 0.75, fbm(p * 3.0 + vec2(0.0, -0.6) + sway));
    col = mix(col, col * 0.35, leaves * smoothstep(0.15, 0.45, p.y));
    col *= 0.85 + 0.3 * audioLevel;

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
