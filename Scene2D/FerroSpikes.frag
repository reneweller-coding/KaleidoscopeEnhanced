#version 330 core
out vec4 fragColor;
/**
 * @file FerroSpikes.frag
 * @brief Black ferrofluid standing up into the Rosensweig spike lattice under a magnet, rendered as reflective liquid metal rather than a colour ramp.
 *
 * texFerro (from the CfxFerro Swift-Hohenberg compute pass) supplies a height field; its gradient gives the surface normal used for specular highlights and a photo reflection sampled along that normal, so the fluid mirrors the room it sits in. audioKick and audioHigh punch up the specular glints on the spike tips, audioSubBass and audioBeat make the spike peaks themselves glow, and the highlight/glow tint comes from an imgPalette arc sampled from the photo, rotated by audioChromaHue and audioAdvance with audioValence shaping its saturation.
 */
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

float hAt(vec2 uv) { return texture(texFerro, uv).r; }

void main()
{
    vec2 uv = gl_FragCoord.xy / resolution;
    vec2 px = 1.0 / resolution;

    // Langsame Dreh-Drift des Lesefensters: das Sim-Feld selbst ist traege,
    // so bekommt die Flaeche trotzdem eine stetige Eigenbewegung.
    vec2 cen = vec2(0.5);
    float ra = time * 0.045 + audioAdvance * 0.03;
    uv = cen + mat2(cos(ra), -sin(ra), sin(ra), cos(ra)) * (uv - cen) * (0.96 + 0.03 * sin(time * 0.11));

    float h = hAt(uv);

    // Surface normal from the height gradient.
    // Breitere Tastung: 2-px-Gradienten auf dem groben Sim-Feld machten
    // Klotz-Normalen -> "extrem pixelig". 5 px glaettet, ohne zu verwaschen.
    float hx = hAt(uv + vec2(px.x * 5.0, 0.0)) - hAt(uv - vec2(px.x * 5.0, 0.0));
    float hy = hAt(uv + vec2(0.0, px.y * 5.0)) - hAt(uv - vec2(0.0, px.y * 5.0));
    vec3 n = normalize(vec3(-hx * 5.0, -hy * 5.0, 1.0));

    vec3 V = vec3(0.0, 0.0, 1.0);
    vec3 L = normalize(vec3(0.45 * sin(time * 0.28), 0.45 * cos(time * 0.21), 0.9));

    float diff = max(dot(n, L), 0.0);
    vec3  Hv   = normalize(L + V);
    float spec = pow(max(dot(n, Hv), 0.0), 28.0 + 45.0 * shineP);
    float fres = pow(1.0 - max(dot(n, V), 0.0), 3.0);

    // Reflection: the photo, sampled along the normal — the ferrofluid mirrors
    // the room it stands in, which is what sells it as a liquid metal.
    vec3 refl = texture(tex0, clamp(uv + n.xy * (0.10 + 0.22 * reflectP), 0.0, 1.0)).rgb;

    // Body is nearly black; almost all the light is specular + reflection.
    vec3 body = vec3(0.15, 0.16, 0.21) * (0.8 + 2.0 * diff);
    vec3 tint = imgPalette(0.0) * 1.35;

    vec3 col = body
             + refl * fres * (0.95 + 1.1 * reflectP)
             + tint * spec * (1.6 + 3.0 * audioKick + 1.2 * audioHigh);

    // The spikes themselves glow faintly at their tips on the bass.
    float peak = smoothstep(0.35, 1.2, h);
    col += tint * peak * (0.30 + 0.85 * audioSubBass + 0.45 * audioBeat);

    col = col / (1.0 + col * 0.30);
    fragColor = vec4(col, interpolation);
}
