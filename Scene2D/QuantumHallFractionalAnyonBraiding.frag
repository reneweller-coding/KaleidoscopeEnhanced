#version 330 core
out vec4 fragColor;   ///< The pixel's colour (output).
/**
 * @file QuantumHallFractionalAnyonBraiding.frag
 * @brief QUANTUM HALL FRACTIONAL ANYON BRAIDING: 2D fractional quantum Hall liquid near filling
 * factor nu = 5/2. Non-Abelian Moore-Read Ising anyons orbit lithographic antidot islands,
 * braiding fractional statistics worldlines with Berry phase quantum interference ribbons.
 *   audioAdvance -> drives anyon orbital trajectory circulation & Berry phase accumulation
 *   audioKick    -> flashes non-Abelian topological state fusion & interference fringe shifts
 *   audioSwell   -> widens fractional incompressible quantum Hall liquid gap luminance
 *   audioCentroid-> shifts non-Abelian anyon quantum phase color spectra
 *   audioPhase   -> modulates fractional charge e/4 Aharonov-Bohm flux modulation
 *
 * Per-activation variety:
 *   antidotCountP float number of antidot island braiding centers  (2.0..6.0)
 *   anyonOrbitP   float anyon orbital radius scale               (0.4..1.8)
 *   berryGlowP    float Berry phase interference fringe luminance(0.8..2.5)
 *   fractionalP   float fractional quasiparticle charge parameter (0.5..2.2)
 */

uniform vec2  resolution;   ///< Size of the render target in pixels.
uniform float time;   ///< Seconds since the program started (never reset; see sceneTime).
uniform sampler2D tex0;   ///< The current photo.
uniform sampler2D tex1;   ///< The next photo (cross-faded in by interpolation).
uniform float interpolation;   ///< Cross-fade between the photos: 1 = tex0, 0 = tex1.

uniform float audioPhase;   ///< Rotation phase driven by the music (integrated, never jumps).
uniform float audioAdvance;   ///< The music's advance: integrated tempo-weighted energy (never jumps, never runs backwards).
uniform float audioSwell;   ///< Slow loudness envelope, 0..1 (seconds).
uniform float audioLevel;   ///< Overall loudness, 0..1.
uniform float audioKick;   ///< Kick-drum envelope, 0..1 (fast attack, short decay).
uniform float audioCentroid;   ///< Spectral centroid (brightness of the sound), 0..1.
uniform float audioValence;   ///< Mood valence: 0 dark .. 1 bright.
uniform float audioChromaHue;   ///< Hue of the dominant pitch class (radians, unwrapped: continuous).
uniform float audioSubBass;   ///< Sub-bass band level, 0..1.
uniform float audioBass;   ///< Bass band level, 0..1.
uniform float audioMid;   ///< Mid band level, 0..1.
uniform float audioHigh;   ///< High band level, 0..1.
uniform float audioFlux;   ///< Spectral flux (how fast the spectrum changes), 0..1.

uniform float antidotCountP;
uniform float anyonOrbitP;
uniform float berryGlowP;
uniform float fractionalP;

/// @brief The photo at a coordinate: the cross-fade of tex0 and tex1.
vec3 img(vec2 uv) {
    return (interpolation * texture(tex0, uv) + (1.0 - interpolation) * texture(tex1, uv)).rgb;
}

/// @brief The house palette: a colour of the photo on an arc that turns with the music's hue.
vec3 imgPalette(float t)
{
    float ang = audioChromaHue + audioAdvance * 0.04 + t * 6.2831853;
    float rad = 0.16 + 0.08 * sin(audioAdvance * 0.013);
    vec3  col = img(clamp(vec2(0.5) + rad * vec2(cos(ang), sin(ang)), 0.0, 1.0));
    float g   = dot(col, vec3(0.333));
    return mix(vec3(g), col, 0.55 + 0.45 * audioValence);
}

/// @brief Entry point of this shader stage (the file description says what it draws).
void main()
{
    vec2 uv = (gl_FragCoord.xy - 0.5 * resolution) / min(resolution.x, resolution.y);
    float t = time * 0.4 + audioAdvance * 0.35;
    
    float nAntidots = (antidotCountP > 1.0 ? antidotCountP : 3.0);
    float rOrbit = (anyonOrbitP > 0.01 ? anyonOrbitP : 1.0) * (0.35 + 0.1 * audioSwell);
    
    float totalAnyonGlow = 0.0;
    float berryPhase = audioPhase * 0.5;
    
    // Simulate non-Abelian anyon orbits around multiple antidots
    for (float i = 0.0; i < 4.0; i += 1.0) {
        if (i >= nAntidots) break;
        
        float ang = i * (6.2831853 / nAntidots);
        vec2 antidotCenter = vec2(cos(ang), sin(ang)) * 0.5;
        
        // Anyons orbiting each antidot
        float orbitAngle = t * 2.5 * (mod(i, 2.0) == 0.0 ? 1.0 : -1.0) + i * 1.57;
        vec2 anyonPos = antidotCenter + vec2(cos(orbitAngle), sin(orbitAngle)) * rOrbit;
        
        float dAnyon = length(uv - anyonPos);
        float anyonCore = exp(-dAnyon * dAnyon * 55.0);
        totalAnyonGlow += anyonCore;
        
        // Accumulate Berry phase: theta = sum (q_j * phi_j)
        vec2 diff = uv - anyonPos;
        berryPhase += atan(diff.y, diff.x) * 0.25; // fractional charge e/4
    }
    
    // Quantum Hall interference fringes (Fabry-Perot anyon interferometer)
    float fringeFreq = 24.0 * (fractionalP > 0.01 ? fractionalP : 1.0);
    float berryFringes = sin(length(uv) * fringeFreq + berryPhase) * 0.5 + 0.5;
    
    // Non-Abelian state fusion flash on kick
    float fusionFlash = totalAnyonGlow * (1.0 + 4.0 * audioKick) * (berryGlowP > 0.01 ? berryGlowP : 1.3);
    
    // Incompressible quantum liquid background
    float bulkLiquid = smoothstep(0.9, 0.2, length(uv));
    
    // Palette assignment
    float palAngle = fract(berryPhase * 0.159 + length(uv) * 0.25 + audioCentroid);
    vec3 colAnyon = imgPalette(palAngle);
    vec3 colBerry = imgPalette(fract(palAngle + 0.5)) * 1.8;
    
    // Background photo sampling
    vec2 bgUv = gl_FragCoord.xy / resolution;
    vec3 bg = img(bgUv) * 0.25;
    
    vec3 col = bg;
    col += colBerry * bulkLiquid * berryFringes * (0.8 + 0.4 * audioSwell);
    col += colAnyon * totalAnyonGlow * 2.2;
    col += vec3(0.95, 0.95, 1.0) * fusionFlash * 2.0;
    col += colAnyon * (audioKick * 0.35);
    
    // Soft knee compression
    col /= 1.0 + 0.35 * max(col.r, max(col.g, col.b));
    fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
