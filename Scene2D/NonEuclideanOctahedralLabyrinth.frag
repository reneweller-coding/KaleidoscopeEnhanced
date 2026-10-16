#version 330 core
/*****************************************************************************\
 *                              NonEuclideanOctahedralLabyrinth.frag
\*****************************************************************************/
/*! @file
 *
 *  @brief
 *  NON-EUCLIDEAN OCTAHEDRAL LABYRINTH: 100% viewport-filling infinite 3D hyperbolic mirror maze constructed from
 *  {3,4} octahedral Coxeter chambers.
 *
 *  Forward flight through recursive non-Euclidean corridors reflecting the loaded photo across infinite internal
 *  mirror planes.
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

uniform float speedP; ///< Speed knob, 0..1.
uniform float foldP;  ///< Fold knob, 0..1.
uniform float scaleP; ///< Scale knob.
uniform float hueP;   ///< Hue knob (radians), usually the music's chroma hue plus a rolled offset.

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

/**  3D Octahedral Coxeter fold
 *
 * @param p  The point. (in)
 *
 * @return
 *   The folded point.
 **/
vec3 foldOctahedron( vec3 p )
{
    p = abs( p );
    if ( p.x < p.y )
        p.xy = p.yx;
    if ( p.x < p.z )
        p.xz = p.zx;
    if ( p.y < p.z )
        p.yz = p.zy;
    return p;
}

/**  USER-FEEDBACK-REDESIGN: an actual mirror labyrinth.
 *
 * @param q     The point. (in)
 * @param size  Size of the chamber. (in)
 *
 * @return
 *   The distance (positive inside the room).
 *
 * The old loop was a pseudo-march that mostly stalled near the camera (one big smooth surface). Now: hollow octahedral
 * chambers repeated through space, sphere-traced from inside — photo-textured walls, glowing edge lines exactly on the
 * mirror seams, headlamp falloff into the deeper chambers.
 **/
float chamber( vec3 q, float size )
{
    q = mod( q + 2.0, 4.0 ) - 2.0; // infinite chamber lattice
    vec3 a = abs( q );
    return -( ( a.x + a.y + a.z - size ) * 0.57735 ); // hollow: inside the room
}

/** Entry point of this shader stage (the file description says what it draws). */
void main()
{
    float scl = ( scaleP > 0.0 ) ? scaleP : 1.0;
    float fld = ( foldP > 0.0 ) ? foldP : 1.0;
    float spd = ( speedP > 0.0 ) ? speedP : 1.0;
    float hue = ( hueP > 0.0 ) ? hueP : 0.0;

    vec2  uv = ( gl_FragCoord.xy - 0.5 * resolution ) / resolution.y;
    float t = time * 0.3 * spd + audioAdvance * 0.2;
    float size = 2.55 + 0.35 * sin( t * 0.4 ) * fld;

    // Drift through the chamber lattice, gently yawing.
    vec3  ro = vec3( 0.35 * sin( t * 0.5 ), 0.30 * cos( t * 0.4 ), t * 0.9 );
    float yaw = t * 0.35 + audioPhase * 0.2;
    vec3  rd = normalize( vec3( uv, 1.25 ) );
    rd.xz = vec2( rd.x * cos( yaw ) - rd.z * sin( yaw ), rd.x * sin( yaw ) + rd.z * cos( yaw ) );

    float d_o = 0.02;
    float hit_dist = -1.0;
    vec3  p = ro;
    for ( int i = 0; i < 64; ++i )
    {
        p = ro + rd * d_o;
        float d_s = chamber( p * scl, size ) / scl;
        // Kamera-Clearance-Blase: der Skriptpfad kreuzt Kammerwaende, und
        // ohne Blase steckte das Auge zeitweise IN der Geometrie
        // ("Eindringen in das Objekt / Kollision mit Kamera").
        d_s = max( d_s, 0.5 - d_o );
        if ( d_s < 0.004 )
        {
            hit_dist = d_o;
            break;
        }
        if ( d_o > 14.0 )
            break;
        d_o += d_s * 0.85;
    }

    vec3 col = vec3( 0.02, 0.03, 0.05 );
    if ( hit_dist > 0.0 )
    {
        vec2 e = vec2( 0.006, 0.0 );
        vec3 n = normalize( vec3(
            chamber( ( p + e.xyy ) * scl, size ) - chamber( ( p - e.xyy ) * scl, size ),
            chamber( ( p + e.yxy ) * scl, size ) - chamber( ( p - e.yxy ) * scl, size ),
            chamber( ( p + e.yyx ) * scl, size ) - chamber( ( p - e.yyx ) * scl, size ) ) );

        vec3 q = mod( p * scl + 2.0, 4.0 ) - 2.0;
        vec3 a = abs( q );

        // Photo on the mirror faces, projected per face orientation.
        vec2 photo_uv = fract( vec2( dot( p.xy, n.yx ) * 0.22 + 0.5, p.z * 0.22 + 0.5 ) );
        vec3 photo = img( photo_uv );

        // Edge seams: octahedron faces meet where one coordinate crosses 0.
        float edge = exp( -min( a.x, min( a.y, a.z ) ) * ( 14.0 + 8.0 * audioHigh ) );
        vec3  neon = imgPalette( 0.35 + 0.25 * sin( p.z * 0.7 ) );

        // Headlamp: rooms ahead fall into darkness = labyrinth depth.
        float atten = exp( -hit_dist * 0.30 ) * ( 1.5 + 0.6 * audioLevel );
        float diff = max( dot( n, normalize( ro - p ) ), 0.0 ) * atten + 0.10;

        col = photo * diff * ( 0.9 + 0.4 * audioLevel );
        col += neon * edge * ( 0.9 + 1.1 * audioKick ) * ( 0.4 + 0.6 * atten );
    }

    if ( hue > 0.001 )
        col = hueRot( col, hue );
    col = pow( col, vec3( 0.9 ) );
    col /= 1.0 + 0.30 * max( col.r, max( col.g, col.b ) );
    fragColor = vec4( col, 1.0 );
}
