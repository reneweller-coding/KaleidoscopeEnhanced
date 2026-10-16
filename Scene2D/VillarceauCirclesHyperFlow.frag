#version 330 core
/*****************************************************************************\
 *                              VillarceauCirclesHyperFlow.frag
\*****************************************************************************/
/*! @file
 *
 *  @brief
 *  VILLARCEAU CIRCLES HYPER FLOW: Bitangential oblique planar slices of a torus producing pairs of perfectly
 *  circular Villarceau circles.
 *
 *  Intertwined counter-swirling luminous rings, high-contrast chromatic trails, and phase-locked geometric flow.
 *
 *  Audio Reactivity:
 *    audioAdvance -> drives continuous counter-rotation of Villarceau circle pairs
 *    audioKick    -> flashes circle intersection nodes & radial shockwaves
 *    audioCentroid-> sharpens Villarceau circular ribbon edge resolution
 *    audioSubBass -> expands torus major/minor radius ratio breathing
 *    audioChromaHue-> rotates the luminous Villarceau rainbow palette
 *
 *  @author René Weller
 */
out vec4 fragColor; ///< The pixel's colour (output).

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
uniform float audioSubBass;   ///< Sub-bass band level, 0..1.
uniform float audioBass;      ///< Bass band level, 0..1.
uniform float audioMid;       ///< Mid band level, 0..1.
uniform float audioHigh;      ///< High band level, 0..1.
uniform float audioFlux;      ///< Spectral flux (how fast the spectrum changes), 0..1.
uniform float audioChromaHue; ///< Hue of the dominant pitch class (radians, unwrapped: continuous).

// Per-activation variety
uniform float speedP;     ///< Speed knob, 0..1.
uniform float ringCountP; ///< Ring count knob, 4..8.
uniform float ribbonP;    ///< Ribbon knob, 0.7..1.4.
uniform float glowP;      ///< Glow / afterglow knob, 0..1.
uniform float hueP;       ///< Hue knob (radians), usually the music's chroma hue plus a rolled offset.

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
    float ang = audioChromaHue + audioAdvance * 0.04 + t * 6.2831853 + hueP;
    float rad = 0.16 + 0.08 * sin( audioAdvance * 0.013 );
    vec3  pc = img( clamp( vec2( 0.5 ) + rad * vec2( cos( ang ), sin( ang ) ), 0.0, 1.0 ) );
    float pg = dot( pc, vec3( 0.333 ) );
    return mix( vec3( pg ), pc, 0.55 + 0.45 * audioValence );
}

/** Entry point of this shader stage (the file description says what it draws). */
void main()
{
    vec2 uv = ( gl_FragCoord.xy - 0.5 * resolution.xy ) / min( resolution.x, resolution.y );

    float spd = ( speedP > 0.01 ) ? speedP : 1.0;
    float n_rings = ( ringCountP > 1.0 ) ? ringCountP : 6.0;
    float r_mod = ( ribbonP > 0.01 ) ? ribbonP : 1.0;
    float glw = ( glowP > 0.01 ) ? glowP : 1.0;

    float t = time * 0.192 * spd + audioAdvance * 0.192 * spd;
    // Zeit-Basis + Musik-Schub: audioAdvance ALLEIN steht bei ruhiger
    // Musik still (die gemeldete "wirkt wie ein Bild"-Klasse).

    // Torus parameters: R (major), r (minor)
    float R = 1.2 * ( 1.0 + 0.1 * sin( audioSwell * 2.0 ) );
    float r_tor = 0.55 * ( 1.0 + 0.15 * audioSubBass );

    vec3  col_acc = vec3( 0.0 );
    float glow_acc = 0.0;
    float total_weight = 0.0;

    // Accumulate across multiple inclined Villarceau circle pairs
    int num_r = int( clamp( n_rings, 4.0, 8.0 ) );
    for ( int k = 0; k < 6; ++k )
    {
        if ( k >= num_r )
            break;
        float kf = float( k );

        // Rotation angle of cutting plane pair
        float a_plane = t * 0.25 + kf * ( 3.14159265 / float( num_r ) );
        float cs = cos( a_plane ), sn = sin( a_plane );
        vec2  p = mat2( cs, -sn, sn, cs ) * uv * 2.2;

        // Centers of two Villarceau circles on the bitangential plane: (+- sqrt(R*r), 0)
        float d_offset = sqrt( R * r_tor );
        vec2  c1 = vec2( d_offset, 0.0 );
        vec2  c2 = vec2( -d_offset, 0.0 );

        float r_circle = R; // Radius of Villarceau circle equals major radius R

        float d_circle1 = abs( length( p - c1 ) - r_circle );
        float d_circle2 = abs( length( p - c2 ) - r_circle );

        // Luminous circular ribbon filaments
        float g1 = exp( -d_circle1 * ( 24.0 + 12.0 * audioCentroid ) * r_mod );
        float g2 = exp( -d_circle2 * ( 24.0 + 12.0 * audioCentroid ) * r_mod );

        // Flowing phase pulses along circles
        float flow1 = sin( atan( p.y - c1.y, p.x - c1.x ) * 6.0 + t * 4.0 + kf );
        float flow2 = sin( atan( p.y - c2.y, p.x - c2.x ) * 6.0 - t * 4.0 + kf );

        vec3 pal1 = imgPalette( kf * 0.2 + t * 0.05 );
        vec3 pal2 = imgPalette( kf * 0.2 + 0.5 );

        vec3 ring_col1 = pal1 * g1 * ( 0.8 + 0.4 * flow1 );
        vec3 ring_col2 = pal2 * g2 * ( 0.8 + 0.4 * flow2 );

        col_acc += ( ring_col1 + ring_col2 );
        glow_acc += ( g1 + g2 );
        total_weight += 1.0;
    }

    // Sample distorted background photo
    vec2 sample_uv = fract( uv * 0.4 + 0.5 );
    vec3 tex_col = img( sample_uv );

    vec3 final_col = mix( tex_col * 0.3, col_acc, clamp( glow_acc, 0.0, 1.0 ) );

    // Glowing Villarceau intersection node flashes
    vec3 node_tint = vec3( 1.4, 1.1, 1.8 ) * glow_acc * glw * ( 1.0 + 2.5 * audioKick );
    final_col += node_tint;

    final_col = pow( final_col, vec3( 0.88 ) );
    final_col *= 0.78; // measured luma 0.640: knee, not a linear trim
    final_col /= 1.0 + 0.45 * max( final_col.r, max( final_col.g, final_col.b ) );
    fragColor = vec4( clamp( final_col, 0.0, 1.0 ), 1.0 );
}
