#version 330 core
out vec4 fragColor;
/**
 * @file SuspensionBridgeCables.frag
 * @brief SUSPENSION BRIDGE CABLES (fragment): under the deck of a
 * suspension bridge, flying along it on the scene clock.  The main cables
 * sweep in their catenary with lamp beads along them, the hangers drop to
 * the girder overhead, the towers pass, and the water below carries the
 * lights.  Each lamp takes a spectrum band; the swell is the fog that
 * softens the far end; the kick lifts the aircraft warning lights on the
 * tower tops (light only).
 *
 * Audio Reactivity:
 *   audioSpectrum[32] -> lamp colours along the cable (light)
 *   audioSwell        -> fog depth (slow)
 *   audioKick         -> tower warning lights (light)
 *   audioHigh         -> water sparkle (light)
 *   audioLevel        -> brightness
 */
uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float sceneAdvance;
uniform float sceneTime;
uniform float audioAdvance;
uniform float audioSpectrum[32];
uniform float audioSwell;
uniform float audioKick;
uniform float audioHigh;
uniform float audioLevel;
uniform float audioChromaHue;
uniform float audioValence;

uniform float spanP;
uniform float lampP;
uniform float hueP;

in vec2  vTexCoord;
in vec3  vWorld;
in float vKind;
in float vAux;
in float vId;

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
    vec2 uv = vTexCoord;
    float dusk = 0.55 + 0.6 * clamp(audioSwell, 0.0, 1.0);
    float hi = clamp(audioHigh * 2.0, 0.0, 1.0);
    vec3 col;

    if (vKind < -1.5)
    {
        // The water below: the photo, darkened, with the bridge lights
        // smeared into it and a sparkle on the treble.
        vec2 wuv = clamp(vec2(vWorld.x * 0.02 + 0.5, vWorld.z * 0.012), 0.0, 1.0);
        col = img(wuv) * mix(vec3(0.16, 0.2, 0.3), imgPalette(hue * 0.159 + 0.55) * 0.4, 0.5) * dusk;
        float ripple = 0.5 + 0.5 * sin(vWorld.z * 1.2 + vWorld.x * 0.6 + sceneAdvance * 1.5);
        col *= 0.7 + 0.5 * ripple;
        // Reflected lamps: bright vertical smears under the cable line.
        float band = fract(abs(vWorld.x) * 0.09);
        col += imgPalette(hue * 0.159 + band) * exp(-abs(abs(vWorld.x) - 5.0) * 0.7) * (0.25 + 0.5 * ripple) * 0.5;
        vec2 sg = vec2(vWorld.x * 6.0, vWorld.z * 3.0);
        vec2 sc = floor(sg), sf = fract(sg) - 0.5;
        vec2 sj = vec2(hash21(sc + 1.3), hash21(sc + 5.9)) - 0.5;
        float glint = smoothstep(0.2, 0.05, length(sf - sj * 0.7)) * step(0.985, hash21(sc));
        col += vec3(1.0) * glint * hi * 0.5;
        col *= exp(-max(vWorld.z - 20.0, 0.0) * 0.02);
    }
    else if (vKind < -0.5)
    {
        // Sky: dusk from the photo, deepening upward.
        col = img(uv) * mix(vec3(0.5, 0.55, 0.75), imgPalette(hue * 0.159 + 0.6), 0.35) * dusk;
        col = mix(col * 1.2, col * 0.45, smoothstep(0.35, 0.9, uv.y));
        col += mix(vec3(1.0, 0.55, 0.35), imgPalette(hue * 0.159 + 0.1), 0.3) * smoothstep(0.45, 0.1, uv.y) * 0.3 * dusk;
    }
    else if (vKind > 3.5)
    {
        // A lamp bead on the cable: round, its colour from a band.
        vec2 d = (uv - 0.5) * 2.0;
        float r = length(d);
        if (r > 1.0) discard;
        int band = int(mod(vId * 3.0 + 5.0, 32.0));
        float e = clamp(audioSpectrum[band] * 1.7, 0.0, 1.0);
        vec3 lc = mix(vec3(1.0, 0.85, 0.6), imgPalette(hue * 0.159 + float(band) / 32.0) * 1.5, 0.45);
        col = lc * (0.7 + 1.5 * e) * (1.0 - r * r * 0.55);
        col += vec3(1.0) * (1.0 - smoothstep(0.0, 0.35, r)) * (0.3 + 0.8 * e);
    }
    else if (vKind > 2.5)
    {
        // The deck girder overhead: dark underside with ribs and the road
        // lights leaking through the expansion joints.
        col = mix(vec3(0.1, 0.1, 0.11), img(clamp(vec2(uv.x, uv.y * 0.4 + 0.3), 0.0, 1.0)) * 0.3, 0.35);
        float rib = smoothstep(0.06, 0.02, abs(fract(uv.y * 40.0 + sceneAdvance * 0.5) - 0.5) - 0.4);
        col *= 0.7 + 0.6 * rib;
        col *= 0.5 + 0.5 * smoothstep(0.0, 0.25, abs(uv.x - 0.5));
        float joint = smoothstep(0.02, 0.0, abs(fract(uv.y * 8.0 + sceneAdvance * 0.1) - 0.5) - 0.47);
        col += mix(vec3(1.0, 0.8, 0.5), imgPalette(hue * 0.159 + 0.2), 0.3) * joint * 0.5;
        col *= dusk;
    }
    else if (vKind > 1.5)
    {
        // A tower: painted steel, lit from one side, with the warning light
        // near the top that the kick lifts.
        col = mix(vec3(0.45, 0.32, 0.28), imgPalette(hue * 0.159 + 0.05), 0.3) * dusk;
        col *= 0.5 + 0.7 * smoothstep(0.0, 0.4, uv.x) * smoothstep(1.0, 0.6, uv.x);
        float plate = smoothstep(0.05, 0.02, abs(fract(uv.y * 18.0) - 0.5) - 0.42);
        col *= 0.85 + 0.25 * plate;
        float warn = smoothstep(0.03, 0.0, length(vec2(uv.x - 0.5, uv.y - 0.93)));
        col += vec3(1.0, 0.15, 0.1) * warn * (0.35 + 1.3 * audioKick);
        col += vec3(1.0, 0.2, 0.12) * exp(-length(vec2(uv.x - 0.5, uv.y - 0.93)) * 9.0) * (0.1 + 0.5 * audioKick);
    }
    else if (vKind > 0.5)
    {
        // A hanger: a thin rod, brighter at the top where the lamp is.
        float across = abs(uv.x - 0.5) * 2.0;
        col = mix(vec3(0.5, 0.5, 0.52), imgPalette(hue * 0.159 + 0.4), 0.25) * dusk;
        col *= 0.4 + 0.8 * (1.0 - across * across);
        col *= 0.7 + 0.5 * (1.0 - vAux);
    }
    else
    {
        // The main cable: a thick rope with a specular line along it.
        float across = abs(uv.x - 0.5) * 2.0;
        vec3 cableCol = mix(vec3(0.62, 0.6, 0.58), imgPalette(hue * 0.159 + 0.1), 0.3);
        col = cableCol * dusk * (0.35 + 0.9 * sqrt(max(1.0 - across * across, 0.0)));
        col += vec3(1.0, 0.95, 0.85) * smoothstep(0.35, 0.0, abs(uv.x - 0.38)) * 0.35 * dusk;
        // Strand winding.
        col *= 0.88 + 0.2 * sin(uv.y * 90.0 + uv.x * 6.0);
    }
    // Distance fog: the far end of the bridge goes into the dusk.
    float fog = 1.0 - exp(-max(vWorld.z - 8.0, 0.0) * (0.02 + 0.02 * (1.0 - clamp(audioSwell, 0.0, 1.0))));
    vec3 fogCol = mix(vec3(0.3, 0.33, 0.42), imgPalette(hue * 0.159 + 0.6) * 0.5, 0.4) * dusk;
    col = mix(col, fogCol, clamp(fog, 0.0, 0.85) * step(-1.5, vKind));
    col *= 0.85 + 0.3 * audioLevel;

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
