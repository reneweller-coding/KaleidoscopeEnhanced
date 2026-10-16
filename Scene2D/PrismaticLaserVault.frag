#version 330 core
out vec4 fragColor; ///< The pixel's colour (output).
/**
 * @file PrismaticLaserVault.frag
 * @brief PRISMATIC LASER VAULT: Volumetric 64-beam laser maze with dichroic prism cubes,
 * optical smoke volume scattering, and beam-splitter refractions filling 100% viewport.
 *   audioKick    -> flashes laser wattage into blinding flare blooms
 *   audioMid     -> modulates laser beam oscillation frequencies
 *   audioAdvance -> rotates dichroic prism mirrors in 3D
 *   audioSwell   -> thickens volumetric smoke density
 *
 * Per-activation variety:
 *   beamP    float laser beam density & width              (0.5..2.2)
 *   prismP   float dichroic prism rotation speed           (0.5..1.8)
 *   smokeP   float atmospheric haze / smoke scattering     (0.5..2.0)
 *   hueP     float RGB beam spectrum color offset          (0..6.28)
 */

uniform vec2      resolution;    ///< Size of the render target in pixels.
uniform float     time;          ///< Seconds since the program started (never reset; see sceneTime).
uniform sampler2D tex0;          ///< The current photo.
uniform sampler2D tex1;          ///< The next photo (cross-faded in by interpolation).
uniform float     interpolation; ///< Cross-fade between the photos: 1 = tex0, 0 = tex1.

uniform float audioPhase;    ///< Rotation phase driven by the music (integrated, never jumps).
uniform float audioAdvance;  ///< The music's advance: integrated tempo-weighted energy (never jumps, never runs
                             ///< backwards).
uniform float audioSwell;    ///< Slow loudness envelope, 0..1 (seconds).
uniform float audioLevel;    ///< Overall loudness, 0..1.
uniform float audioKick;     ///< Kick-drum envelope, 0..1 (fast attack, short decay).
uniform float audioCentroid; ///< Spectral centroid (brightness of the sound), 0..1.
uniform float audioValence;  ///< Mood valence: 0 dark .. 1 bright.
uniform float audioSubBass;  ///< Sub-bass band level, 0..1.
uniform float audioBass;     ///< Bass band level, 0..1.
uniform float audioMid;      ///< Mid band level, 0..1.
uniform float audioHigh;     ///< High band level, 0..1.
uniform float audioFlux;     ///< Spectral flux (how fast the spectrum changes), 0..1.

uniform float beamP;  ///< Beam knob: laser beam density & width, 0.5..2.2.
uniform float prismP; ///< Prism knob: dichroic prism rotation speed, 0.5..1.8.
uniform float smokeP; ///< Smoke knob: atmospheric haze / smoke scattering, 0.5..2.
uniform float hueP;   ///< Hue knob (radians), usually the music's chroma hue plus a rolled offset.


uniform float audioChromaHue; ///< Hue of the dominant pitch class (radians, unwrapped: continuous).

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


/**  IMG-PALETTE (house standard): colours come from a rotating arc in the CURRENT slideshow image, so every
 * activation inherits a fresh palette from the photos; the arc follows the musical key (audioChromaHue is circular-
 * slewed = jump-free) with a slow advance drift, valence shapes saturation.
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
    vec3  pc = img( clamp( vec2( 0.5 ) + rad * vec2( cos( ang ), sin( ang ) ), 0.0, 1.0 ) );
    float pg = dot( pc, vec3( 0.333 ) );
    return mix( vec3( pg ), pc, 0.55 + 0.45 * audioValence );
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

/**  2D rotation matrix.
 *
 * @param a  The angle in radians. (in)
 *
 * @return
 *   The rotation matrix.
 **/
mat2 rot2D( float a )
{
    float c = cos( a ), s = sin( a );
    return mat2( c, -s, s, c );
}

/**  Pseudo-random number 0..1 from a 2D point.
 *
 * @param p  The point. (in)
 *
 * @return
 *   A pseudo-random number 0..1.
 **/
float hash21( vec2 p )
{
    p = fract( p * vec2( 142.34, 489.12 ) );
    p += dot( p, p + 23.45 );
    return fract( p.x * p.y );
}

