#version 330 core
out vec4 fragColor;
// FerroSpikes.frag — ferrofluid under a magnet.  Blend/CfxFerro.comp runs a
// Swift-Hohenberg field whose peaks form the Rosensweig spike lattice; this
// pass shades it as black liquid metal, which means specular highlights and
// an environment reflection rather than a colour ramp.

uniform sampler2D tex0;
uniform sampler2D texFerro;      // <- requests the ferrofluid sim
uniform vec2  resolution;
uniform float time;
uniform float interpolation;

uniform float audioLevel;
uniform float audioBeat;
uniform float audioKick;
uniform float audioSubBass;
uniform float audioChromaHue;
uniform float audioHigh;

uniform float shineP;
uniform float reflectP;

float hAt(vec2 uv) { return texture(texFerro, uv).r; }

void main()
{
    vec2 uv = gl_FragCoord.xy / resolution;
    vec2 px = 1.0 / resolution;

    float h = hAt(uv);

    // Surface normal from the height gradient.
    float hx = hAt(uv + vec2(px.x * 2.0, 0.0)) - hAt(uv - vec2(px.x * 2.0, 0.0));
    float hy = hAt(uv + vec2(0.0, px.y * 2.0)) - hAt(uv - vec2(0.0, px.y * 2.0));
    vec3 n = normalize(vec3(-hx * 7.0, -hy * 7.0, 1.0));

    vec3 V = vec3(0.0, 0.0, 1.0);
    vec3 L = normalize(vec3(0.45 * sin(time * 0.09), 0.45 * cos(time * 0.07), 0.9));

    float diff = max(dot(n, L), 0.0);
    vec3  Hv   = normalize(L + V);
    float spec = pow(max(dot(n, Hv), 0.0), 60.0 + 90.0 * shineP);
    float fres = pow(1.0 - max(dot(n, V), 0.0), 3.0);

    // Reflection: the photo, sampled along the normal — the ferrofluid mirrors
    // the room it stands in, which is what sells it as a liquid metal.
    vec3 refl = texture(tex0, clamp(uv + n.xy * (0.10 + 0.22 * reflectP), 0.0, 1.0)).rgb;

    // Body is nearly black; almost all the light is specular + reflection.
    vec3 body = vec3(0.075, 0.080, 0.105) * (0.5 + 1.6 * diff);
    vec3 tint = 0.5 + 0.5 * cos(6.2831853 * (vec3(0.0, 0.33, 0.67))
                                + 0.6 * sin(audioChromaHue));

    vec3 col = body
             + refl * fres * (0.55 + 0.9 * reflectP)
             + tint * spec * (1.6 + 3.0 * audioKick + 1.2 * audioHigh);

    // The spikes themselves glow faintly at their tips on the bass.
    float peak = smoothstep(0.35, 1.2, h);
    col += tint * peak * (0.10 + 0.55 * audioSubBass + 0.35 * audioBeat);

    col = col / (1.0 + col * 0.30);
    fragColor = vec4(col, interpolation);
}
