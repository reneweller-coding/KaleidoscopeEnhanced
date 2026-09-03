#version 330 core
out vec4 fragColor;
/**
 * @file TidalDisruptionEvent.frag
 * @brief Fragment stage for TidalDisruptionEvent: soft star particles, the
 * black hole as a shadow disc with a photon ring that glows with the bass,
 * and a deep-space sky with round stars.
 *
 * Audio Reactivity: audioKick flashes the particles; audioBass glows the
 *                   photon ring; audioDrop floods the ring (the tearing).
 */
in vec4  vColor;
in vec2  vTexCoord;
in float vDepth;
in float vKind;
in float vSpeed;

uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;
uniform float audioKick;
uniform float audioBass;
uniform float audioDrop;
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
        vec3 deep = imgPalette(0.55) * 0.04;
        vec2 su = vTexCoord * vec2(240.0, 140.0);
        vec2 cell = floor(su); vec2 f = fract(su) - 0.5;
        float hs = fract(sin(dot(cell, vec2(127.1, 311.7))) * 43758.5453);
        vec2 off = vec2(fract(hs * 57.0), fract(hs * 113.0)) - 0.5;
        float star = smoothstep(0.14, 0.02, length(f - off * 0.6)) * step(0.985, hs) * (0.5 + 0.5 * fract(hs * 31.0));
        col = deep + vec3(star);
    }
    else if (vKind > 1.5)
    {
        // The hole: black inside the shadow, a thin photon ring outside.
        vec2 d = vTexCoord - 0.5;
        float r = length(d) * 2.0;
        float ring = exp(-abs(r - 0.42) * 30.0);
        float halo = exp(-max(r - 0.42, 0.0) * 6.0) * 0.3;
        float a = smoothstep(0.35, 0.4, r);
        if (r > 0.95) discard;
        vec3 ringCol = imgPalette(0.9) * 1.6 + vec3(0.3, 0.2, 0.1);
        col = ringCol * (ring * (0.6 + 1.2 * audioBass + 2.0 * clamp(audioDrop, 0.0, 1.0)) + halo) * a;
        if (r < 0.38) col = vec3(0.0);
    }
    else
    {
        vec2 d = vTexCoord - 0.5;
        float r = length(d) * 2.0;
        float a = exp(-r * r * 4.0) - 0.02;
        if (a < 0.04) discard;
        col = vColor.rgb * a * (1.6 + 0.8 * audioKick);
        col *= clamp(1.5 - vDepth * 0.06, 0.35, 1.0);
    }
    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
