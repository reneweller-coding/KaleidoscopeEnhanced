#version 330 core
out vec4 fragColor;
// SynthTerrain.frag — dark ground, glowing synthwave grid lines.
uniform float time;
uniform float audioKick;
uniform float audioChromaHue;
uniform float audioCentroid;
uniform float audioDrop;
uniform float audioBarPhase;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;
uniform float audioAdvance;
uniform float audioValence;

in vec3  vWorld;
in float vDist;

/**
 * @file SynthTerrain.frag
 * @brief Shades a synthwave valley flythrough: a dark ground plane crossed
 * by a glowing grid whose lines are coloured from the rotating photo-arc
 * palette, with a bright horizon-bound scan pulse sweeping the grid once per
 * bar.
 *
 * audioKick and audioDrop punch the grid-line brightness; audioBarPhase
 * times the recurring scan sweep down the valley; audioCentroid tilts the
 * ground's colour balance warm or cool; audioChromaHue/audioAdvance/
 * audioValence drive the rotating photo-palette used for the line colour.
 * Distance fog (vDist) dims the grid toward the horizon; the terrain's
 * spectrum-band-driven ridge heights are computed in the companion vertex
 * shader (SynthTerrain.vert).
 */

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

vec3 hueRot(vec3 c, float a)
{
    vec3  k = vec3(0.57735026919);
    float cs = cos(a), sn = sin(a);
    return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
}

void main()
{
    // Grid lines every 6 world units, glowing.
    float gx = abs(fract(vWorld.x / 6.0) - 0.5) * 2.0;
    float gz = abs(fract(vWorld.y / 6.0) - 0.5) * 2.0;
    float line = max(smoothstep(0.90, 1.0, gx), smoothstep(0.90, 1.0, gz));

    // A bright scan pulse sweeps toward the horizon once per bar.
    float sweep = exp(-abs(fract(vWorld.y * 0.004 - audioBarPhase) - 0.5) * 14.0);

    // Measured luma 0.016 / MOSTLY_BLACK: the neon-grid look stays, but
    // both the ground glow and the line gain come up.
    vec3 ground = mix(vec3(0.08, 0.04, 0.16), vec3(0.15, 0.08, 0.28),
                      clamp(vWorld.z / 22.0, 0.0, 1.0));
    vec3 lineCol = imgPalette(0.30 * clamp(vWorld.z / 20.0, 0.0, 1.0)) * 3.6;

    vec3 col = ground
             + lineCol * line * (0.9 + 1.1 * audioKick + 1.6 * audioDrop
                                     + 0.8 * sweep)
             + lineCol * sweep * 0.10;
    col *= mix(vec3(0.85, 0.9, 1.1), vec3(1.1, 1.0, 0.85), audioCentroid);
    col *= exp(-vDist * 0.010);                    // horizon fog

    fragColor = vec4(col, 1.0);
}
