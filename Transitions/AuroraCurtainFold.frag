#version 330 core
out vec4 fragColor;   ///< The pixel's colour (output).
/**
 * @file AuroraCurtainFold.frag
 * @brief TRANSITION AURORA CURTAIN FOLD: Geomagnetic auroral curtain fold wipe transition.
 * Luminous curtains of emerald-green and violet polar light ripple across
 * geomagnetic field lines, folding and weaving the dual scenes together.
 *   interpolation -> sweeps auroral curtain wave front across the sky
 *   audioKick     -> flashes intense substorm auroral rays
 *   audioSwell    -> undulates geomagnetic curtain folding frequency
 *
 * Per-activation variety:
 *   curtainP float auroral curtain fold depth & width (0.5..2.2)
 *   rayP     float vertical ray emission density     (0.5..2.0)
 *   speedP   float animation speed multiplier        (0.5..2.0)
 *   hueP     float auroral emission hue offset       (0..6.28)
 */

uniform vec2  resolution;   ///< Size of the render target in pixels.
uniform float time;   ///< Seconds since the program started (never reset; see sceneTime).
uniform sampler2D tex0;   ///< The current photo.
uniform sampler2D tex1;   ///< The next photo (cross-faded in by interpolation).
uniform float interpolation;   ///< Cross-fade between the photos: 1 = tex0, 0 = tex1.

uniform float audioPhase;   ///< Rotation phase driven by the music (integrated, never jumps).
uniform float audioAdvance;   ///< The music's advance: integrated tempo-weighted energy (never jumps, never runs backwards).
uniform float audioSwell;   ///< slow loudness swell: the only envelope allowed to shape geometry
uniform float audioKick;   ///< Kick-drum envelope, 0..1 (fast attack, short decay).
uniform float audioCentroid;   ///< Spectral centroid (brightness of the sound), 0..1.
uniform float audioValence;   ///< Mood valence: 0 dark .. 1 bright.
uniform float audioSubBass;   ///< Sub-bass band level, 0..1.
uniform float audioBass;   ///< Bass band level, 0..1.
uniform float audioMid;   ///< Mid band level, 0..1.
uniform float audioHigh;   ///< High band level, 0..1.
uniform float audioFlux;   ///< Spectral flux (how fast the spectrum changes), 0..1.
uniform float audioChromaHue;   ///< Hue of the dominant pitch class (radians, unwrapped: continuous).

uniform float curtainP;
uniform float rayP;
uniform float speedP;   ///< Speed knob, 0..1.
uniform float hueP;   ///< Hue knob (radians), usually the music's chroma hue plus a rolled offset.

/// @brief Rotates a colour's hue by an angle (about the grey axis).
vec3 hueRot(vec3 c, float a) {
    vec3 k = vec3(0.57735026919);
    float cs = cos(a), sn = sin(a);
    return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
}

/// @brief Entry point of this shader stage (the file description says what it draws).
void main() {
    float crt = (curtainP > 0.0) ? curtainP : 1.0;
    float ray = (rayP     > 0.0) ? rayP     : 1.0;
    float spd = (speedP   > 0.0) ? speedP   : 1.0;
    float hue = (hueP     > 0.0) ? hueP     : 0.0;

    vec2 uv = gl_FragCoord.xy / resolution.xy;
    vec2 p = (gl_FragCoord.xy - 0.5 * resolution) / resolution.y;

    float t = time * 0.1248 * spd;   // clock rate measured down to about 1.2/255 of change per frame (PresetEditor --transprofile); it spun many times that and read as frantic
    float tProg = clamp(interpolation, 0.0, 1.0);
    float midTransition = sin(tProg * 3.14159265);

    // Auroral curtain folds across the frame
    float curtainFold = sin(p.x * 6.0 * crt + t * 2.0) * 0.15 + sin(p.x * 14.0 * crt - t * 3.0) * 0.05;
    float curtainY = p.y - curtainFold;

    // Vertical auroral rays
    float rays = pow(sin(p.x * 40.0 * ray + t * 4.0) * 0.5 + 0.5, 4.0);

    // Sweep front
    float sweepFront = mix(-1.2, 1.2, tProg);
    float distToFront = p.x - sweepFront;

    // Atmospheric refraction displacement
    vec2 auroraDisp = vec2(curtainFold, rays) * 0.03 * midTransition * (1.0 + audioSwell * 0.6);

    vec4 c1 = texture(tex1, fract(uv + auroraDisp));
    vec4 c0 = texture(tex0, fract(uv - auroraDisp));

    float wipeMask = smoothstep(-0.05, 0.05, distToFront);
    vec4 col = mix(c0, c1, wipeMask);

    // Emerald oxygen (557.7 nm) & violet nitrogen (427.8 nm) emission
    vec3 emerald = vec3(0.15, 0.95, 0.45);
    vec3 violet  = vec3(0.7, 0.2, 1.0);
    vec3 auroraCol = mix(emerald, violet, clamp(curtainY * 2.0 + 0.5, 0.0, 1.0));

    float auroraGlow = exp(-abs(distToFront) * 12.0) * (0.6 + 0.4 * rays) * midTransition;
    col.rgb += auroraGlow * auroraCol * (1.5 + audioKick * 1.0);

    if (audioChromaHue != 0.0) col.rgb = hueRot(col.rgb, audioChromaHue * midTransition);
    if (hue > 0.001) col.rgb = hueRot(col.rgb, hue * midTransition);

    fragColor = col;
}
