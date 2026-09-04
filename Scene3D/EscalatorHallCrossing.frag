#version 330 core
out vec4 fragColor;
/**
 * @file EscalatorHallCrossing.frag
 * @brief ESCALATOR HALL CROSSING (fragment): a station hall with crossing
 * escalators.  Steps are ribbed metal treads catching the hall light, the
 * balustrades are glass with the photo behind them, riders are dark
 * silhouettes with a rim, and the advertising panels on the far wall
 * carry the photo lit by chroma classes.  The swell is the hall light,
 * the spectrum runs along the step edges as a comb of colour, the kick
 * lifts the panel backlights (light only).
 *
 * Audio Reactivity:
 *   audioSpectrum[32] -> the lit step edges (light)
 *   audioChroma[12]   -> the advertising panels (light)
 *   audioSwell        -> hall light (slow)
 *   audioKick         -> panel backlight (light)
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
uniform float audioChroma[12];
uniform float audioSwell;
uniform float audioKick;
uniform float audioHigh;
uniform float audioLevel;
uniform float audioChromaHue;
uniform float audioValence;

uniform float flightsP;
uniform float ridersP;
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

float hash11(float n) { return fract(sin(n * 127.1) * 43758.5453); }
float hash21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

void main()
{
    float hue = (hueP > 0.001) ? hueP : 0.0;
    vec2 uv = vTexCoord;
    float light = 0.6 + 0.6 * clamp(audioSwell, 0.0, 1.0);
    float hi = clamp(audioHigh * 2.0, 0.0, 1.0);
    vec3 col;

    if (vKind < -1.5)
    {
        // The floor: polished terrazzo with the hall lights reflected.
        vec2 fuv = clamp(vec2(vWorld.x * 0.03 + 0.5, vWorld.z * 0.02), 0.0, 1.0);
        col = img(fuv) * mix(vec3(0.4, 0.4, 0.42), imgPalette(hue * 0.159 + 0.5), 0.3) * light * 0.7;
        col *= 0.8 + 0.35 * hash21(floor(vec2(vWorld.x * 8.0, vWorld.z * 8.0)));
        // Bands of ceiling light lying across it.
        col += vec3(0.9, 0.92, 1.0) * pow(0.5 + 0.5 * cos(vWorld.z * 1.1), 8.0) * 0.16 * light;
        col *= exp(-max(vWorld.z - 12.0, 0.0) * 0.02);
    }
    else if (vKind < -0.5)
    {
        // The hall wall: pale tiling with the photo faint, lit from above.
        col = mix(vec3(0.5, 0.52, 0.55), img(uv) * 0.6, 0.4) * light;
        float tile = smoothstep(0.02, 0.06, abs(fract(uv.x * 60.0) - 0.5))
                   * smoothstep(0.02, 0.06, abs(fract(uv.y * 34.0) - 0.5));
        col *= 0.72 + 0.4 * tile;
        col *= 0.55 + 0.7 * smoothstep(0.1, 0.75, uv.y);
    }
    else if (vKind > 4.5)
    {
        // An advertising panel: the photo, backlit, tinted by a class.
        int cls = int(mod(vId * 3.0 + 1.0, 12.0));
        float e = clamp(audioChroma[cls] * 1.6, 0.0, 1.0);
        vec3 tint = imgPalette(hue * 0.159 + float(cls) / 12.0) * 1.4 + 0.2;
        col = img(clamp(uv * vec2(0.8, 0.8) + vec2(vId * 0.11, 0.1), 0.0, 1.0)) * mix(vec3(1.0), tint, 0.45);
        col *= 0.6 + 1.1 * e + 0.5 * audioKick;
        // The frame.
        float frame = smoothstep(0.04, 0.02, min(min(uv.x, 1.0 - uv.x), min(uv.y, 1.0 - uv.y)));
        col = mix(vec3(0.12, 0.12, 0.14), col, frame);
    }
    else if (vKind > 3.5)
    {
        // A rider's head: a dark round shape with a rim.
        vec2 d = (uv - 0.5) * 2.0;
        float r = length(d);
        if (r > 1.0) discard;
        col = vec3(0.1, 0.1, 0.12) * light;
        col += vec3(0.8, 0.85, 0.95) * smoothstep(0.9, 1.0, r) * 0.5 * light;
    }
    else if (vKind > 2.5)
    {
        // A rider's body: a dark capsule, its coat colour barely readable.
        float across = abs(uv.x - 0.5) * 2.0;
        if (across > 0.92 - 0.25 * uv.y) discard;
        vec3 coat = mix(vec3(0.12, 0.13, 0.16), imgPalette(hue * 0.159 + hash11(vId) * 0.9) * 0.45, 0.4);
        col = coat * light * (0.45 + 0.55 * (1.0 - across));
        col += vec3(0.75, 0.8, 0.9) * smoothstep(0.75, 0.95, across) * 0.35 * light;
    }
    else if (vKind > 1.5)
    {
        // The handrail: a dark rubber band with a specular line.
        col = vec3(0.1, 0.1, 0.11) * light;
        col += vec3(0.85, 0.88, 0.95) * smoothstep(0.35, 0.0, abs(uv.y - 0.62)) * 0.4 * light;
    }
    else if (vKind > 0.5)
    {
        // Balustrade glass: the hall shows through, tinted green at the edge.
        col = img(clamp(vec2(uv.x * 0.5 + 0.25, uv.y * 0.4 + 0.35), 0.0, 1.0)) * 0.5 * light;
        col = mix(col, col * vec3(0.85, 1.0, 0.92), 0.5);
        col *= 0.35 + 0.4 * uv.y;
        // The polished edge catches the light.
        col += vec3(0.8, 0.95, 0.9) * smoothstep(0.06, 0.0, 1.0 - uv.y) * 0.5 * light;
        col += vec3(0.6, 0.8, 0.75) * smoothstep(0.06, 0.0, uv.y) * 0.2 * light;
    }
    else
    {
        // A step: ribbed aluminium tread, its leading edge picked out in
        // the colour of one spectrum band -- the comb runs up the flight.
        col = mix(vec3(0.45, 0.46, 0.48), img(clamp(uv * 0.3 + 0.4, 0.0, 1.0)) * 0.4, 0.25) * light;
        float rib = 0.5 + 0.5 * cos(uv.y * 62.8318);
        col *= 0.7 + 0.45 * rib;
        col *= 0.6 + 0.5 * smoothstep(0.0, 0.4, uv.x);
        int band = int(clamp(vAux * 31.0, 0.0, 31.0));
        float e = clamp(audioSpectrum[band] * 1.7, 0.0, 1.0);
        vec3 edgeCol = imgPalette(hue * 0.159 + float(band) / 32.0) * 1.5 + 0.15;
        float edge = smoothstep(0.14, 0.0, uv.x);
        col += edgeCol * edge * (0.2 + 1.0 * e);
        col += vec3(1.0) * edge * hi * 0.25;
    }
    // Hall haze with distance.
    float fog = 1.0 - exp(-max(vWorld.z - 9.0, 0.0) * 0.022);
    vec3 fogCol = mix(vec3(0.4, 0.42, 0.48), imgPalette(hue * 0.159 + 0.6) * 0.5, 0.35) * light;
    col = mix(col, fogCol, clamp(fog, 0.0, 0.8) * step(-1.5, vKind));
    col *= 0.85 + 0.3 * audioLevel;

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
