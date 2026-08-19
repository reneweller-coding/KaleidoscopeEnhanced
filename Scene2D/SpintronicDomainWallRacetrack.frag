#version 330 core
out vec4 fragColor;
/**
 * @file SpintronicDomainWallRacetrack.frag
 * @brief SPINTRONIC DOMAIN WALL RACETRACK: Nanowire racetrack memory array.
 * Topologically protected chiral magnetic domain walls driven by spin-transfer torque
 * pulses race across parallel tracks with magnetoresistive fringes and spin-wave ripples.
 *   audioAdvance -> drives spin-polarized electrical current & domain wall drift
 *   audioKick    -> flashes Barkhausen depinning transitions and magnetic pulses
 *   audioSwell   -> widens magnetic track cross-section & domain wall luminescence
 *   audioCentroid-> shifts anisotropic magnetoresistance color spectra
 *   audioHigh    -> excites high-frequency magnon spin-wave ripple fringes
 *
 * Per-activation variety:
 *   trackPitchP float nanowire track packing density         (2.0..6.0)
 *   wallWidthP  float domain wall transition thickness       (0.4..1.8)
 *   magnonP     float spin-wave magnon ripple frequency      (8.0..24.0)
 *   torqueP     float spin-transfer torque drift velocity    (0.5..2.2)
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

uniform float trackPitchP;
uniform float wallWidthP;
uniform float magnonP;
uniform float torqueP;

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

void main()
{
    vec2 uv = (gl_FragCoord.xy - 0.5 * resolution) / min(resolution.x, resolution.y);
    float t = time * 0.4 + audioAdvance * 0.35;
    
    // Parallel nanowire racetrack tracks
    float pitch = (trackPitchP > 0.01 ? trackPitchP : 4.0);
    float trackId = floor(uv.y * pitch);
    float localY = fract(uv.y * pitch) - 0.5;
    
    // Spin-transfer torque drift along track (alternating direction per track)
    float dir = mod(trackId, 2.0) == 0.0 ? 1.0 : -1.0;
    float vDrift = (torqueP > 0.01 ? torqueP : 1.2) * dir;
    float trackX = uv.x + t * vDrift * 0.35 + trackId * 0.25;
    
    // Chiral domain wall magnetization pattern M_z(x) = tanh((x - x_0) / Delta)
    float wallWidth = (wallWidthP > 0.01 ? wallWidthP : 1.0);
    float domainPhase = trackX * 3.5;
    float mz = sin(domainPhase);
    
    // Domain wall location (where mz crosses 0)
    float wallDist = abs(fract(domainPhase / 3.14159265 + 0.5) - 0.5) * 3.14159265;
    float wallGlow = exp(-wallDist * 8.0 / max(wallWidth, 0.1)) * (1.0 + 3.0 * audioKick);
    
    // Magnon spin-wave ripples emitted from moving domain walls
    float magnonFreq = (magnonP > 0.01 ? magnonP : 16.0);
    float spinWaves = sin(trackX * magnonFreq - t * 4.0 + audioPhase) * 0.5 + 0.5;
    spinWaves *= (0.6 + 0.8 * audioHigh);
    
    // Nanowire track boundary mask
    float inTrack = smoothstep(0.46, 0.38, abs(localY));
    float trackEdge = exp(-abs(abs(localY) - 0.42) * 25.0);
    
    // Palette assignment from photo arc
    float palAngle = fract(domainPhase * 0.159 + trackId * 0.08 + audioCentroid);
    vec3 colDomain = imgPalette(palAngle);
    vec3 colWall   = imgPalette(fract(palAngle + 0.5)) * 2.2;
    vec3 colWave   = imgPalette(fract(trackX * 0.2 + 0.33));
    
    // Sample background photo
    vec2 bgUv = gl_FragCoord.xy / resolution;
    vec3 bg = img(bgUv) * 0.25;
    
    vec3 col = bg;
    col += colDomain * inTrack * (0.65 + 0.35 * mz) * (0.8 + 0.4 * audioSwell);
    col += colWall * inTrack * wallGlow;
    col += colWave * inTrack * spinWaves * 0.8;
    col += vec3(0.9, 0.95, 1.0) * trackEdge * 1.5;
    col += colWall * (audioKick * 0.35);
    
    // Soft knee compression
    col /= 1.0 + 0.35 * max(col.r, max(col.g, col.b));
    fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
