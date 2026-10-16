#version 330 core
out vec4 fragColor; ///< The pixel's colour (output).
/**
 * @file DichroicPrismLaserField.frag
 * @brief DICHROIC PRISM LASER FIELD: Multi-angle floating dichroic glass prism plates
 * with polarized thin-film color splitting (Cyan/Yellow/Magenta), high-intensity
 * laser beam reflections, and luminous internal optical diffraction nodes.
 *
 * Audio Reactivity:
 *   audioAdvance -> drives continuous glass plate orbital rotation & laser tracking
 *   audioKick    -> flashes internal laser beam slicing bursts & plate transmissions
 *   audioCentroid-> sharpens polarized dichroic thin-film transmission bands
 *   audioSubBass -> expands prism plate breathing scale
 *   audioChromaHue-> steers the dichroic glass transmission spectrum
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
uniform float audioSubBass;   ///< Sub-bass band level, 0..1.
uniform float audioBass;      ///< Bass band level, 0..1.
uniform float audioMid;       ///< Mid band level, 0..1.
uniform float audioHigh;      ///< High band level, 0..1.
uniform float audioFlux;      ///< Spectral flux (how fast the spectrum changes), 0..1.
uniform float audioChromaHue; ///< Hue of the dominant pitch class (radians, unwrapped: continuous).

// Per-activation variety
uniform float speedP;      ///< Speed knob, 0..1.
uniform float plateCountP; ///< Plate count knob, 3..6.
uniform float polarizeP;   ///< Polarize knob, 0.8..1.6.
uniform float glowP;       ///< Glow / afterglow knob, 0..1.
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
    float n_plates = ( plateCountP > 1.0 ) ? plateCountP : 5.0;
    float pol = ( polarizeP > 0.01 ) ? polarizeP : 1.2;
    float glw = ( glowP > 0.01 ) ? glowP : 1.0;

    float t = time * 0.192 * spd + audioAdvance * 0.192 * spd;
    // Zeit-Basis + Musik-Schub: audioAdvance ALLEIN steht bei ruhiger
    // Musik still (die gemeldete "wirkt wie ein Bild"-Klasse).

    vec3  col_acc = vec3( 0.0 );
    float total_weight = 0.0;
    float laser_acc = 0.0;
    vec3  laser_col = vec3( 0.0 );

    // Iterate across multiple tilted dichroic glass plates
    int num_p = int( clamp( n_plates, 3.0, 6.0 ) );
    for ( int k = 0; k < 5; ++k )
    {
        if ( k >= num_p )
            break;
        float kf = float( k );

        // Plate angle and rotation
        float plate_angle = t * 0.3 + kf * ( 6.2831853 / float( num_p ) );
        float cs = cos( plate_angle ), sn = sin( plate_angle );
        vec2  p_plate = mat2( cs, -sn, sn, cs ) * uv;

        // Bounded rectangular glass plate SDF
        // Sub-bass swells the plate half-extents on top of the per-plate swell
        // breathing -- the glass itself grows, the film/laser pattern on it does not.
        vec2  plate_half = vec2( 0.7, 0.45 + 0.1 * sin( audioSwell * 2.0 + kf ) ) * ( 1.0 + 0.30 * audioSubBass );
        vec2  d_box = abs( p_plate ) - plate_half;
        float plate_dist = max( d_box.x, d_box.y );

        // Dichroic thin-film transmission phase (wavelength-dependent interference)
        float film_phase = ( p_plate.x * 2.0 + p_plate.y * 1.5 ) * pol + t * 0.8 + kf * 0.7;
        vec3  dichroic_color = vec3(
                                   sin( film_phase ),
                                   sin( film_phase + 2.094 ),
                                   sin( film_phase + 4.188 ) )
                                   * 0.5
                               + 0.5;

        // Laser beam slicing through plate
        float laser_line = abs( p_plate.y - 0.2 * sin( p_plate.x * 4.0 + t * 3.0 ) );
        // Narrow beam (90, not 25) and per-plate SPECTRAL colour: five wide
        // pale beams summed into the old uniform wash.
        float laser_glow = exp( -laser_line * 90.0 ) * step( plate_dist, 0.0 );
        laser_acc += laser_glow * ( 1.0 + 3.0 * audioKick );
        laser_col += pow( dichroic_color, vec3( 1.5 ) ) * laser_glow * ( 1.0 + 2.2 * audioKick );

        // Glass plate edge bevel glow. The first pass capped the glow*kick
        // product to 1.0, but the 1.8-peak blue tint channel still turned
        // that "capped" value into 1.8 -- lower both the cap and the tint
        // constants so the final tinted term stays under 1.0.
        float edge_glow = min(
            exp( -abs( plate_dist ) * ( 20.0 + 10.0 * audioCentroid ) ) * glw * ( 1.0 + 2.0 * audioKick ), 0.5 );

        // Sample texture mapped through the dichroic plate
        vec2 sample_uv = fract( p_plate * 0.4 + 0.5 );
        vec3 tex_col = img( sample_uv );
        vec3 pal_col = imgPalette( kf * 0.2 + t * 0.05 );

        vec3 plate_col = mix( tex_col, pal_col, 0.4 ) * dichroic_color;
        plate_col += vec3( 0.9, 0.8, 1.2 ) * edge_glow;

        float w = smoothstep( 0.08, -0.05, plate_dist );
        col_acc += plate_col * w;
        total_weight += w;
    }

    vec3 final_col = col_acc / max( 0.001, total_weight );

    // Add bright slicing laser beams. laser_acc sums UNWEIGHTED across up to
    // 5 overlapping rotated plates, each contributing up to ~4 on a strong
    // kick. The first pass capped the ACCUMULATOR to 1.4, but the 2.0-peak
    // tint channel still turned that into up to 2.8 per channel -- the
    // accumulator cap alone wasn't the fix, the tinted term needed its own
    // ceiling too. laser_tint is also added across the whole frame wherever
    // ANY plate is lit (unlike plate_col it isn't weight-blended against the
    // background), which is why this read as an almost uniform pale wash
    // rather than isolated beams. Tighten the cap and lower the tint
    // constants.
    vec3 laser_tint = min( laser_col, vec3( 1.35 ) ) * glw;
    final_col += laser_tint;

    // Background optical dispersion
    vec3 bg_col = imgPalette( length( uv ) * 0.4 + 0.3 ) * ( 0.2 + 0.15 * audioLevel );
    final_col = mix( bg_col, final_col, clamp( total_weight, 0.0, 1.0 ) );

    final_col = pow( final_col, vec3( 0.88 ) );
    vec3 cat_tone = clamp( final_col, 0.0, 1.0 );
    cat_tone /= 1.0 + 1.6 * max( cat_tone.r, max( cat_tone.g, cat_tone.b ) );
    fragColor = vec4( cat_tone, 1.0 );
}
