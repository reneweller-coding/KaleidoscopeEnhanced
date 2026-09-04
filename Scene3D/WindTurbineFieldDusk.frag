#version 330 core
out vec4 fragColor;
/**
 * @file WindTurbineFieldDusk.frag
 * @brief WIND TURBINE FIELD DUSK (fragment): a field of turbines at dusk.
 * The blades are pale against a photo sky, each turbine turning at its own
 * steady rate; the nav lights breathe with the kick (light only, never
 * motion); the swell is the last daylight; the spectrum tints the sky
 * band by band along the horizon.  Distance haze stacks the rows.
 *
 * Audio Reactivity:
 *   audioSwell        -> daylight and haze (slow)
 *   audioKick         -> nav lights (light)
 *   audioSpectrum[32] -> the horizon band colours (light)
 *   audioHigh         -> blade edge glints (light)
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

uniform float rowsP;
uniform float speedP;
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
    float dusk = 0.5 + 0.65 * clamp(audioSwell, 0.0, 1.0);
    float hi = clamp(audioHigh * 2.0, 0.0, 1.0);
    vec3 col;

    if (vKind < -1.5)
    {
        // The plain: the photo as fields, dark and cool, receding.
        vec2 guv = clamp(vec2(vWorld.x * 0.012 + 0.5, vWorld.z * 0.009), 0.0, 1.0);
        col = img(guv) * mix(vec3(0.3, 0.32, 0.26), imgPalette(hue * 0.159 + 0.35), 0.3) * dusk * 0.75;
        // Field boundaries, a faint patchwork.
        col *= 0.8 + 0.3 * step(0.5, fract(vWorld.x * 0.05)) * step(0.5, fract(vWorld.z * 0.04));
        col *= exp(-max(vWorld.z - 15.0, 0.0) * 0.012);
    }
    else if (vKind < -0.5)
    {
        // The sky: dusk, with the horizon banded by the spectrum.
        col = img(uv) * mix(vec3(0.55, 0.6, 0.8), imgPalette(hue * 0.159 + 0.6), 0.35) * dusk;
        col = mix(col * 1.15, col * 0.4, smoothstep(0.25, 0.95, uv.y));
        // The band of afterglow: one spectrum band per slice across the sky.
        int band = int(clamp(uv.x * 31.0, 0.0, 31.0));
        float e = clamp(audioSpectrum[band] * 1.6, 0.0, 1.0);
        vec3 glowCol = mix(vec3(1.0, 0.55, 0.3), imgPalette(hue * 0.159 + float(band) / 32.0) * 1.4, 0.45);
        col += glowCol * smoothstep(0.4, 0.06, uv.y) * (0.12 + 0.55 * e) * dusk;
        // A few stars high up.
        vec2 sg = uv * vec2(700.0, 400.0);
        vec2 sc = floor(sg), sf = fract(sg) - 0.5;
        vec2 sj = vec2(hash21(sc + 2.7), hash21(sc + 8.1)) - 0.5;
        float star = smoothstep(0.24, 0.06, length(sf - sj * 0.7)) * step(0.9975, hash21(sc));
        col += vec3(0.9) * star * smoothstep(0.55, 0.9, uv.y) * (1.0 - dusk * 0.4);
    }
    else if (vKind > 2.5)
    {
        // Nav light: a round red bead, breathing with the kick.
        vec2 d = (uv - 0.5) * 2.0;
        float r = length(d);
        if (r > 1.0) discard;
        col = vec3(1.0, 0.2, 0.12) * (0.5 + 1.8 * audioKick) * (1.0 - r * r * 0.6);
    }
    else if (vKind > 1.5)
    {
        // The nacelle: a pale box, lit from the afterglow side.
        col = mix(vec3(0.78, 0.78, 0.74), imgPalette(hue * 0.159 + 0.5), 0.2) * dusk;
        col *= 0.45 + 0.7 * smoothstep(0.0, 0.6, uv.x);
        col *= 0.8 + 0.3 * smoothstep(0.0, 0.4, uv.y);
    }
    else if (vKind > 0.5)
    {
        // The tower: a tapered column, brighter on the lit side, darker low.
        float across = abs(uv.x - 0.5) * 2.0;
        col = mix(vec3(0.8, 0.8, 0.78), imgPalette(hue * 0.159 + 0.5), 0.18) * dusk;
        col *= 0.4 + 0.75 * sqrt(max(1.0 - across * across, 0.0));
        col *= 0.5 + 0.6 * smoothstep(0.0, 0.5, uv.y);
        // Taper: discard the outer part low down so the column narrows upward.
        if (across > 0.55 + 0.45 * uv.y) discard;
    }
    else
    {
        // A blade: a long taper.  The quad is the bounding box; the blade
        // itself narrows toward the tip and has a rounded root.
        float u = uv.x;                                       // 0 root, 1 tip
        float v = (uv.y - 0.5) * 2.0;                         // -1..1 across the chord
        float width = mix(1.0, 0.16, smoothstep(0.05, 1.0, u));
        if (abs(v) > width) discard;
        col = mix(vec3(0.86, 0.86, 0.83), imgPalette(hue * 0.159 + 0.5), 0.15) * dusk;
        // Curvature shading across the chord, and the leading edge glint.
        col *= 0.45 + 0.7 * sqrt(max(1.0 - (v / max(width, 1e-3)) * (v / max(width, 1e-3)), 0.0));
        col += vec3(1.0, 0.95, 0.9) * smoothstep(0.35, 0.0, abs(v / max(width, 1e-3) - 0.55)) * (0.1 + 0.45 * hi) * dusk;
        // The tip is a little darker (it moves fastest and blurs).
        col *= 1.0 - 0.25 * smoothstep(0.7, 1.0, u);
    }
    // Haze: the far rows stack into the dusk.
    float fog = 1.0 - exp(-max(vWorld.z - 10.0, 0.0) * (0.014 + 0.014 * (1.0 - clamp(audioSwell, 0.0, 1.0))));
    vec3 fogCol = mix(vec3(0.45, 0.5, 0.62), imgPalette(hue * 0.159 + 0.6) * 0.6, 0.4) * dusk;
    col = mix(col, fogCol, clamp(fog, 0.0, 0.9) * step(-1.5, vKind));
    col *= 0.85 + 0.3 * audioLevel;

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
