#version 330 core
out vec4 fragColor; ///< The pixel's colour (output).

in vec3  vPos;    ///< Position (from the vertex stage).
in vec3  vNormal; ///< Surface normal (from the vertex stage).
in vec2  vUV;     ///< Texture coordinate 0..1 over the screen (from the vertex stage).
in float vQuadID;
in float vGlint;

/**
 * @file SolarSailArmada.frag
 * @brief Shades a fleet of reflective solar-sail panels (gold and titanium
 * foil, picked per quad by vQuadID) with the live slideshow photo projected
 * onto each membrane, a framed carbon-strut border, specular solar-flare
 * glints, and a laser-mesh glow linking the sails.
 *
 * vGlint (a per-vertex specular term from SolarSailArmada.vert) drives the
 * glint highlight, and vQuadID both selects the foil material and offsets the
 * projected photo UV per sail.
 *
 * Audio Reactivity:
 *   audioKick      -> solar-flare glint flash + inter-sail laser pulse
 *   audioChromaHue -> hue rotation of the finished frame (musical key)
 *   audioSwell     -> base amplitude of the sails' tacking (see .vert)
 *   audioAdvance   -> orbital phase of the fleet (see .vert)
 *   audioSpread    -> fleet dispersion: tight formation on a narrow spectrum,
 *                     scattered to the far orbits on rich harmonics (.vert)
 *   audioBuildUp   -> the sails tack harder as an EDM build climbs (.vert)
 *   audioSharpness -> glint lobe, broad soft sheen vs hard narrow star, with
 *                     the gain scaled inversely to the width (see .vert)
 */

uniform float     time;          ///< Seconds since the program started (never reset; see sceneTime).
uniform sampler2D tex0;          ///< The current photo.
uniform sampler2D tex1;          ///< The next photo (cross-faded in by interpolation).
uniform float     interpolation; ///< Cross-fade between the photos: 1 = tex0, 0 = tex1.

uniform float audioKick;      ///< Kick-drum envelope, 0..1 (fast attack, short decay).
uniform float audioChromaHue; ///< Hue of the dominant pitch class (radians, unwrapped: continuous).
uniform float audioSwell;     ///< Slow loudness envelope, 0..1 (seconds).

uniform float glowP; ///< Glow / afterglow knob, 0..1.
uniform float sailP;
uniform float hueP; ///< Hue knob (radians), usually the music's chroma hue plus a rolled offset.

/**  The photo at a coordinate: the cross-fade of tex0 and tex1.
 *
 * @param uv  Coordinate in the photo, 0..1. (in)
 *
 * @return
 *   The cross-faded photo colour (RGB).
 **/
vec3 img( vec2 uv )
{
    return ( interpolation * texture( tex0, uv ) + ( 1.0 - interpolation ) * texture( tex1, uv ) ).rgb;
}

/**  Rotates a colour's hue by an angle (about the grey axis).
 *
 * @param c  The colour. (in)
 * @param a  The angle in radians. (in)
 *
 * @return
 *   The colour with its hue turned.
 **/
vec3 hueRot( vec3 c, float a )
{
    vec3  k = vec3( 0.57735026919 );
    float cs = cos( a ), sn = sin( a );
    return c * cs + cross( k, c ) * sn + k * dot( k, c ) * ( 1.0 - cs );
}

/** Entry point of this shader stage (the file description says what it draws). */
void main()
{
    float glw = ( glowP > 0.0 ) ? glowP : 1.0;
    float sl = ( sailP > 0.0 ) ? sailP : 1.0;
    float hue = ( hueP > 0.0 ) ? hueP : 0.0;

    // Sail frame border
    vec2  d = abs( vUV - vec2( 0.5 ) ) * 2.0;
    float border = max( d.x, d.y );
    float frame = smoothstep( 0.85, 0.95, border );

    // Mylar / Gold foil reflectance
    vec3 gold_foil = vec3( 1.0, 0.85, 0.45 );
    vec3 titanium_foil = vec3( 0.85, 0.90, 0.98 );
    vec3 sail_base = mix( gold_foil, titanium_foil, step( 1500.0, vQuadID ) );

    // Live kaleidoscope photo projection on reflective membrane
    vec2 photo_uv = vUV * 0.8 + vec2( vQuadID * 0.001, sin( vQuadID ) );
    vec3 photo_col = img( fract( photo_uv ) );

    // Specular solar flare glint
    vec3 glint_color = vec3( 1.0, 1.0, 1.0 ) * vGlint * ( 2.0 + 3.0 * audioKick );

    // Structural carbon struts
    vec3 frame_color = vec3( 0.12, 0.14, 0.18 );
    vec3 surface_color = mix( sail_base * photo_col * 1.5, frame_color, frame );

    // Inter-sail laser communication mesh glow
    float laser_beam = exp( -abs( sin( vQuadID * 0.1 + time * 4.0 ) ) * 12.0 ) * frame;
    vec3  laser_col = vec3( 0.1, 0.8, 1.0 ) * laser_beam * ( 1.0 + 2.0 * audioKick );

    vec3 col = ( surface_color + glint_color + laser_col ) * glw * sl;

    col = hueRot( col, audioChromaHue + hue );
    fragColor = vec4( col, 1.0 );
}
