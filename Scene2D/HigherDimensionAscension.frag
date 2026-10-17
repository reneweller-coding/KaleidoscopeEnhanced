#version 330 core
/*****************************************************************************\
 *                              HigherDimensionAscension.frag
\*****************************************************************************/
/*! @file
 *
 *  @brief
 *  HIGHER DIMENSION ASCENSION: Breaking through the veil of 3D space into a mind-bending 4D reality.
 *
 *  Geometry folds into itself in impossible ways, constantly shifting and morphing. Audio kicks cause sudden
 *  dimensional shifts and structural reconfigurations.
 *
 *    audioAdvance -> continuous folding of the higher-dimensional geometry
 *    audioKick    -> intense structural shifts and color inversions
 *    audioSwell   -> blinding, divine glow of the higher plane
 *    audioChromaHue-> palette offset for the impossible colors
 *
 *  Per-activation variety:
 *    foldP float complexity of the dimensional folds (0.5..1.5)
 *    glowP float intensity of the divine light (0.5..2.0)
 *    hueP float palette offset (0..6.28)
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
uniform float audioChromaHue; ///< Hue of the dominant pitch class (radians, unwrapped: continuous).

uniform float foldP; ///< Fold knob, 0..1.
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

/**  4D Rotation matrix (using time) to create tesseract-like folding
 *
 * @param p  The point. (in)
 * @param t  Phase of the rotation. (in)
 *
 * @return
 *   The rotated point.
 **/
vec3 rotate4D( vec3 p, float t )
{
    // Fake a 4D rotation by translating and rotating back and forth
    float c = cos( t );
    float s = sin( t );
    // XY rotation
    vec3 p1 = vec3( p.x * c - p.y * s, p.x * s + p.y * c, p.z );
    // XZ rotation
    vec3 p2 = vec3( p1.x * c - p1.z * s, p1.y, p1.x * s + p1.z * c );
    return p2;
}

/** Entry point of this shader stage (the file description says what it draws). */
void main()
{
    float fp = ( foldP > 0.01 ? foldP : 1.0 );
    float gp = ( glowP > 0.01 ? glowP : 1.0 );
    float hue = ( hueP > 0.01 ? hueP : 0.0 );

    vec2 uv = ( gl_FragCoord.xy - 0.5 * resolution ) / resolution.y;

    // We create a fractal structure (like a Mandelbox or similar folding geometry)
    // to represent the higher dimension.

    vec3 col = vec3( 0.0 );

    vec3 light_col = imgPalette( 0.8 + audioCentroid * 0.2 ); // Blinding divine light
    vec3 dark_col = imgPalette( 0.2 );                        // Deep structural shadows

    float t = time * 0.2 + audioAdvance * 0.5;

    vec3 ro = vec3( 0.0, 0.0, -3.0 );
    vec3 rd = normalize( vec3( uv, 1.0 ) );

    // Smooth camera drift
    float cam_rot = sin( t * 0.5 ) * 0.5;
    mat2  rot_m = mat2( cos( cam_rot ), -sin( cam_rot ), sin( cam_rot ), cos( cam_rot ) );
    rd.xy = rot_m * rd.xy;

    float d = 0.0;
    vec3  p;
    float iter = 0.0;
    float min_dist = 100.0; // Keep track of closest approach for glow

    for ( int i = 0; i < 60; ++i )
    {
        p = ro + rd * d;

        // Audio kick structural shift
        // Shift the geometry suddenly based on kicks
        float shift = 0.0; // structural kick shifts removed (V7d)

        // 4D Folding space
        vec3 p_fold = p;

        // Rotate in fake 4D
        p_fold = rotate4D( p_fold, t * 0.5 + shift );

        // Space folding (absolute value folding)
        for ( int j = 0; j < 4; ++j )
        {
            p_fold = abs( p_fold ) - vec3( 0.5, 0.5, 0.5 ) * fp;
            p_fold = rotate4D( p_fold, t * 0.2 * float( j + 1 ) );
        }

        // Distance function (a lattice of intersecting beams)
        float d1 = length( p_fold.xy ) - 0.05;
        float d2 = length( p_fold.xz ) - 0.05;
        float d3 = length( p_fold.yz ) - 0.05;

        float dist_to_struct = min( min( d1, d2 ), d3 );

        min_dist = min( min_dist, dist_to_struct );

        if ( dist_to_struct < 0.01 )
        {
            // Hit the structure
            iter = float( i ) / 60.0;
            break;
        }

        d += dist_to_struct * 0.5; // slow stepping for accuracy in folded space

        if ( d > 10.0 )
            break;
    }

    if ( d < 10.0 )
    {
        // Hit surface
        float depth = d / 10.0;

        // Color based on depth and iteration count (complexity of fold)
        vec3 surface_col = mix( light_col, dark_col, depth );

        // Flashes on structure
        float flash = step( 0.9, sin( iter * 100.0 + time * 10.0 ) ) * audioKick * gp;

        col = surface_col * ( 1.0 - iter ) * ( 1.0 + audioSwell * 2.0 + flash );
    }

    // Intense volumetric glow filling the space
    // Based on how close the ray got to the folded structures
    float glow = exp( -min_dist * 15.0 ) * gp;
    col += light_col * glow * 0.5 * ( 1.0 + audioSwell );

    // Overall ambient light of the higher dimension
    col += light_col * 0.1 * ( 1.0 + audioSwell );

    if ( hue > 0.001 )
        col = hueRot( col, 0.2 * sin( hue ) );

    // Soft-knee exposure
    vec3 cat_tone = max( col, 0.0 );
    cat_tone /= 1.0 + 0.35 * max( cat_tone.r, max( cat_tone.g, cat_tone.b ) );
    fragColor = vec4( clamp( cat_tone, 0.0, 1.0 ), 1.0 );
}
