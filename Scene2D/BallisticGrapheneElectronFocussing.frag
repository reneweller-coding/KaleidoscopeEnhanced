#version 330 core
out vec4 fragColor;   ///< The pixel's colour (output).
/**
 * @file BallisticGrapheneElectronFocussing.frag
 * @brief BALLISTIC GRAPHENE ELECTRON FOCUSSING: Veselago electron-optic lens in monolayer graphene.
 * Relativistic Dirac electrons undergo negative refraction at p-n junction interfaces, forming
 * caustic cusp focal points, Klein tunneling fringes, and quantum interference lattices.
 *   audioAdvance -> steers ballistic electron trajectory wavefronts across p-n interface
 *   audioKick    -> flashes Klein tunneling transmission focal hot-spot peaks
 *   audioSwell   -> widens electron beam caustic cusp sharpness & focal brightness
 *   audioCentroid-> shifts Fermi energy Dirac cone transition spectra
 *   audioSnare   -> triggers quantum reflection interference fringe pulses
 *
 * Per-activation variety:
 *   junctionAngleP float p-n interface tilt & curvature         (0.4..1.8)
 *   focalDistP     float Veselago electron focal length          (0.3..1.2)
 *   kleinFringeP   float Klein tunneling interference density    (8.0..24.0)
 *   causticGlowP   float caustic cusp focal luminance            (0.8..2.5)
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
uniform float audioSnare;   ///< Snare envelope, 0..1.
uniform float audioFlux;   ///< Spectral flux (how fast the spectrum changes), 0..1.

uniform float junctionAngleP;
uniform float focalDistP;
uniform float kleinFringeP;
uniform float causticGlowP;

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
    
    // p-n junction boundary (at y = 0 with curvature)
    float jCurv = (junctionAngleP > 0.01 ? junctionAngleP : 1.0);
    float pnInterface = uv.y - sin(uv.x * 3.0 + t * 0.5) * 0.08 * jCurv;
    
    // Electron point source in p-region (y < 0)
    float fDist = (focalDistP > 0.01 ? focalDistP : 0.6);
    vec2 sourcePos = vec2(sin(t * 0.8) * 0.3, -fDist);
    
    // Symmetric Veselago focus in n-region (y > 0)
    vec2 focalPos = vec2(sourcePos.x, fDist);
    
    // Caustic cusp curves (equations of electron trajectories undergoing negative refraction: n = -1)
    float distSource = length(uv - sourcePos);
    float distFocus  = length(uv - focalPos);
    
    // Veselago negative refraction caustic cusp profile: (x - x0)^2 ~ y^3
    float dx = uv.x - focalPos.x;
    float dy = max(0.0, uv.y - 0.1);
    float causticCusp = exp(-abs(dx * dx * 12.0 - dy * dy * dy * 18.0) * 15.0) * smoothstep(0.0, 0.1, uv.y);
    
    // Klein tunneling interference fringes at p-n junction
    float fringeFreq = (kleinFringeP > 0.01 ? kleinFringeP : 16.0);
    float kleinFringes = sin((distSource + distFocus) * fringeFreq - t * 4.0 + audioPhase);
    kleinFringes *= exp(-abs(pnInterface) * 3.0) * (0.6 + 0.8 * audioSnare);
    
    // Focal point hot spot
    float focalGlow = exp(-distFocus * 16.0) * (1.0 + 4.0 * audioKick) * (causticGlowP > 0.01 ? causticGlowP : 1.4);
    
    // p-n interface boundary line
    float junctionLine = exp(-abs(pnInterface) * 35.0);
    
    // Palette assignment
    float palAngle = fract((distSource - distFocus) * 0.4 + t * 0.05 + audioCentroid);
    vec3 colElectron = imgPalette(palAngle);
    vec3 colCaustic  = imgPalette(fract(palAngle + 0.5)) * 2.2;
    
    // Background photo sampling
    vec2 bgUv = gl_FragCoord.xy / resolution;
    vec3 bg = img(bgUv) * 0.25;
    
    vec3 col = bg;
    col += colElectron * (exp(-distSource * 3.0) + exp(-distFocus * 3.0)) * (0.8 + 0.4 * audioSwell);
    col += colCaustic * causticCusp * 1.8;
    col += colElectron * abs(kleinFringes) * 1.2;
    col += vec3(0.9, 0.95, 1.0) * focalGlow * 2.5;
    col += vec3(0.7, 0.9, 1.0) * junctionLine * 1.5;
    col += colElectron * (audioKick * 0.35);
    
    // Soft knee compression
    col /= 1.0 + 0.35 * max(col.r, max(col.g, col.b));
    fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
