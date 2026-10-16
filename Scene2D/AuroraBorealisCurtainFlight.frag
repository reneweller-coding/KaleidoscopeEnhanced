#version 330 core
out vec4 fragColor; ///< The pixel's colour (output).
/**
 * @file AuroraBorealisCurtainFlight.frag
 * @brief AURORA BOREALIS CURTAIN FLIGHT: Volumetric 3D flight directly through
 * rippling multilayered solar ionosphere Aurora curtains with vertical ray shooting,
 * emerald-to-violet geomagnetic ionization glows, and deep cosmic star fields.
 *
 * Audio Reactivity:
 *   audioAdvance -> drives continuous forward flight through the aurora curtains
 *   audioKick    -> flashes vertical geomagnetic particle surges & curtain burst
 *   audioCentroid-> sharpens vertical ray shooting filament resolution
 *   audioSubBass -> expands curtain wave amplitude breathing
 *   audioChromaHue-> steers the geomagnetic fluorescent spectrum
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
uniform float speedP; ///< Speed knob, 0..1.
uniform float curtainCountP;
uniform float waveP; ///< Wave knob.
uniform float glowP; ///< Glow / afterglow knob, 0..1.
uniform float hueP;  ///< Hue knob (radians), usually the music's chroma hue plus a rolled offset.

/// @brief The photo at a coordinate: the cross-fade of tex0 and tex1.
vec3 img( vec2 uv )
{
    return ( interpolation * texture( tex0, uv ) + ( 1.0 - interpolation ) * texture( tex1, uv ) ).rgb;
}

/// @brief The house palette: a colour of the photo on an arc that turns with the music's hue.
vec3 imgPalette( float t )
{
    float ang = audioChromaHue + audioAdvance * 0.04 + t * 6.2831853 + hueP;
    float rad = 0.16 + 0.08 * sin( audioAdvance * 0.013 );
    vec3  pc = img( clamp( vec2( 0.5 ) + rad * vec2( cos( ang ), sin( ang ) ), 0.0, 1.0 ) );
    float pg = dot( pc, vec3( 0.333 ) );
    return mix( vec3( pg ), pc, 0.55 + 0.45 * audioValence );
}

/// @brief Entry point of this shader stage (the file description says what it draws).
void main()
{
    vec2 uv = ( gl_FragCoord.xy - 0.5 * resolution.xy ) / min( resolution.x, resolution.y );

    float spd = ( speedP > 0.01 ) ? speedP : 1.0;
    float n_curtains = ( curtainCountP > 1.0 ) ? curtainCountP : 4.0;
    float wv = ( waveP > 0.01 ) ? waveP : 1.0;
    float glw = ( glowP > 0.01 ) ? glowP : 1.0;

    float t = time * 0.210 * spd + audioAdvance * 0.210 * spd;
    // Zeit-Basis + Musik-Schub: audioAdvance ALLEIN steht bei ruhiger
    // Musik still (die gemeldete "wirkt wie ein Bild"-Klasse).

    // Flight camera position floating among aurora curtains
    vec3 ro = vec3( sin( t * 0.3 ) * 0.5, 0.0, t * 2.0 );
    vec3 rd = normalize( vec3( uv.x, uv.y + 0.1, 1.25 + 0.2 * sin( audioSwell * 2.0 ) ) );

    vec3  aurora_acc = vec3( 0.0 );
    float tot_dist = 0.0;

    // Volumetric curtain raymarching loop
    for ( int i = 0; i < 48; ++i )
    {
        vec3 p = ro + rd * tot_dist;

        // Multilayered curtain wave functions along X and Z
        int num_c = int( clamp( n_curtains, 2.0, 5.0 ) );
        for ( int k = 0; k < 4; ++k )
        {
            if ( k >= num_c )
                break;
            float kf = float( k );

            // Curtain baseline position along X
            // Sub-bass swells the sway AMPLITUDE only -- the wave's phase terms
            // stay untouched so the curtains never jump sideways on a bass hit.
            float curtain_x = sin( p.z * 0.4 + t * 0.8 + kf * 1.5 ) * ( 1.2 * wv ) * ( 1.0 + 0.4 * audioSubBass )
                              + ( kf - 1.5 ) * 1.0;
            float d_curtain = abs( p.x - curtain_x );

            // Vertical height envelope: Aurora glows brightest between y = -0.5 and y = 1.5
            float height_envelope = exp( -abs( p.y - 0.5 ) * 1.8 );

            // Vertical shooting ray filaments
            float ray_filament = sin( p.x * ( 15.0 + 8.0 * audioCentroid ) + p.z * 5.0 - t * 4.0 ) * 0.5 + 0.5;
            ray_filament = pow( ray_filament, 3.0 );

            // Ionization density at this sample point
            float density = exp( -d_curtain * 14.0 ) * height_envelope * ( 0.4 + 0.6 * ray_filament );
            density *= ( 0.025 + 0.035 * audioLevel );

            // Aurora vertical color gradient: Emerald green at bottom (p.y < 0.2), Violet/Magenta at top (p.y > 0.5)
            vec3 pal_bottom = vec3( 0.1, 1.4, 0.6 ); // Atomic Oxygen 557.7 nm
            vec3 pal_top = vec3( 1.2, 0.2, 1.6 );    // Molecular Nitrogen
            vec3 curtain_col = mix( pal_bottom, pal_top, clamp( ( p.y + 0.2 ) / 1.2, 0.0, 1.0 ) );

            // Blend with slideshow image palette
            curtain_col = mix( curtain_col, imgPalette( kf * 0.25 + p.y * 0.3 ), 0.4 );

            aurora_acc += curtain_col * density * ( 1.0 + 2.0 * audioKick ) * glw;
        }

        tot_dist += 0.09;
    }

    // Deep cosmic background starfield with texture sample
    // SPIEGEL-Kachelung statt fract(): die harte Wrap-Naht des driftenden
    // Fotos war die gemeldete sichtbare Kante im Hintergrund.
    vec2 sky_raw = uv * 0.3 + vec2( t * 0.02, 0.0 );
    vec2 sky_uv = abs( fract( sky_raw * 0.5 ) * 2.0 - 1.0 );
    vec3 sky_tex = img( sky_uv );
    vec3 bg_night = mix( imgPalette( 0.1 ) * 0.15, sky_tex * 0.2, 0.5 );

    vec3 final_col = bg_night + aurora_acc;

    // Atmospheric horizon glow
    float horizon_glow = exp( -abs( uv.y + 0.2 ) * 5.0 ) * 0.25 * audioSwell;
    final_col += imgPalette( 0.4 ) * horizon_glow;

    final_col = pow( final_col, vec3( 0.88 ) );
    fragColor = vec4( clamp( final_col, 0.0, 1.0 ), 1.0 );
}
