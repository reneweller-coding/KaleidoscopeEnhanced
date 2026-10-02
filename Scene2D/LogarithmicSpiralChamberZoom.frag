#version 330 core
out vec4 fragColor;   ///< The pixel's colour (output).
/**
 * @file LogarithmicSpiralChamberZoom.frag
 * @brief LOGARITHMIC SPIRAL CHAMBER ZOOM: Infinite scale plunge into the golden-ratio
 * chambers of a logarithmic spiral (Nautilus shell). Iridescent mother-of-pearl (nacre)
 * septum walls, seamless octave zoom transitions, and glowing spiral vortex currents.
 *
 * Audio Reactivity:
 *   audioAdvance -> drives continuous exponential spiral chamber plunge
 *   audioKick    -> flashes nacre chamber septum walls & explodes vortex core
 *   audioCentroid-> sharpens spiral growth rate b & fine chamber ribbing
 *   audioSubBass -> expands spiral chamber width breathing
 *   audioChromaHue-> steers the iridescent mother-of-pearl (nacre) spectrum
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
uniform float audioSubBass;   ///< Sub-bass band level, 0..1.
uniform float audioBass;   ///< Bass band level, 0..1.
uniform float audioMid;   ///< Mid band level, 0..1.
uniform float audioHigh;   ///< High band level, 0..1.
uniform float audioFlux;   ///< Spectral flux (how fast the spectrum changes), 0..1.
uniform float audioChromaHue;   ///< Hue of the dominant pitch class (radians, unwrapped: continuous).

// Per-activation variety
uniform float speedP;   ///< Speed knob, 0..1.
uniform float spiralGrowthP;
uniform float chambersP;
uniform float glowP;   ///< Glow / afterglow knob, 0..1.
uniform float hueP;   ///< Hue knob (radians), usually the music's chroma hue plus a rolled offset.

/// @brief The photo at a coordinate: the cross-fade of tex0 and tex1.
vec3 img(vec2 uv) {
    return (interpolation * texture(tex0, uv) + (1.0 - interpolation) * texture(tex1, uv)).rgb;
}

/// @brief The house palette: a colour of the photo on an arc that turns with the music's hue.
vec3 imgPalette(float t) {
    float ang = audioChromaHue + audioAdvance * 0.04 + t * 6.2831853 + hueP;
    float rad = 0.16 + 0.08 * sin(audioAdvance * 0.013);
    vec3  pc  = img(clamp(vec2(0.5) + rad * vec2(cos(ang), sin(ang)), 0.0, 1.0));
    float pg  = dot(pc, vec3(0.333));
    return mix(vec3(pg), pc, 0.55 + 0.45 * audioValence);
}

/// @brief Entry point of this shader stage (the file description says what it draws).
void main() {
    vec2 uv = (gl_FragCoord.xy - 0.5 * resolution.xy) / min(resolution.x, resolution.y);

    float spd = (speedP > 0.01) ? speedP : 1.0;
    float sGrowth = (spiralGrowthP > 0.01) ? spiralGrowthP : 0.306349; // Golden ratio growth: ln(phi)/(pi/2)
    float nChamb = (chambersP > 1.0) ? chambersP : 8.0;
    float glw = (glowP > 0.01) ? glowP : 1.0;

    float t = time * 0.210 * spd + audioAdvance * 0.210 * spd;
    // Zeit-Basis + Musik-Schub: audioAdvance ALLEIN steht bei ruhiger
    // Musik still (die gemeldete "wirkt wie ein Bild"-Klasse).

    float r = max(1e-5, length(uv));
    // Branch cut rotated to the BOTTOM half-axis (was centre-left); see
    // InfinitePsychedelicDrosteVortex for why it cannot be removed outright.
    float a = atan(-uv.x, uv.y);

    // Log-polar spiral coordinate: theta_spiral = a - ln(r)/b
    float thetaSpiral = a - (log(r) / sGrowth);

    // Chamber phase along the logarithmic spiral. Sub-bass thins the chamber
    // count, i.e. widens each chamber. The t*2.0 plunge is added afterwards at
    // a FIXED rate rather than riding inside thetaSpiral: multiplied by an
    // audio-varying chamber factor it would remap the whole accumulated spiral
    // phase in one frame.
    float chamberW = nChamb / (1.0 + 0.3 * audioSubBass);
    float chamberIndex = thetaSpiral * (chamberW / 6.2831853) + t * 2.0 * (nChamb / 6.2831853);
    float chamberFrac = fract(chamberIndex);

    // Distance to chamber septum wall
    float dSeptum = abs(chamberFrac - 0.5);
    float septumGlow = smoothstep(0.42, 0.5, dSeptum) * glw;

    // Mother-of-pearl (nacre) thin-film iridescence
    float nacrePhase = log(r) * 4.0 + a * 2.0 + t * 0.5;
    vec3 nacreRainbow = vec3(
        sin(nacrePhase),
        sin(nacrePhase + 2.094),
        sin(nacrePhase + 4.188)
    ) * 0.5 + 0.5;

    // Sample distorted background photo
    vec2 sampleUV = fract(vec2(chamberFrac, a / 6.2831853 + 0.5));
    vec3 texCol = img(sampleUV);

    // Golden spiral palette
    vec3 palA = imgPalette(floor(chamberIndex) * 0.15 + t * 0.05);
    vec3 palB = imgPalette(floor(chamberIndex) * 0.15 + 0.5);
    vec3 baseCol = mix(palA, palB, chamberFrac);

    baseCol = mix(baseCol, texCol, 0.35 + 0.15 * audioValence);

    // Add glowing septum walls & iridescent nacre highlights
    vec3 septumTint = vec3(1.5, 1.3, 1.7) * septumGlow * (1.0 + 2.5 * audioKick);
    vec3 nacreTint = nacreRainbow * 0.35 * (0.8 + 0.6 * audioCentroid);

    vec3 finalCol = baseCol + septumTint + nacreTint;

    // Center spiral origin singularity bloom
    float centerBloom = exp(-r * 8.0) * (1.2 + 2.5 * audioKick);
    finalCol += imgPalette(0.85) * centerBloom;

    finalCol = pow(finalCol, vec3(0.88));
    fragColor = vec4(clamp(finalCol, 0.0, 1.0), 1.0);
}
