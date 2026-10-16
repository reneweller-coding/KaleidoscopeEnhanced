#version 330 core
out vec4 fragColor; ///< The pixel's colour (output).
/**
 * @file MarangoniConvectionTearsOfWine.frag
 * @brief MARANGONI CONVECTION TEARS OF WINE: Solutal Marangoni effect on glass surfaces.
 * Alcohol evaporation gradients create surface tension differentials, driving climbing thin liquid
 * films, capillary rim instability beads, and cascading droplet rivulets (tears of wine).
 *   audioAdvance -> drives upward climbing film velocity & droplet rivulet cascade flow
 *   audioKick    -> flashes capillary bead pinch-off & falling droplet impacts
 *   audioSwell   -> thickens wine film meniscus depth & ruby transmission sheen
 *   audioCentroid-> shifts wine tannin/anthocyanin ruby absorption spectra
 *   audioMid     -> excites capillary wave ripples along climbing meniscus front
 *
 * Per-activation variety:
 *   tearCountP   float number of descending droplet rivulet tears (4.0..12.0)
 *   climbSpeedP  float Marangoni climbing film upward velocity   (0.6..2.2)
 *   wineSheenP   float ruby liquid film specular transmission   (0.8..2.5)
 *   meniscusP    float capillary meniscus thickness scale        (0.4..1.8)
 */

uniform vec2      resolution;    ///< Size of the render target in pixels.
uniform float     time;          ///< Seconds since the program started (never reset; see sceneTime).
uniform sampler2D tex0;          ///< The current photo.
uniform sampler2D tex1;          ///< The next photo (cross-faded in by interpolation).
uniform float     interpolation; ///< Cross-fade between the photos: 1 = tex0, 0 = tex1.

uniform float audioPhase;     ///< Rotation phase driven by the music (integrated, never jumps).
uniform float audioAdvance;   ///< The music's advance: integrated tempo-weighted energy (never jumps, never runs
                              ///< backwards).
uniform float audioSwell;     ///< Slow loudness envelope, 0..1 (seconds).
uniform float audioLevel;     ///< Overall loudness, 0..1.
uniform float audioKick;      ///< Kick-drum envelope, 0..1 (fast attack, short decay).
uniform float audioCentroid;  ///< Spectral centroid (brightness of the sound), 0..1.
uniform float audioValence;   ///< Mood valence: 0 dark .. 1 bright.
uniform float audioChromaHue; ///< Hue of the dominant pitch class (radians, unwrapped: continuous).
uniform float audioSubBass;   ///< Sub-bass band level, 0..1.
uniform float audioBass;      ///< Bass band level, 0..1.
uniform float audioMid;       ///< Mid band level, 0..1.
uniform float audioHigh;      ///< High band level, 0..1.
uniform float audioFlux;      ///< Spectral flux (how fast the spectrum changes), 0..1.

uniform float tearCountP;  ///< Tear count knob: number of descending droplet rivulet tears (4.0..12.0).
uniform float climbSpeedP; ///< Climb speed knob: Marangoni climbing film upward velocity, 0.6..2.2.
uniform float wineSheenP;  ///< Wine sheen knob: ruby liquid film specular transmission, 0.8..2.5.
uniform float meniscusP;   ///< Meniscus knob: capillary meniscus thickness scale, 0.4..1.8.

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

/**  The house palette: a colour of the photo on an arc that turns with the music's hue.
 *
 * @param t  Position on the palette arc, 0..1 for one turn. (in)
 *
 * @return
 *   The palette colour (RGB).
 **/
vec3 imgPalette( float t )
{
    float ang = audioChromaHue + audioAdvance * 0.04 + t * 6.2831853;
    float rad = 0.16 + 0.08 * sin( audioAdvance * 0.013 );
    vec3  col = img( clamp( vec2( 0.5 ) + rad * vec2( cos( ang ), sin( ang ) ), 0.0, 1.0 ) );
    float g = dot( col, vec3( 0.333 ) );
    return mix( vec3( g ), col, 0.55 + 0.45 * audioValence );
}

