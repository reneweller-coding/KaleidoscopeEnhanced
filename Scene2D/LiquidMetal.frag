#version 330 core
out vec4 fragColor;
/**
 * @file LiquidMetal.frag
 * @brief Screen-space fluid rendering of 32k cohesive metal particles as a single molten, reflective body.
 *
 * texMetal's density, compute-splatted by CfxMetalStep, is smoothed over a 5-tap kernel and thresholded into a surface; the gradient of that smoothed density gives the surface normal used for specular highlights and a photo reflection distorted along the normal, so the metal mirrors the room it sits in. audioKick and audioHigh intensify the specular highlight, audioBeat adds a light overall pulse, and the highlight/reflection tint comes from an imgPalette arc sampled from the photo, rotated by audioChromaHue and audioAdvance with audioValence setting its saturation.
 */
// LiquidMetal.frag — screen-space fluid rendering.  Blend/CfxMetalStep.comp
// splats 32k cohesive particles into a DENSITY field (alpha channel); the
// surface is reconstructed here by thresholding that density and taking its
// gradient as the normal.  That is the standard screen-space fluid trick, and
// it only works because the particles could scatter into the field at all.

uniform sampler2D tex0;
uniform sampler2D texMetal;      // <- requests the liquid-metal sim
uniform vec2  resolution;
uniform float time;
uniform float interpolation;

uniform float audioLevel;
uniform float audioBeat;
uniform float audioKick;
uniform float audioHigh;
uniform float audioChromaHue;

uniform float shineP;
uniform float thickP;
uniform sampler2D tex1;
uniform float audioAdvance;
uniform float audioValence;

vec3 img(vec2 uv) {
    return (interpolation * texture(tex0, uv) + (1.0 - interpolation) * texture(tex1, uv)).rgb;
}


// IMG-PALETTE (house standard): colours come from a rotating arc in the
// CURRENT slideshow image, so every activation inherits a fresh palette from
// the photos; the arc follows the musical key (audioChromaHue is circular-
// slewed = jump-free) with a slow advance drift, valence shapes saturation.
vec3 imgPalette(float t)
{
    float ang = audioChromaHue + audioAdvance * 0.04 + t * 6.2831853;
    float rad = 0.16 + 0.08 * sin(audioAdvance * 0.013);
    vec3  pc  = img(clamp(vec2(0.5) + rad * vec2(cos(ang), sin(ang)), 0.0, 1.0));
    float pg  = dot(pc, vec3(0.333));
    return mix(vec3(pg), pc, 0.55 + 0.45 * audioValence);
}

float dens(vec2 uv)
{
    // Smooth the raw splat field: individual discs must merge into one body.
    float d = texture(texMetal, uv).a * 4.0;
    vec2 px = 28.0 / resolution;   // noch breiter: das Splat-Feld las sich als HF-Rauschen
    d += texture(texMetal, uv + vec2( px.x, 0.0)).a * 2.0;
    d += texture(texMetal, uv + vec2(-px.x, 0.0)).a * 2.0;
    d += texture(texMetal, uv + vec2(0.0,  px.y)).a * 2.0;
    d += texture(texMetal, uv + vec2(0.0, -px.y)).a * 2.0;
    return d / 12.0;
}

void main()
{
    vec2 uv = gl_FragCoord.xy / resolution;
    vec2 px = 1.0 / resolution;

    float d = dens(uv);
    float surf = smoothstep(0.35, 1.8 + 1.5 * thickP, d);

    // Normal from the density gradient — the metal's shape.
    float dx = dens(uv + vec2(px.x * 8.0, 0.0)) - dens(uv - vec2(px.x * 8.0, 0.0));
    float dy = dens(uv + vec2(0.0, px.y * 8.0)) - dens(uv - vec2(0.0, px.y * 8.0));
    vec3 n = normalize(vec3(-dx * 9.0, -dy * 9.0, 1.0));

    vec3 V = vec3(0.0, 0.0, 1.0);
    vec3 L = normalize(vec3(0.5 * sin(time * 0.13), 0.5 * cos(time * 0.10), 0.85));
    vec3 Hv = normalize(L + V);

    float spec = pow(max(dot(n, Hv), 0.0), 45.0 + 90.0 * shineP);
    float fres = pow(1.0 - max(dot(n, V), 0.0), 2.5);

    // The room the metal reflects: the photo, distorted by the surface normal.
    vec3 refl = texture(tex0, clamp(uv + n.xy * 0.28, 0.0, 1.0)).rgb;
    vec3 tint = imgPalette(0.0) * 1.35;

    vec3 metal = vec3(0.03) + refl * (0.35 + 0.85 * fres)
               + tint * spec * (1.4 + 1.4 * audioKick + 0.6 * audioHigh);

    // Background: the photo, dimmed, so the drops read as sitting in a room.
    vec3 bg = texture(tex0, uv).rgb;
    bg = mix(vec3(dot(bg, vec3(0.33))), bg, 0.5) * 0.16;

    vec3 col = mix(bg, metal, surf);
    col *= 1.0 + 0.15 * audioBeat;

    col = col / (1.0 + col * 0.28);
    fragColor = vec4(col, interpolation);
}
