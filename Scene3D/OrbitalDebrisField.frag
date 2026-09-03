#version 330 core
out vec4 fragColor;
/**
 * @file OrbitalDebrisField.frag
 * @brief Fragment stage for OrbitalDebrisField: metal plates with a glint,
 * the station hull with running lights, a planet limb with an atmosphere
 * gradient (kind 3) and a hashed star sky (kind -1).
 *
 * Audio Reactivity: audioRoughness sharpens the glint; audioKick flashes the
 *                   station lights; audioSwell warms the atmosphere.
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
uniform float audioRoughness;
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
        vec3 deep = imgPalette(0.6) * 0.04;
        vec2 su = vTexCoord * vec2(260.0, 150.0);
        vec2 cell = floor(su); vec2 f = fract(su) - 0.5;
        float hs = fract(sin(dot(cell, vec2(127.1, 311.7))) * 43758.5453);
        float star = step(0.987, hs) * exp(-dot(f, f) * 9.0) * (0.5 + 0.5 * fract(hs * 57.0));
        col = deep + vec3(star);
    }
    else if (vKind > 2.5)
    {
        // Planet limb: dark surface with the photo as cloud texture, a bright
        // atmosphere line at the top edge.
        float top = vTexCoord.y;                 // 1 at the limb
        vec3 surf = img(fract(vTexCoord * vec2(2.0, 0.6) + vec2(audioAdvance * 0.002, 0.0))) * 0.25;
        vec3 atm = mix(imgPalette(0.55), imgPalette(0.95), clamp(audioSwell, 0.0, 1.0));
        col = surf * (0.3 + 0.7 * top) + atm * (exp(-(1.0 - top) * 14.0) * 0.9 + exp(-(1.0 - top) * 3.0) * 0.15);
    }
    else if (vKind > 1.5)
    {
        // Station hull: panels with running lights that pulse on the kick.
        vec2 g = fract(vTexCoord * vec2(6.0, 2.0));
        float panel = smoothstep(0.0, 0.06, g.x) * smoothstep(1.0, 0.94, g.x) * smoothstep(0.0, 0.1, g.y) * smoothstep(1.0, 0.9, g.y);
        col = vColor.rgb * (0.4 + 0.6 * panel);
        float light = step(0.9, fract(vTexCoord.x * 6.0)) * step(0.4, vTexCoord.y) * step(vTexCoord.y, 0.6);
        col += imgPalette(0.05) * light * (0.8 + 1.5 * audioKick);
        col *= clamp(1.6 - vDepth * 0.08, 0.3, 1.0);
    }
    else
    {
        // A plate: an edge frame and a glint that sharpens with the roughness.
        vec2 e = min(vTexCoord, 1.0 - vTexCoord);
        float frame = 1.0 - smoothstep(0.0, 0.15, min(e.x, e.y));
        float sharp = 2.0 + 10.0 * clamp(audioRoughness * 2.0, 0.0, 1.0);
        float glint = pow(clamp(1.0 - abs(vTexCoord.x - 0.5) * 2.0, 0.0, 1.0), sharp) * 0.5;
        col = vColor.rgb * (0.6 + 0.4 * frame) + vec3(glint) * min(vLit, 1.0);
        col += imgPalette(0.1) * max(vLit - 1.0, 0.0) * 0.8;      // collision flash
        col *= clamp(1.5 - vDepth * 0.09, 0.15, 1.0);
    }
    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