/**  Tints a colour toward the house palette at t, keeping its brightness.
 *
 * @param c  The colour. (in)
 * @param t  Position on the palette, 0..1. (in)
 * @param k  Strength of the tint, 0..1. (in)
 *
 * @return
 *   The tinted colour.
 **/
vec3 palTint( vec3 c, float t, float k )
{
    vec3 tp = imgPalette( t );
    tp *= dot( c, vec3( 0.3333 ) ) / max( dot( tp, vec3( 0.3333 ) ), 1e-3 );
    return mix( c, tp, k );
}

/** Entry point of this shader stage (the file description says what it draws). */
void main()
{
    vec2  uv = ( gl_FragCoord.xy - 0.5 * resolution ) / min( resolution.x, resolution.y );
    float t = time * 0.35 + audioAdvance * 0.3;

    // Climbing film meniscus front located near y = 0.25
    float v_climb = ( climbSpeedP > 0.01 ? climbSpeedP : 1.2 );
    float meniscus_y = 0.25 + sin( uv.x * 6.0 + t * 0.5 ) * 0.05;

    // Capillary instability bead rim at top of climbing film
    float n_tears = ( tearCountP > 1.0 ? tearCountP : 7.0 );
    float bead_phase = uv.x * n_tears * 3.14159265;
    float beads = pow( sin( bead_phase ) * 0.5 + 0.5, 3.0 ) * exp( -abs( uv.y - meniscus_y ) * 20.0 );

    // Cascading descending droplet tear rivulets below meniscus
    float tear_rivulet = 0.0;
    for ( float i = 0.0; i < 7.0; i += 1.0 )
    {
        if ( i >= n_tears )
            break;

        float tear_x = ( i - ( n_tears - 1.0 ) * 0.5 ) * ( 0.8 / n_tears );
        float drop_y = meniscus_y - fract( t * 0.8 * v_climb + i * 0.37 ) * 0.8;

        // Droplet tear profile
        float d_drop = length( vec2( uv.x - tear_x, uv.y - drop_y ) );
        float drop_core = exp( -d_drop * d_drop * 120.0 );

        // Rivulet trail
        float in_trail = exp( -abs( uv.x - tear_x ) * 45.0 ) * smoothstep( drop_y, meniscus_y, uv.y )
                         * smoothstep( -0.6, drop_y, uv.y );
        tear_rivulet += drop_core * 2.0 + in_trail * 0.6;
    }

    // Bulk wine liquid pool at bottom (y < -0.4)
    float bulk_pool = smoothstep( -0.35, -0.5, uv.y );

    // Capillary ripples on climbing film
    float ripples = sin( uv.y * 25.0 - t * 4.0 + audioPhase ) * ( 0.6 + 0.8 * audioMid );

    // Pinch-off flash on kick
    float pinch_flash = beads * ( 1.0 + 3.5 * audioKick ) * ( wineSheenP > 0.01 ? wineSheenP : 1.3 );

    // Ruby red wine color palette
    vec3 wine_ruby = vec3( 0.55, 0.04, 0.12 );
    vec3 wine_glass = vec3( 0.9, 0.2, 0.35 );
    vec3 wine_sheen = vec3( 1.0, 0.95, 0.9 );

    vec3 col_wine = palTint( mix( wine_ruby, wine_glass, clamp( uv.y + 0.5, 0.0, 1.0 ) ), uv.x * 0.2 + audioCentroid,
                             0.26 );

    // Background photo sampling
    vec2 bg_uv = gl_FragCoord.xy / resolution;
    vec3 bg = img( bg_uv ) * 0.25;

    vec3 col = bg;
    col += col_wine * bulk_pool * 1.5;
    col += col_wine * tear_rivulet * ( 0.8 + 0.4 * audioSwell ) * 1.6;
    col += col_wine * beads * 1.8;
    col += wine_sheen * pinch_flash * 2.2;
    col += col_wine * abs( ripples ) * smoothstep( meniscus_y, -0.4, uv.y ) * 0.6;
    col += col_wine * ( audioKick * 0.35 );

    // Soft knee compression
    col /= 1.0 + 0.35 * max( col.r, max( col.g, col.b ) );
    fragColor = vec4( clamp( col, 0.0, 1.0 ), 1.0 );
}
