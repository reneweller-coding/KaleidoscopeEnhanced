#version 330 core
out vec4 fragColor;
/**
 * @file NeuralConnectomeGlow.frag
 * @brief Fragment stage for NeuralConnectomeGlow: deep tissue dark with
 * the photo faint, somas as round glowing cells, dendrites as faint
 * fibres, axons carrying spikes -- bright pulses that travel along the
 * fibre on a continuous phase of the scene clock at a rate set by the
 * axon's band energy... no: the rate is fixed, the band energy is the
 * pulse brightness (continuity rule); the kick lights every soma, the
 * swell the tissue.
 *
 * Audio Reactivity: audioSpectrum[32] -> spike brightness per axon;
 *                   audioKick -> soma flash; audioSwell -> tissue light; audioLevel.
 */
in vec2  vTexCoord;
in vec3  vWorld;
in float vKind;
in float vBand;
in float vId;

uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;
uniform float sceneAdvance;
uniform float sceneTime;
uniform float audioSpectrum[32];
uniform float audioKick;
uniform float audioSwell;
uniform float audioLevel;
uniform float audioChromaHue;
uniform float audioAdvance;
uniform float audioValence;
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

float hash11(float n) { return fract(sin(n * 127.1) * 43758.5453); }

void main()
{
    float hue = (hueP > 0.001) ? hueP : 0.0;
    float tissue = 0.7 + 0.6 * clamp(audioSwell, 0.0, 1.0);
    int band = int(clamp(vBand, 0.0, 31.0));
    float e = clamp(audioSpectrum[band] * 1.6, 0.0, 1.0);
    vec3 cellCol = mix(vec3(0.5, 0.8, 1.0), imgPalette(hue * 0.159 + float(band) / 32.0), 0.5);
    vec3 col;
    if (vKind < -0.5)
    {
        vec2 uv = vTexCoord;
        col = img(uv) * imgPalette(hue * 0.159 + 0.6) * 0.25 * tissue + vec3(0.02, 0.02, 0.04);
        fragColor = vec4(col, 1.0);
        return;
    }
    if (vKind < 0.5)
    {
        // Soma: round, glowing, flashing on the kick.
        vec2 d = (vTexCoord - 0.5) * 2.0;
        float r = length(d);
        if (r > 1.0) discard;
        float sh = sqrt(1.0 - r * r);
        col = cellCol * (0.5 + 0.9 * sh) * (1.0 + 0.8 * e) * tissue;
        col += cellCol * exp(-r * r * 3.0) * audioKick * 1.2;
    }
    else if (vKind < 1.5)
    {
        // Dendrite: faint fibre.
        col = cellCol * 0.5 * tissue * (0.7 + 0.6 * e);
    }
    else
    {
        // Axon: the fibre, and the spike travelling along it (uv.x = along).
        float clock = sceneAdvance * 0.8 + sceneTime * 0.2;
        float ph = fract(clock * (0.4 + 0.3 * hash11(vId * 3.3)) + hash11(vId * 5.1));
        float pulse = exp(-pow((vTexCoord.x - ph) * 14.0, 2.0));
        float pulse2 = exp(-pow((vTexCoord.x - fract(ph + 0.5)) * 14.0, 2.0)) * 0.5;
        col = cellCol * 0.55 * tissue + cellCol * (pulse + pulse2) * (0.8 + 1.6 * e) * 2.5;
    }
    float fog = 1.0 - exp(-max(vWorld.z - 6.0, 0.0) * 0.05);
    col = mix(col, vec3(0.01, 0.01, 0.02), clamp(fog, 0.0, 0.7));
    col *= 0.75 + 0.5 * audioLevel;

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
