#version 330 core
out vec4 fragColor;
/**
 * @file LidarSweepPointCloud.frag
 * @brief Fragment stage for LidarSweepPointCloud: black (no room is drawn,
 * only what the beam has seen), the points as round dots coloured by the
 * photo at their uv and by height (the classic range colouring), fading
 * with their age; the scanner as a small glowing box, the beam as a line;
 * the bass is the scanner glow, the kick a flash along the beam, the
 * treble sparkles the freshest points.
 *
 * Audio Reactivity: audioBass -> scanner glow; audioKick -> beam flash;
 *                   audioHigh -> fresh-point sparkle; audioLevel -> brightness.
 */
in vec2  vTexCoord;
in vec3  vWorld;
in float vKind;
in float vLit;

uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;
uniform float audioBass;
uniform float audioKick;
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

void main()
{
    float hue = (hueP > 0.001) ? hueP : 0.0;
    vec3 col;
    if (vKind > 2.5)
    {
        col = mix(vec3(1.0, 0.3, 0.2), imgPalette(hue * 0.159 + 0.0), 0.3) * (0.6 + 1.5 * audioKick);
        fragColor = vec4(col, 1.0);
        return;
    }
    if (vKind > 1.5)
    {
        col = vec3(0.3, 0.32, 0.35) * (0.5 + 0.5 * vTexCoord.y) + vec3(1.0, 0.3, 0.2) * (0.3 + 0.9 * clamp(audioBass, 0.0, 1.0)) * smoothstep(0.6, 0.4, length(vTexCoord - 0.5));
        fragColor = vec4(col, 1.0);
        return;
    }
    // A point: round, photo colour tinted by height, fading with age.
    vec2 d = (vTexCoord - floor(vTexCoord * 100.0) / 100.0) * 100.0 - 0.5;   // uv spans a 0.01 window: recover the quad coordinate
    // Simpler: use the fragment's position within the quad from the uv window edges.
    vec2 q = fract(vTexCoord * 100.0) - 0.5;
    float r = length(q) * 2.0;
    if (r > 1.0) discard;
    vec3 photo = img(vTexCoord);
    float heightT = clamp((vWorld.y + 3.0) / 7.0, 0.0, 1.0);
    vec3 rangeCol = mix(vec3(0.2, 0.5, 1.0), vec3(1.0, 0.6, 0.2), heightT);
    col = mix(photo * 1.4, rangeCol, 0.4) * (0.4 + 1.2 * vLit) * (1.0 - r * r * 0.5) * 1.5;
    col += vec3(1.0) * smoothstep(0.7, 1.0, vLit) * clamp(audioHigh * 2.0, 0.0, 1.0) * 0.5 * (1.0 - r);
    col *= 0.75 + 0.5 * audioLevel;

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
