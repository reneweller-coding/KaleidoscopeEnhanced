#version 330 core
out vec4 fragColor;
/**
 * @file MeshSandSculpture.frag
 * @brief MESH SAND SCULPTURE: wet sand -- warm, grainy, with round glints of
 * shell and quartz -- under a beach sky that is the photo.  Where the wind
 * has eroded the surface (vErode) the sand is drier and paler; the treble
 * makes the grains glint, the swell is the sun, the kick a gust of blown
 * sand as round grains streaming off the sculpture (light).
 *
 * Audio Reactivity:
 *   audioRoughness -> erosion (vertex stage, slow)
 *   audioHigh      -> grain glint (light)
 *   audioSwell     -> sunlight (slow)
 *   audioKick      -> blown sand (light)
 *   audioLevel     -> brightness
 *
 * Per-activation variety: sizeP, erodeP, hueP.
 */
uniform sampler2DArray texMeshMaterial;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float time;
uniform float sceneAdvance;
uniform float audioAdvance;
uniform float audioHigh;
uniform float audioSwell;
uniform float audioKick;
uniform float audioLevel;
uniform float audioChromaHue;
uniform float audioValence;
uniform float hueP;

in vec2 vUV;
in vec3 vNormal;
in vec3 vObj;
in vec3 vPos;
in float vBg;
in float vErode;

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

float hash31(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }

void main()
{
    float hue = (hueP > 0.001) ? hueP : 0.0;
    float sun = 0.6 + 0.7 * clamp(audioSwell, 0.0, 1.0);
    if (vBg > 0.5)
    {
        // Beach: the photo as sky above, sand below the horizon.
        vec3 d = normalize(vPos);
        vec3 col;
        if (d.y > -0.05)
        {
            vec2 uv = clamp(vec2(d.x / max(d.z, 0.2) * 0.4 + 0.5, d.y * 1.2 + 0.4), 0.0, 1.0);
            col = img(uv) * mix(vec3(0.8, 0.9, 1.0), imgPalette(hue * 0.159 + 0.6), 0.3) * sun;
            col += vec3(1.0, 0.9, 0.7) * exp(-length(d.xy - vec2(0.3, 0.35)) * 5.0) * sun * 0.6;
        }
        else
        {
            vec3 sand = vec3(0.85, 0.75, 0.55) * mix(vec3(1.0), imgPalette(hue * 0.159 + 0.1) * 1.5, 0.2);
            col = sand * (0.5 + 0.5 * sun) * (0.7 + 0.3 * smoothstep(-0.6, -0.05, d.y));
            col *= 0.9 + 0.1 * hash31(floor(d * 300.0));
        }
        fragColor = vec4(col, 1.0);
        return;
    }
    vec3 n = normalize(vNormal);
    vec3 L = normalize(vec3(0.5, 0.75, -0.55));
    // Wrap lighting: robust against the model's normal orientation.
    float diff = clamp(dot(n, L) * 0.5 + 0.5, 0.0, 1.0);
    // Wet sand dark and warm, dry (eroded) sand pale.
    vec3 wet = vec3(0.55, 0.42, 0.28) * mix(vec3(1.0), imgPalette(hue * 0.159 + 0.1) * 1.6, 0.2);
    vec3 dry = vec3(0.9, 0.82, 0.65);
    float e = clamp(vErode, 0.0, 1.0);
    vec3 sand = mix(wet, dry, e * 0.8);
    // Grain: fine noise, plus round glints of quartz on the treble.
    float grain = hash31(floor(vObj * 220.0));
    sand *= 0.85 + 0.3 * grain;
    vec3 gc = floor(vObj * 60.0);
    vec3 gf = fract(vObj * 60.0) - 0.5;
    vec3 goff = vec3(hash31(gc + 1.0), hash31(gc + 2.0), hash31(gc + 3.0)) - 0.5;
    float glint = smoothstep(0.2, 0.05, length(gf - goff * 0.5)) * step(0.9, hash31(gc)) * (0.2 + 1.2 * clamp(audioHigh * 2.0, 0.0, 1.0));
    vec3 col = sand * (0.45 + 1.0 * diff) * sun;
    col += vec3(1.0, 0.97, 0.9) * glint * diff;
    // A hint of sky reflection in the wet sand.
    vec3 V = normalize(-vPos);
    float fres = pow(1.0 - max(dot(n, V), 0.0), 4.0) * (1.0 - e);
    col += mix(vec3(0.7, 0.8, 1.0), imgPalette(hue * 0.159 + 0.6), 0.4) * fres * 0.3 * sun;
    // Blown sand on the kick: round grains streaming leeward (light only).
    vec3 wp = vObj + vec3(sceneAdvance * 0.4, 0.0, 0.0);
    vec3 wc = floor(wp * 40.0);
    vec3 wf = fract(wp * 40.0) - 0.5;
    float blown = smoothstep(0.25, 0.08, length(wf)) * step(0.93, hash31(wc)) * audioKick;
    col += dry * blown * 0.8;
    col *= 0.75 + 0.5 * audioLevel;

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
