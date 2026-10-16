#version 330 core
out vec4 fragColor; ///< The pixel's colour (output).
/**
 * @file GalacticAccretionStreamFlight.frag
 * @brief GALACTIC ACCRETION STREAM FLIGHT: Relativistic helical flight along magnetic
 * flux tubes directly into a supermassive black hole quasar accretion disk with
 * synchrotron radiation jets, Doppler-boosted plasma streams, and event horizon plunges.
 *
 * Audio Reactivity:
 *   audioAdvance -> drives continuous high-velocity helical plunge trajectory
 *   audioKick    -> flashes accretion disk reconnection bursts & jet shockwaves
 *   audioCentroid-> modulates synchrotron radiation frequency & plasma filament density
 *   audioSubBass -> expands accretion disk magnetic coil breathing
 *   audioChromaHue-> steers the relativistic plasma spectrum
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
uniform float helixP;
uniform float jetIntensityP;
uniform float glowP; ///< Glow / afterglow knob, 0..1.
uniform float hueP;  ///< Hue knob (radians), usually the music's chroma hue plus a rolled offset.

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
    float hlx = ( helixP > 0.01 ) ? helixP : 1.0;
    float jet_int = ( jetIntensityP > 0.01 ) ? jetIntensityP : 1.0;
    float glw = ( glowP > 0.01 ) ? glowP : 1.0;

    float t = time * 0.228 * spd + audioAdvance * 0.228 * spd;
    // Zeit-Basis + Musik-Schub: audioAdvance ALLEIN steht bei ruhiger
    // Musik still (die gemeldete "wirkt wie ein Bild"-Klasse).

    // Helical camera path plunging into black hole core
    float s_hel = t * 1.5;
    float r_hel = ( 2.2 + 0.4 * sin( audioSwell * 2.0 ) ) * hlx;
    vec3  ro = vec3( r_hel * cos( s_hel * 0.6 ), 1.2 * sin( s_hel * 0.3 ), r_hel * sin( s_hel * 0.6 ) );
    vec3  ta = vec3( 0.0, 0.0, 0.0 ); // Looking at black hole center

    vec3 ww = normalize( ta - ro );
    vec3 uu = normalize( cross( ww, vec3( 0.0, 1.0, 0.0 ) ) );
    vec3 vv = cross( uu, ww );
    vec3 rd = normalize( uv.x * uu + uv.y * vv + ( 1.2 + 0.2 * sin( audioSwell ) ) * ww );

    // Volumetric raymarching of accretion disk and synchrotron jets
    vec3  col_acc = vec3( 0.0 );
    float tot_dist = 0.0;
    float plasma_acc = 0.0;
    float jet_acc = 0.0;

    for ( int i = 0; i < 48; ++i )
    {
        vec3  p = ro + rd * tot_dist;
        float r_disk = length( p.xz );
        float y_disk = p.y;

        // Thin Keplerian accretion disk in XZ plane
        float disk_density = exp( -abs( y_disk ) * ( 12.0 - 4.0 * audioSubBass ) ) * smoothstep( 0.4, 0.8, r_disk )
                             * smoothstep( 4.5, 1.5, r_disk );

        // Relativistic spiral arms in accretion disk
        float disk_angle = atan( p.z, p.x ) + ( 3.0 / max( 0.5, r_disk ) ) - t * 2.5;
        // Brightness raises the synchrotron harmonic by crossfading a coarse and a
        // fine ribbon instead of scaling disk_angle -- disk_angle carries a t term, so
        // an audio-varying frequency multiplier would remap the whole accumulated
        // phase every frame (flicker). Contrast rises with it, tightening filaments.
        float spiral_ribbon = mix( sin( disk_angle * 4.0 ), sin( disk_angle * 11.0 ), 0.55 * audioCentroid ) * 0.5
                              + 0.5;
        disk_density *= ( 0.6 - 0.15 * audioCentroid ) + ( 0.4 + 0.15 * audioCentroid ) * spiral_ribbon;

        plasma_acc += disk_density * ( 0.04 + 0.05 * audioLevel );

        // Relativistic vertical plasma jets along Y-axis
        float jet_radius = 0.35 + abs( y_disk ) * 0.15;
        float jet_density = exp( -r_disk * r_disk / ( jet_radius * jet_radius ) )
                            * smoothstep( 0.2, 1.5, abs( y_disk ) );
        jet_acc += jet_density * ( 0.02 + 0.03 * audioHigh ) * jet_int;

        tot_dist += 0.08;
    }

    // Central black hole event horizon silhouette
    vec2  center_uv = uv;
    float center_dist = length( center_uv );
    float horizon_mask = smoothstep( 0.18, 0.25, center_dist );

    // Dynamic texture sample mapped across accretion disk coordinates
    vec2 sample_uv = fract( uv * 0.4 + vec2( t * 0.1, 0.0 ) );
    vec3 tex_col = img( sample_uv );

    // Multi-temperature accretion plasma palette (golden-white inner disk to deep red outer rim)
    vec3 pal_inner = imgPalette( plasma_acc * 0.2 + 0.1 );
    vec3 pal_jet = imgPalette( jet_acc * 0.3 + 0.7 );

    vec3 plasma_col = mix( pal_inner, tex_col, 0.35 );
    vec3 jet_col = vec3( 0.3, 1.2, 1.9 ) * jet_acc * ( 1.0 + 2.0 * audioKick ) * glw;

    vec3 final_col = ( plasma_col * plasma_acc * 2.5 + jet_col ) * horizon_mask;

    // Photon ring flare around event horizon
    float photon_ring = exp( -abs( center_dist - 0.22 ) * 45.0 ) * ( 1.5 + 3.0 * audioKick );
    final_col += vec3( 1.8, 1.5, 1.1 ) * photon_ring;

    final_col = pow( final_col, vec3( 0.88 ) );
    fragColor = vec4( clamp( final_col, 0.0, 1.0 ), 1.0 );
}
