#version 330 core
out vec4 fragColor;
/**
 * @file NonlinearSchrodingerRogueWave.frag
 * @brief NONLINEAR SCHRÖDINGER ROGUE WAVE: Peregrine breather soliton / oceanic freak monster wave.
 * Non-linear modulational instability (Benjamin-Feir) focuses continuous background wave trains into
 * a sudden triple-height oceanic rogue wave wall with foaming crests and deep abyssal troughs.
 *   audioAdvance -> navigates Peregrine breather non-linear focusing spacetime coordinates
 *   audioKick    -> flashes catastrophic rogue wave breaking crest & foam detonation bursts
 *   audioBass    -> deepens preceding abyssal wave trough hole in the sea & gravitational swell
 *   audioSwell   -> widens rogue wave wall width & background wavepacket envelope
 *   audioCentroid-> shifts stormy ocean water transmission / foam scattering color spectra
 *
 * Per-activation variety:
 *   breatherScaleP float Peregrine soliton spacetime focus scale  (0.8..2.2)
 *   carrierFreqP   float background carrier wave frequency        (6.0..20.0)
 *   crestFoamP     float breaking rogue wave foam luminance gain  (0.8..2.5)
 *   troughDepthP   float abyssal trough hole depth parameter      (0.6..2.2)
 */

uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float audioPhase;
uniform float audioAdvance;
uniform float audioSwell;
uniform float audioLevel;
uniform float audioKick;
uniform float audioCentroid;
uniform float audioValence;
uniform float audioChromaHue;
uniform float audioSubBass;
uniform float audioBass;
uniform float audioMid;
uniform float audioHigh;
uniform float audioFlux;

uniform float breatherScaleP;
uniform float carrierFreqP;
uniform float crestFoamP;
uniform float troughDepthP;

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

vec3 palTint(vec3 c, float t, float k)
{
    vec3 tp = imgPalette(t);
    tp *= dot(c, vec3(0.3333)) / max(dot(tp, vec3(0.3333)), 1e-3);
    return mix(c, tp, k);
}

void main()
{
    vec2 uv = (gl_FragCoord.xy - 0.5 * resolution) / min(resolution.x, resolution.y);
    float t = time * 0.4 + audioAdvance * 0.35;

    // Spacetime coordinates around Peregrine breather focusing center (X, T)
    float bScale = (breatherScaleP > 0.01 ? breatherScaleP : 1.2);
    // SIDE VIEW: the old build painted |Psi| as a full-screen heat-map,
    // which recorded as horizontal stripes.  Here the breather drives the
    // SURFACE ELEVATION of a sea seen from the side, so the focusing event
    // rises out of the carrier swell as an actual wall of water.
    // Die Monsterwelle WANDERT durchs Bild (Dreieckssweep, stetig) -- vorher
    // stand der Breather-Peak fest in der Mitte und zuckte nur.
    float xDrift = (abs(fract(t * 0.05) * 2.0 - 1.0) * 2.0 - 1.0) * 1.1;
    float X = (uv.x - xDrift) * 3.5 * bScale;
    // The breather's focusing parameter T cycles slowly: the rogue wall
    // builds, towers and vanishes back into the swell (once per ~14 s).
    float Tb = sin(t * 0.45) * 2.2;
    float denom = 1.0 + 4.0 * (X * X) + 4.0 * (Tb * Tb);
    float realPart = 1.0 - 4.0 / denom;
    float imagPart = -8.0 * Tb / denom;
    float envelope = sqrt(realPart * realPart + imagPart * imagPart);

    float kCarrier = (carrierFreqP > 0.01 ? carrierFreqP : 12.0);
    float carrier = cos(X * kCarrier * 0.55 - t * 2.2 + audioPhase * 0.5);

    // Surface elevation in frame units; envelope peaks at 3x the carrier.
    float h = envelope * carrier * 0.16 * (0.85 + 0.35 * audioSwell);
    float surfaceY = -0.04 + h;
    float below = surfaceY - uv.y;          // > 0 means under water

    float trough = smoothstep(-0.5, -1.8, h * 9.0)
                 * (troughDepthP > 0.01 ? troughDepthP : 1.2) * (1.0 + 0.4 * audioBass);

    // Foam rides the crest line, detonating where the envelope focuses.
    float crestFoam = exp(-abs(below) * 38.0)
                    * (0.35 + 0.65 * smoothstep(1.4, 2.8, envelope * abs(carrier) + envelope));
    crestFoam *= (1.0 + 3.5 * audioKick) * (crestFoamP > 0.01 ? crestFoamP : 1.3);

    vec3 deepTrough = vec3(0.01, 0.05, 0.12);
    vec3 oceanBlue  = vec3(0.12, 0.60, 0.95);
    vec3 foamWhite  = vec3(0.92, 0.96, 1.0);

    float depth = clamp(below * 0.8, 0.0, 1.0);
    vec3 waterCol = palTint(mix(oceanBlue, deepTrough, depth),
                            depth * 0.25 + 0.05, 0.25);

    // Storm sky above the surface: dark photo clouds.
    vec2 bgUv = gl_FragCoord.xy / resolution;
    vec3 sky = img(bgUv) * mix(0.60, 0.16, clamp(uv.y * 1.6 + 0.4, 0.0, 1.0));

    float inWater = smoothstep(-0.004, 0.004, below);
    vec3 col = mix(sky, waterCol, inWater);
    // Subsurface glow: the water carried no light of its own and the sea
    // read as a black field under an oscilloscope trace.
    col += oceanBlue * exp(-max(below, 0.0) * 2.6) * 0.55 * inWater;
    // Secondary swell ripples give the surface a body below the crest line.
    col += waterCol * (0.5 + 0.5 * sin(X * kCarrier * 1.1 + below * 30.0 - t * 2.0))
         * 0.10 * inWater;
    col += foamWhite * crestFoam * 1.9;
    col -= deepTrough * trough * 0.6 * inWater;
    col += foamWhite * (audioKick * 0.35);

    // Soft knee compression
    col /= 1.0 + 0.35 * max(col.r, max(col.g, col.b));
    fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
