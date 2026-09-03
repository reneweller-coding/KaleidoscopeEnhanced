#version 330 core
out vec4 fragColor;
/**
 * @file MonarchRoostTree.frag
 * @brief Fragment stage for MonarchRoostTree: a misty forest of the photo
 * behind, the fir in dark green-brown, the wings orange with black veins
 * and white-dotted margins, the photo showing through as the orange field
 * (a wing-shaped cut of it), flying ones brighter in the sun; the kick a
 * flash of sun through the boughs, the treble a shimmer on the wings.
 *
 * Audio Reactivity: audioSwell -> sun (and wing opening in the generator);
 *                   audioKick -> sun flash; audioHigh -> wing shimmer; audioLevel.
 */
in vec2  vTexCoord;
in vec3  vWorld;
in float vKind;
in float vFly;
in float vId;

uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;
uniform float audioSwell;
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

float hash21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

void main()
{
    float hue = (hueP > 0.001) ? hueP : 0.0;
    float sun = 0.5 + 0.7 * clamp(audioSwell, 0.0, 1.0);
    vec3 col;
    if (vKind < -0.5)
    {
        vec2 uv = vTexCoord;
        vec3 soft = (interpolation * textureLod(tex0, uv, 4.0) + (1.0 - interpolation) * textureLod(tex1, uv, 4.0)).rgb;
        col = soft * mix(vec3(0.6, 0.75, 0.6), imgPalette(hue * 0.159 + 0.35), 0.3) * sun;
        col = mix(col, vec3(0.8, 0.85, 0.8) * sun, smoothstep(0.3, 0.9, uv.y) * 0.5);      // mist up high
        col += vec3(1.0, 0.95, 0.8) * exp(-length(uv - vec2(0.7, 0.75)) * 4.0) * sun * (0.4 + 1.0 * audioKick);
        fragColor = vec4(col, 1.0);
        return;
    }
    if (vKind > 1.5)
    {
        // Trunk and boughs: dark bark.
        col = mix(vec3(0.25, 0.18, 0.12), img(fract(vTexCoord * vec2(1.0, 4.0))) * 0.4, 0.4) * (0.4 + 0.6 * vTexCoord.x) * sun;
        fragColor = vec4(col, 1.0);
        return;
    }
    // A wing: uv.x along the wing from body (0) to tip (1), uv.y along the
    // body; a wing outline (discard outside), orange field of the photo,
    // black veins, white dots on the black margin.
    vec2 w = vTexCoord;
    float shape = smoothstep(1.0, 0.85, length((w - vec2(0.0, 0.5)) * vec2(1.0, 1.6)));
    if (shape < 0.05) discard;
    vec3 orange = mix(vec3(1.0, 0.5, 0.05), imgPalette(hue * 0.159 + 0.05), 0.2);
    vec3 photo = img(fract(w * vec2(0.5, 0.5) + vId * 0.13));
    vec3 field = mix(orange, orange * (0.6 + 0.8 * dot(photo, vec3(0.333))), 0.5);
    float veins = smoothstep(0.06, 0.0, abs(sin(w.y * 12.0 + w.x * 3.0)) * 0.5) * step(0.1, w.x);
    veins = max(veins, smoothstep(0.03, 0.0, abs(w.x - 0.45) - 0.0));
    float margin = smoothstep(0.75, 0.9, length((w - vec2(0.0, 0.5)) * vec2(1.0, 1.6)));
    float dots = smoothstep(0.35, 0.15, length(fract(vec2(w.x * 10.0, w.y * 6.0)) - 0.5)) * margin;
    col = mix(field, vec3(0.05, 0.03, 0.02), max(veins, margin) * 0.9);
    col = mix(col, vec3(0.95), dots);
    col *= (0.5 + 0.6 * sun) * (1.0 + 0.6 * vFly);
    col += vec3(1.0, 0.9, 0.7) * clamp(audioHigh * 2.0, 0.0, 1.0) * 0.25 * (1.0 - margin);
    col *= 0.75 + 0.5 * audioLevel;

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
