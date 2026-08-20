#version 330 core
in vec3 vPos;
in float vKelvin;
in float vCirculation;

out vec4 fragColor;

/**
 * @file SuperfluidHeliumVortexTurbulence.frag
 * @brief Draws quantized vortex lines in turbulent superfluid helium as
 * glowing point sprites, coloured from the rotating photo-arc palette and
 * flashed white-hot where local "kelvin wave" amplitude (vKelvin) spikes.
 *
 * vCirculation (the vortex line's local circulation strength, from the
 * vertex stage) sets both the palette sample position and the brightness
 * multiplier; audioKick adds an overall brightness pulse; hueP rotates the
 * final colour. A soft-knee tone map keeps loud passages from crushing to
 * flat white.
 */

uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float audioPhase;
uniform float audioAdvance;
uniform float audioKick;
uniform float audioBass;
uniform float audioMid;
uniform float audioHigh;
uniform float audioSwell;

uniform float glowP;
uniform float hueP;
uniform float audioChromaHue;
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

vec3 hueRot(vec3 c, float a) {
    vec3 k = vec3(0.57735026919);
    float cs = cos(a), sn = sin(a);
    return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
}

void main() {
    float glw = (glowP > 0.0) ? glowP : 1.0;
    float hue = (hueP  > 0.0) ? hueP  : 0.0;

    // Superfluid vortex lines in photo-arc colours.  The gains are kept
    // low on purpose: the old x8 kelvin flash times the kick factor pushed
    // every line to pure white — no palette survives a x20 multiplier.
    vec3 vortexColor = imgPalette(0.30 * vCirculation) * 1.2;
    // vKelvin is the raw Kelvin-wave amplitude, whose magnitude only ever spans
    // 0..0.10 -- times 2.5 that is a 0..0.25 sliver, so every filament carried
    // essentially the same flash and the tangle had no bright cores in it.
    // Mapping the amplitude's ACTUAL range onto 0..1 makes the wave crests
    // genuinely white-hot against dim troughs.
    float kw = smoothstep(0.015, 0.105, abs(vKelvin));
    vec3 kelvinFlash = vec3(1.0, 0.95, 0.7) * kw * 0.85;

    vec3 col = (vortexColor + kelvinFlash) * (0.8 + 1.2 * vCirculation) * (1.0 + audioKick * 0.9) * glw;

    // Depth cue.  Now that the filaments are camera-facing ribbons rather than
    // edge-on hairlines they cover real area, and a tangle rendered at one flat
    // brightness across its whole depth reads as a mat, not as a volume.
    float camZ = vPos.z + 5.5;
    col *= clamp(1.20 - camZ / 13.0, 0.30, 1.0);

    if (hue > 0.001) col = hueRot(col, hue);

    // Catalogue review: soft-knee exposure — hot audio compresses
    // instead of clipping the whole frame to white.
    vec3 _catTone = min(col, vec3(2.2)) * 0.78;
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 0.9);
}
