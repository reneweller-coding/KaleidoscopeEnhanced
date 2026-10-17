#version 330 core
/*****************************************************************************\
 *                              PrismaticSuperradiance.frag
\*****************************************************************************/
/*! @file
 *
 *  @brief
 *  PRISMATIC SUPERRADIANCE: Volumetric quantum laser resonance chamber with multi-faceted Brewster-angle dichroic
 *  prism cubes, cascaded Raman scattering, coherent Q-switched stimulated emission beam sheets, and chromatic
 *  dispersion of live kaleidoscope photo textures.
 *
 *  @author René Weller
 */
out vec4 fragColor; ///< The pixel's colour (output).

uniform vec2      resolution;    ///< Size of the render target in pixels.
uniform float     time;          ///< Seconds since this activation, plus a rolled start (see sceneTime).
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
uniform float audioSubBass;   ///< Sub-bass band level, 0..1.
uniform float audioBass;      ///< Bass band level, 0..1.
uniform float audioMid;       ///< Mid band level, 0..1.
uniform float audioHigh;      ///< High band level, 0..1.
uniform float audioFlux;      ///< Spectral flux (how fast the spectrum changes), 0..1.
uniform float audioChromaHue; ///< Hue of the dominant pitch class (radians, unwrapped: continuous).

uniform float beamP;       ///< Beam knob, 0.5..2.2.
uniform float dispersionP; ///< Dispersion knob, 0.5..2.
uniform float speedP;      ///< Speed knob, 0..1.
uniform float hueP;        ///< Hue knob (radians), usually the music's chroma hue plus a rolled offset.

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

/**  Spectral color from wavelength parameter
 *
 * @param t  Wavelength parameter, 0..1. (in)
 *
 * @return
 *   The colour (RGB).
 **/
vec3 spectrumColor( float t )
{
    return vec3(
        smoothstep( 0.4, 0.0, abs( t - 0.75 ) ),
        smoothstep( 0.4, 0.0, abs( t - 0.50 ) ),
        smoothstep( 0.4, 0.0, abs( t - 0.25 ) ) );
}

/** Entry point of this shader stage (the file description says what it draws). */
void main()
{
    float bm = ( beamP > 0.0 ) ? beamP : 1.0;
    float disp = ( dispersionP > 0.0 ) ? dispersionP : 1.0;
    float spd = ( speedP > 0.0 ) ? speedP : 1.0;
    float hue = ( hueP > 0.0 ) ? hueP : 0.0;

    vec2 uv = ( gl_FragCoord.xy - 0.5 * resolution ) / resolution.y;

    // Ray setup through laser resonator
    float t = time * 0.3 * spd + audioAdvance * 0.15;
    vec3  ro = vec3( sin( t * 0.5 ) * 2.5, cos( t * 0.4 ) * 1.8, -4.5 );
    vec3  ta = vec3( 0.0, 0.0, 0.0 );
    vec3  ww = normalize( ta - ro );
    vec3  uu = normalize( cross( ww, vec3( 0.0, 1.0, 0.0 ) ) );
    vec3  vv = cross( uu, ww );
    vec3  rd = normalize( uv.x * uu + uv.y * vv + 1.5 * ww );

    vec3  col = vec3( 0.0 );
    float step_size = 0.12;

    // Volumetric beam accumulation
    for ( int i = 0; i < 48; ++i )
    {
        vec3 p = ro + rd * ( float( i ) * step_size );

        // Multi-axis laser grid sheets
        vec3  grid_p = fract( p * 0.8 ) - 0.5;
        float beam_x = exp( -abs( grid_p.y ) * 25.0 ) * exp( -abs( grid_p.z ) * 25.0 );
        float beam_y = exp( -abs( grid_p.x ) * 25.0 ) * exp( -abs( grid_p.z ) * 25.0 );
        float beam_z = exp( -abs( grid_p.x ) * 25.0 ) * exp( -abs( grid_p.y ) * 25.0 );

        // Q-switched pulse wave traveling along beams
        float pulse_x = sin( p.x * 6.0 - time * 12.0 ) * 0.5 + 0.5;
        float pulse_y = sin( p.y * 6.0 + time * 10.0 ) * 0.5 + 0.5;
        float pulse_z = sin( p.z * 6.0 - time * 14.0 ) * 0.5 + 0.5;

        // Dispersion of photo texture through dichroic prisms
        vec2 prism_uv = p.xy * 0.2 + vec2( 0.5 );
        vec3 photo_r = img( fract( prism_uv + vec2( 0.015 * disp, 0.0 ) ) );
        vec3 photo_g = img( fract( prism_uv ) );
        vec3 photo_b = img( fract( prism_uv - vec2( 0.015 * disp, 0.0 ) ) );
        vec3 dispersed_photo = vec3( photo_r.r, photo_g.g, photo_b.b );

        // Beam colors & Raman stimulated emission
        vec3 col_x = vec3( 1.0, 0.2, 0.1 ) * ( pulse_x * 1.5 + 0.5 ) * ( 0.8 + 1.2 * audioKick );
        vec3 col_y = vec3( 0.1, 1.0, 0.4 ) * ( pulse_y * 1.5 + 0.5 ) * ( 0.8 + 0.8 * audioMid );
        vec3 col_z = vec3( 0.2, 0.5, 1.0 ) * ( pulse_z * 1.5 + 0.5 ) * ( 0.8 + 1.0 * audioHigh );

        vec3 beam_energy = ( col_x * beam_x + col_y * beam_y + col_z * beam_z ) * bm;

        // Brewster prism cubes floating in cavity
        vec3  cube_p = mod( p + 1.5, 3.0 ) - 1.5;
        float cube_dist = max( abs( cube_p.x ), max( abs( cube_p.y ), abs( cube_p.z ) ) ) - 0.45;
        float prism_facet = smoothstep( 0.05, 0.0, abs( cube_dist ) );
        vec3  prism_glow = spectrumColor( fract( length( cube_p ) * 2.0 + audioPhase * 0.2 ) ) * prism_facet * 2.0;

        col += ( beam_energy * dispersed_photo * 2.2 + prism_glow ) * step_size * ( 0.7 + 0.6 * audioLevel );
    }

    // Vanishing point core laser flash on downbeats
    float center_beam = exp( -length( uv ) * 4.0 ) * ( 0.4 + 1.8 * audioKick );
    col += vec3( 1.0, 0.8, 0.9 ) * center_beam;

    col = hueRot( col, audioChromaHue + hue );
    col = pow( col, vec3( 0.9 ) ); // Saturation boost
    col += vec3( 0.03, 0.02, 0.06 ) * audioSwell;

    // Catalogue review: soft-knee exposure — hot audio compresses
    // instead of clipping the whole frame to white.
    vec3 cat_tone = ( col ) * 0.6;
    cat_tone /= 1.0 + 0.35 * max( cat_tone.r, max( cat_tone.g, cat_tone.b ) );
    fragColor = vec4( cat_tone, 1.0 );
}