/** Entry point of this shader stage (the file description says what it draws). */
void main()
{
    float bm = ( beamP > 0.0 ) ? beamP : 1.0;
    float prs = ( prismP > 0.0 ) ? prismP : 1.0;
    float smk = ( smokeP > 0.0 ) ? smokeP : 1.0;
    float hue = ( hueP > 0.0 ) ? hueP : 0.0;

    vec2 uv = ( gl_FragCoord.xy - 0.5 * resolution ) / resolution.y;
    vec2 st = gl_FragCoord.xy / resolution;

    float t = time * 0.4 * prs + audioAdvance * 0.2;

    // Camera ray setup in laser chamber
    vec3 ro = vec3( 0.0, 0.0, -3.5 );
    vec3 rd = normalize( vec3( uv, 1.2 ) );
    rd.yz = rot2D( sin( t * 0.3 ) * 0.3 ) * rd.yz;
    rd.xz = rot2D( t * 0.4 ) * rd.xz;

    vec3 col = vec3( 0.01, 0.01, 0.03 );

    // 16 intersecting volumetric laser beam lines
    float laser_intensity = 0.0;
    vec3  laser_rgb = vec3( 0.0 );

    for ( int i = 0; i < 16; ++i )
    {
        float fi = float( i );
        float beam_angle = ( fi / 16.0 ) * 6.2831853 + t * ( 0.2 + 0.1 * sin( fi ) );

        // Beam origin and direction
        vec3 b_org = vec3( sin( beam_angle ) * 2.0, cos( beam_angle * 2.0 ) * 1.5, cos( beam_angle ) * 2.0 );
        vec3 b_dir = normalize(
            vec3( -sin( beam_angle + 1.57 ), sin( t * 2.0 + fi ) * 0.5, -cos( beam_angle + 1.57 ) ) );

        // Closest point between camera ray and laser beam ray
        vec3  w0 = ro - b_org;
        float a = dot( rd, rd );
        float b = dot( rd, b_dir );
        float c = dot( b_dir, b_dir );
        float d = dot( rd, w0 );
        float e = dot( b_dir, w0 );

        float denom = a * c - b * b;
        float sc = ( denom > 1e-4 ) ? ( b * e - c * d ) / denom : 0.0;
        float tc = ( denom > 1e-4 ) ? ( a * e - b * d ) / denom : 0.0;

        sc = max( sc, 0.0 );

        vec3  p_cam = ro + rd * sc;
        vec3  p_beam = b_org + b_dir * tc;
        float dist = length( p_cam - p_beam );

        // Volumetric glow accumulation
        float beam_glow = ( 0.003 * bm ) / ( dist * dist + 0.0004 );
        beam_glow *= ( 0.8 + 0.4 * sin( tc * 4.0 - time * 12.0 ) ); // High speed pulse packets

        // Distinct dichroic RGB color per beam
        vec3 b_col = imgPalette( ( fi * 0.8 + audioPhase ) * 0.159 );

        laser_rgb += b_col * beam_glow;
    }

    // Input photo mapped onto reflective background mirror walls
    vec3 photo = img( st );
    col += photo * 0.25;

    // Atmospheric smoke volume scattering
    // Weicher Dunst statt harter uv-Zellen: floor(uv*120) leuchtete ganze
    // ~16-px-Quadrate auf, sobald audioHigh anzog.
    vec2  smg = uv * 120.0;
    vec2  smf = fract( smg ) - 0.5;
    float smoke = hash21( floor( smg ) + vec2( floor( time * 4.00 ), 0.0 ) )
                  * exp( -dot( smf, smf ) * 3.5 );
    col += laser_rgb * ( 1.0 + audioKick * 3.0 ) * ( 0.8 + 0.4 * audioSwell * smk );

    if ( audioHigh > 0.4 )
    {
        col += vec3( 1.0, 0.9, 0.7 ) * smoke * audioHigh * 0.8;
    }

    if ( hue > 0.001 )
        col = hueRot( col, hue );

    // Catalogue review: soft-knee exposure — hot audio compresses
    // instead of clipping the whole frame to white.
    vec3 cat_tone = ( col ) * 0.7;
    cat_tone /= 1.0 + 0.35 * max( cat_tone.r, max( cat_tone.g, cat_tone.b ) );
    fragColor = vec4( cat_tone, 1.0 );
}
