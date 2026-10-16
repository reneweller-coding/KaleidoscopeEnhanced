#version 330 core
out vec4 fragColor; ///< The pixel's colour (output).
/**
 * @file AnamorphicMirrorLabyrinth.frag
 * @brief ANAMORPHIC MIRROR LABYRINTH: Cylindrical & conical optical anamorphic
 * transformation labyrinth. Virtual chrome mirror columns reconstruct distorted
 * psychedelic image projections into sharp holographic mandalas.
 *
 * Audio Reactivity:
 *   audioAdvance -> rotates the anamorphic distortion fields & mirror centers
 *   audioKick    -> flashes liquid specular ripples & mirror axis pulse
 *   audioSubBass -> expands radial mirror column radius
 *   audioCentroid-> sharpens optical focal caustics
 *   audioChromaHue-> rotates the chrome reflections & background colors
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
uniform float speedP;       ///< Speed knob, 0..1.
uniform float mirrorCountP; ///< Mirror count knob, 2..4.
uniform float anamorphP;    ///< Anamorph knob, 0.8..1.6.
uniform float glowP;        ///< Glow / afterglow knob, 0..1.
uniform float hueP;         ///< Hue knob (radians), usually the music's chroma hue plus a rolled offset.

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
    float m_count = ( mirrorCountP > 0.5 ) ? mirrorCountP : 3.0;
    float anm = ( anamorphP > 0.01 ) ? anamorphP : 1.2;
    float glw = ( glowP > 0.01 ) ? glowP : 1.0;

    float t = time * 0.180 * spd + audioAdvance * 0.180 * spd;
    // Zeit-Basis + Musik-Schub: audioAdvance ALLEIN steht bei ruhiger
    // Musik still (die gemeldete "wirkt wie ein Bild"-Klasse).

    // Multi-center anamorphic distortion lattice
    vec3  final_col = vec3( 0.0 );
    float total_weight = 0.0;
    float caustic_accum = 0.0;

    int num_pillars = int( clamp( m_count, 1.0, 5.0 ) );

    for ( int k = 0; k < 4; ++k )
    {
        if ( k >= num_pillars )
            break;

        float kf = float( k );
        float orbit_angle = t * 0.35 + kf * ( 6.2831853 / float( num_pillars ) );
        float orbit_rad = ( num_pillars == 1 ) ? 0.0 : ( 0.42 + 0.15 * sin( t * 0.5 + kf ) );
        vec2  center = vec2( cos( orbit_angle ), sin( orbit_angle ) ) * orbit_rad;

        vec2  rel = uv - center;
        float r = length( rel );
        float a = atan( rel.y, rel.x );

        // Cylindrical mirror radius
        float mirror_r = 0.28 + 0.08 * sin( audioSwell * 2.5 + kf ) + 0.05 * audioSubBass;

        // Anamorphic coordinate unrolling
        // Inside/near mirror: unroll cylinder reflection; outside: polar stretch
        float reflection_dist = abs( r - mirror_r );
        float anam_angle = a * anm + t * 0.2 * ( k % 2 == 0 ? 1.0 : -1.0 );
        float anam_radius = exp( r * 2.2 * anm ) * 0.25;

        vec2 anam_uv = vec2(
            0.5 + 0.45 * anam_radius * cos( anam_angle ),
            0.5 + 0.45 * anam_radius * sin( anam_angle ) );

        // Ripple caustic displacement on mirror cylinder boundary
        float ripple = sin( r * 35.0 - t * 4.0 ) * ( 0.02 + 0.03 * audioKick );
        anam_uv += vec2( cos( a * 4.0 ), sin( a * 4.0 ) ) * ripple;

        // Sample unwrapped texture
        vec3 col_sample = img( fract( anam_uv ) );

        // Specular chrome edge and focal caustic
        float edge = smoothstep( 0.08, 0.0, reflection_dist );
        // Tonal brightness tightens the focal falloff instead of boosting it --
        // a sharper caustic must not also become a brighter one.
        float caustic = pow( clamp( 1.0 - reflection_dist * ( 8.0 + 5.0 * audioCentroid ), 0.0, 1.0 ),
                             3.0 + 1.5 * audioCentroid );
        caustic_accum += caustic * ( 1.0 + 2.0 * audioKick );

        // Mix palette tint with chrome reflection
        vec3 tint = imgPalette( a / 6.2831853 + kf * 0.25 );
        vec3 mixed_col = mix( col_sample, tint, 0.4 + 0.3 * edge );

        // Chrome shine
        mixed_col += vec3( 1.2, 1.1, 1.4 ) * caustic * glw;

        float weight = 1.0 / ( 0.1 + r * r * 4.0 );
        final_col += mixed_col * weight;
        total_weight += weight;
    }

    final_col /= max( 0.001, total_weight );

    // Global chromatic aberration from anamorphic lenses
    float ca = 0.012 * ( audioFlux + audioKick );
    vec3  ca_tint = imgPalette( length( uv ) + ca );
    final_col.r = mix( final_col.r, ca_tint.r, 0.25 );

    // Background optical dispersion grid
    float grid = abs( sin( uv.x * 20.0 + t ) ) * abs( cos( uv.y * 20.0 - t ) );
    final_col += imgPalette( 0.3 ) * grid * 0.12 * audioLevel;

    // Saturation and contrast
    final_col = pow( final_col, vec3( 0.85 ) );
    fragColor = vec4( clamp( final_col, 0.0, 1.0 ), 1.0 );
}
