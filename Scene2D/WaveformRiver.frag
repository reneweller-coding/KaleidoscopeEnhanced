#version 330 core
out vec4 fragColor;
/**
 * @file WaveformRiver.frag
 * @brief WAVEFORM RIVER: the oscilloscope as geography.  A river winds
 * through a night landscape; the camera flies down it on the music's pace.
 * The water surface IS the waveform -- audioWave[64] laid along the river as
 * ripples of light, so the wave you hear is the water you fly over -- and
 * the melody sets the river's width and the colour it glows: a rising line
 * widens the river and warms it, a bass-heavy passage floods the banks.
 * The landscape is a fixed height field (nothing runs away), the river a
 * continuous meander cut into it.
 *
 * Audio Reactivity:
 *   audioWave[64]    -> ripples on the water (the whole point)
 *   audioMelodyPitch -> glow hue of the water
 *   audioSwell       -> river width and water level (slow)
 *   audioBass        -> glow of the water
 *   sceneAdvance     -> flight down the river (music-paced)
 *   audioKick        -> the water flashes
 *   audioSwell       -> sky brightness
 *
 * Per-activation variety: bendP (meander amplitude), heightP (relief), hueP.
 */
uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float sceneAdvance;
uniform float sceneTime;
uniform float audioAdvance;
uniform float audioWave[64];
uniform float audioMelodyPitch;
uniform float audioBass;
uniform float audioKick;
uniform float audioLevel;
uniform float audioSwell;
uniform float audioChromaHue;
uniform float audioValence;

uniform float bendP;
uniform float heightP;
uniform float hueP;

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
float noise2(vec2 p)
{
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x),
               mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), f.x), f.y);
}
float fbm(vec2 p)
{
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 4; ++i) { v += a * noise2(p); p = p * 2.03 + 11.0; a *= 0.5; }
    return v;
}

// The river's course: a smooth meander, fixed geography.
float course(float z, float bend)
{
    return bend * (sin(z * 0.21) * 1.4 + sin(z * 0.053 + 1.7) * 2.6 + sin(z * 0.37 + 0.4) * 0.5);
}

// Terrain height; the river valley is cut into it.
float terrain(vec2 xz, float bend, float relief, float width)
{
    float h = relief * (0.9 * fbm(xz * 0.35) + 0.25 * fbm(xz * 1.4)) - 0.2;
    float d = abs(xz.x - course(xz.y, bend));
    h -= 0.9 * exp(-d * d / (width * width));
    return h;
}

void main()
{
    float aspect = resolution.x / resolution.y;
    vec2 p = (gl_FragCoord.xy / resolution - 0.5) * vec2(aspect, 1.0);

    float bend   = (bendP > 0.05) ? bendP : 1.0;
    float relief = (heightP > 0.05) ? heightP : 1.0;
    float hue    = (hueP > 0.001) ? hueP : 0.0;
    float mel    = clamp(audioMelodyPitch, 0.0, 1.0);
    // Geometry only on the slow swell (V7d): the river widens and floods on
    // builds; the melody and the bass are colour and light.
    float sw     = clamp(audioSwell, 0.0, 1.0);
    float width  = 1.3 + 0.9 * sw;
    float water  = -0.35 + 0.28 * sw;

    // Camera flies down the river, a little above it, looking ahead and down.
    float travel = sceneAdvance * 1.3 + sceneTime * 0.35;
    vec3 cam = vec3(course(travel, bend), 0.75, travel);
    // Bank on the coming bend so the flight leans into the curve.
    float lean = (course(travel + 4.0, bend) - course(travel, bend)) * 0.12;
    vec3 dir = normalize(vec3(p.x + lean, p.y - 0.28, 1.25));

    // Height-field march.
    float t = 0.1, hitT = -1.0; vec3 pos = cam;
    for (int i = 0; i < 64; ++i)
    {
        pos = cam + dir * t;
        float h = max(terrain(pos.xz, bend, relief, width), water);
        float dh = pos.y - h;
        if (dh < 0.01 * t) { hitT = t; break; }
        t += max(dh * 0.6, 0.02);
        if (t > 60.0) break;
    }

    vec3 col;
    vec3 sky = imgPalette(hue * 0.159 + 0.55) * (0.25 + 0.4 * audioSwell);
    if (hitT < 0.0)
    {
        // Sky: a dark gradient with the palette, a photo haze near the horizon.
        float hz = smoothstep(-0.05, 0.35, dir.y);
        col = mix(sky * 1.4, sky * 0.2, hz);
        col += img(vec2(fract(dir.x * 0.5 + 0.5), clamp(dir.y * 2.0 + 0.2, 0.0, 1.0))) * 0.08 * (1.0 - hz);
    }
    else
    {
        float land = terrain(pos.xz, bend, relief, width);
        bool isWater = land < water + 0.005;
        if (isWater)
        {
            // The waveform along the river: the 64 samples laid over ~18
            // units ahead, brightness only -- the geometry stays still.
            float u = clamp((pos.z - cam.z) / 18.0, 0.0, 0.999);
            // Three neighbouring samples averaged: the waveform as a texture
            // of light, not a strobe.
            int wi = int(u * 63.0);
            float w = (audioWave[max(wi - 1, 0)] + audioWave[wi] + audioWave[min(wi + 1, 63)]) / 3.0;
            float ripple = 0.5 + 0.5 * sin(pos.z * 9.0 + pos.x * 3.0 - sceneTime * 4.0);
            vec3 waterCol = imgPalette(hue * 0.159 + 0.15 + 0.35 * mel);
            float depthShade = clamp((water - land) * 2.5, 0.0, 1.0);
            col = sky * 0.6 + waterCol * (0.45 + 0.6 * abs(w) + 0.35 * ripple) * (0.5 + 0.5 * depthShade);
            col += waterCol * (audioKick * 0.6 + audioBass * 0.3);
            // Reflection of the photo, streaked.
            col += img(vec2(fract(pos.x * 0.15 + 0.5), fract(pos.z * 0.05))) * 0.15;
        }
        else
        {
            // Land: dark banks lit from the river, ridges catching the sky.
            float d = abs(pos.x - course(pos.z, bend));
            float e = 0.02;
            vec3 nrm = normalize(vec3(terrain(pos.xz - vec2(e, 0.0), bend, relief, width) - terrain(pos.xz + vec2(e, 0.0), bend, relief, width), 2.0 * e,
                                      terrain(pos.xz - vec2(0.0, e), bend, relief, width) - terrain(pos.xz + vec2(0.0, e), bend, relief, width)));
            float skyLit = clamp(nrm.y, 0.0, 1.0);
            vec3 ground = imgPalette(hue * 0.159 + 0.85) * 0.5;
            col = ground * (0.08 + 0.35 * skyLit) * (0.6 + 0.6 * audioLevel);
            col += imgPalette(hue * 0.159 + 0.15 + 0.35 * mel) * exp(-d * 0.8) * (0.25 + 0.6 * audioLevel);   // river light on the banks
            col += img(vec2(fract(pos.x * 0.1), fract(pos.z * 0.1))) * 0.05 * skyLit;
        }
        float fog = 1.0 - exp(-hitT * 0.045);
        col = mix(col, sky * 0.35, clamp(fog, 0.0, 0.95));
    }

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
