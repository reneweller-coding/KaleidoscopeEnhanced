#version 330 core
out vec4 fragColor;
/**
 * @file GlacierCalvingFront.frag
 * @brief Fragment stage for GlacierCalvingFront: a grey polar sky, the
 * cliff face of blue-white ice carrying the photo as its crevasse pattern
 * and lit from within by the bass, the sea dark with the cliff reflected,
 * slabs as photo ice, spray as round white drops, the kick a flash along
 * the fresh calving scar.
 *
 * Audio Reactivity: audioBass -> ice glow; audioKick -> scar flash;
 *                   audioSwell -> daylight; audioHigh -> spray sparkle; audioLevel.
 */
in vec2  vTexCoord;
in vec3  vWorld;
in float vKind;
in float vLife;

uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;
uniform float sceneAdvance;
uniform float audioBass;
uniform float audioKick;
uniform float audioSwell;
uniform float audioHigh;
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

float hash21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

void main()
{
    float hue = (hueP > 0.001) ? hueP : 0.0;
    float day = 0.6 + 0.6 * clamp(audioSwell, 0.0, 1.0);
    float bass = clamp(audioBass, 0.0, 1.0);
    vec3 iceBlue = mix(vec3(0.55, 0.8, 1.0), imgPalette(hue * 0.159 + 0.55), 0.3);
    vec3 col;
    if (vKind < -1.5)
    {
        // The sea: dark grey-green, the cliff reflected faintly, swell lines.
        vec2 uv = vTexCoord;
        col = mix(vec3(0.08, 0.14, 0.18), vec3(0.2, 0.3, 0.35), uv.y) * day;
        col += iceBlue * 0.25 * smoothstep(0.6, 1.0, uv.y) * (0.5 + 0.5 * bass);
        col *= 0.9 + 0.1 * sin(uv.y * 80.0 + uv.x * 10.0 + sceneAdvance * 1.5);
        fragColor = vec4(col, 1.0);
        return;
    }
    if (vKind < -0.5)
    {
        // The sky: grey polar overcast with a bright band at the horizon.
        vec2 uv = vTexCoord;
        col = mix(vec3(0.8, 0.85, 0.9), vec3(0.45, 0.5, 0.6), uv.y) * day;
        fragColor = vec4(col, 1.0);
        return;
    }
    if (vKind > 1.5)
    {
        // The cliff face: the photo as crevasse pattern in blue ice, lit
        // from within by the bass, brighter at the top, the waterline dark.
        vec2 uv = vTexCoord;
        vec3 photo = img(fract(uv * vec2(4.0, 1.0)));
        col = mix(iceBlue, photo * 1.3, 0.4) * (0.4 + 0.6 * uv.y) * day;
        col += iceBlue * 0.35 * bass * (1.0 - uv.y);
        // Crevasses: smooth vertical fissures (no cell blocks, rule V8e).
        float fiss = sin(uv.x * 140.0 + 3.0 * sin(uv.y * 9.0 + uv.x * 20.0)) * 0.5 + 0.5;
        float crev = smoothstep(0.75, 0.95, fiss) * smoothstep(0.05, 0.3, uv.y);
        col *= 1.0 - 0.4 * crev;
        col += vec3(1.0) * audioKick * 0.5 * smoothstep(0.5, 0.0, abs(uv.y - 0.7)) * crev;
        fragColor = vec4(col, 1.0);
        return;
    }
    if (vKind > 0.5)
    {
        // Spray: round white drops fading with life, sparkling on the treble.
        vec2 d = (vTexCoord - 0.5) * 2.0;
        float r = length(d);
        if (r > 1.0) discard;
        col = vec3(0.95, 0.98, 1.0) * (1.0 - r * r) * (0.6 + 0.6 * vLife) * day;
        col += vec3(1.0) * clamp(audioHigh * 2.0, 0.0, 1.0) * 0.4 * (1.0 - r);
        fragColor = vec4(col, 1.0);
        return;
    }
    // A slab: photo ice, bright fresh faces, blue underside.
    vec3 photo = img(vTexCoord);
    col = mix(iceBlue * 1.1, photo * 1.3, 0.45) * day;
    col *= 0.7 + 0.3 * vTexCoord.y;
    col += iceBlue * 0.2 * bass;
    col *= 0.75 + 0.5 * audioLevel;

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
