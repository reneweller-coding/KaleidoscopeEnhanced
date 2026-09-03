#version 330 core
out vec4 fragColor;
/**
 * @file BaitBallVortex.frag
 * @brief Fragment stage for BaitBallVortex: open water lit from above --
 * blue-green with caustic light from the photo and god rays -- the fish
 * silver-sided with the photo's tint, flashing as they turn (a per-fish
 * phase) and all at once on an onset (the fright flash is light, not
 * motion), the predator a dark shape with a pale belly.
 *
 * Audio Reactivity: audioOnset -> silver flash; audioKick -> caustics
 *                   brighten; audioSwell -> sunlight; audioLevel -> brightness.
 */
in vec2  vTexCoord;
in vec3  vWorld;
in float vKind;
in float vLit;

uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;
uniform float sceneAdvance;
uniform float audioOnset;
uniform float audioKick;
uniform float audioSwell;
uniform float audioLevel;
uniform float audioChromaHue;
uniform float audioAdvance;
uniform float audioValence;
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

void main()
{
    float hue = (hueP > 0.001) ? hueP : 0.0;
    float sun = 0.6 + 0.6 * clamp(audioSwell, 0.0, 1.0);
    vec3 water = mix(vec3(0.02, 0.18, 0.3), imgPalette(hue * 0.159 + 0.55) * 0.5, 0.3);
    vec3 col;
    if (vKind < -0.5)
    {
        // The water: darker below, caustics from the photo moving on the
        // clock, god rays from above.
        vec2 uv = vTexCoord;
        vec3 deep = mix(water * 0.5, water * 1.6 + vec3(0.1, 0.3, 0.3), uv.y);
        vec2 cu = uv * vec2(4.0, 2.5) + vec2(sceneAdvance * 0.05, sceneAdvance * 0.03);
        vec3 caust = img(fract(cu));
        float cl = pow(dot(caust, vec3(0.333)), 3.0) * 2.5;
        deep += vec3(0.3, 0.6, 0.6) * cl * uv.y * (0.5 + 0.8 * audioKick) * sun;
        float rays = pow(0.5 + 0.5 * sin(uv.x * 30.0 + uv.y * 4.0 + sceneAdvance * 0.3), 8.0) * uv.y;
        deep += vec3(0.4, 0.7, 0.7) * rays * 0.35 * sun;
        col = deep;
        fragColor = vec4(col, 1.0);
        return;
    }
    if (vKind > 1.5)
    {
        // The predator: a dark ellipse, pale belly, an eye.
        vec2 d = (vTexCoord - 0.5) * 2.0;
        float r = length(d);
        if (r > 1.0) discard;
        float belly = smoothstep(0.2, -0.6, d.y);
        col = mix(vec3(0.05, 0.08, 0.1), vec3(0.45, 0.5, 0.5), belly) * (0.5 + 0.5 * sun);
        col *= 0.6 + 0.4 * sqrt(1.0 - r * r);
        fragColor = vec4(col, 1.0);
        return;
    }
    // A fish: silver flank with a dark back, the photo as its sheen; the
    // flash is a per-fish phase on the clock plus the onset.
    vec2 d = (vTexCoord - 0.5) * 2.0;
    float body = 1.0 - smoothstep(0.7, 1.0, abs(d.x)) * 0.5;
    if (abs(d.y) > 1.0) discard;
    float flash = pow(0.5 + 0.5 * sin(sceneAdvance * 4.0 + vLit * 6.28 + vWorld.x), 8.0);
    flash = max(flash, clamp(audioOnset, 0.0, 1.0) * 0.8);
    vec3 silver = mix(vec3(0.75, 0.8, 0.85), imgPalette(hue * 0.159 + 0.5) * 1.4, 0.3);
    vec3 back = vec3(0.1, 0.18, 0.25);
    col = mix(silver, back, smoothstep(0.1, 0.8, d.y)) * body * sun;
    col += vec3(1.0) * flash * 1.2;
    // Distance fade into the water.
    float fog = 1.0 - exp(-max(vWorld.z - 4.0, 0.0) * 0.08);
    col = mix(col, water * 1.2, clamp(fog, 0.0, 0.8));
    col *= 0.75 + 0.5 * audioLevel;

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
