#version 330 core
out vec4 fragColor;
/**
 * @file DysonSwarmConstruction.frag
 * @brief Fragment stage for DysonSwarmConstruction: the star, the sky and the
 * panels.  The star is a soft disc (kind 2) that discards outside its glow;
 * the sky (kind -1) is deep space with the photo's grain as a star field;
 * panels get a thin frame and, on the kick, a flare on their back.
 *
 * Audio Reactivity: audioKick flares the panel backs; audioBass swells the
 *                   star; audioSwell warms the sky.
 */
in vec4  vColor;
in vec2  vTexCoord;
in float vDepth;
in float vKind;
in float vLit;

uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;
uniform float audioKick;
uniform float audioBass;
uniform float audioSwell;
uniform float audioChromaHue;
uniform float audioAdvance;
uniform float audioValence;

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
    vec3 col;
    if (vKind < 0.0)
    {
        // Deep space: near-black with a faint palette gradient and the
        // photo's bright grain as distant stars.
        vec3 deep = imgPalette(0.6) * 0.06 * (1.0 + 0.6 * audioSwell);
        // Distant stars: a hashed star field (the photo's bright patches read
        // as blobs, not stars).
        vec2 su = vTexCoord * vec2(240.0, 140.0);
        vec2 cell = floor(su); vec2 f = fract(su) - 0.5;
        float hs = fract(sin(dot(cell, vec2(127.1, 311.7))) * 43758.5453);
        float star = step(0.986, hs) * exp(-dot(f, f) * 9.0) * (0.5 + 0.5 * fract(hs * 57.0));
        col = deep + vec3(star);
    }
    else if (vKind > 1.5)
    {
        // The star: a soft disc with a hot core, swelling with the bass.
        vec2 d = vTexCoord - 0.5;
        float r = length(d) * 2.0;
        float core = exp(-r * r * 9.0);
        float halo = exp(-r * 3.2) * (0.6 + 0.6 * audioBass);
        float a = core + halo;
        if (a < 0.03) discard;
        vec3 hot = mix(imgPalette(0.95), vec3(1.0, 0.95, 0.8), 0.6);
        col = hot * (core * 2.2 + halo * 1.1);
    }
    else
    {
        // A panel: frame lines at the quad edge, the back flares on the kick.
        vec2 e = min(vTexCoord, 1.0 - vTexCoord);
        float frame = 1.0 - smoothstep(0.0, 0.12, min(e.x, e.y));
        col = vColor.rgb * (0.7 + 0.5 * vLit);
        col += imgPalette(0.9) * frame * (0.25 + 0.5 * vLit);
        col += imgPalette(0.2) * audioKick * 0.6 * (1.0 - vLit);
        // Docked panels radiate on their backs (the harvested heat), so the
        // shell reads from outside as a dull-warm sphere closing around the star.
        col += imgPalette(0.08) * (0.25 + 0.55 * vLit) * (0.4 + 0.6 * smoothstep(0.7, 1.0, vKind));
        // Depth fog toward the far side of the shell.
        col *= clamp(1.4 - vDepth * 0.09, 0.3, 1.0);
    }
    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
