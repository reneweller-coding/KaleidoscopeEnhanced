#version 330 core
/*****************************************************************************\
 *                              QuaternionicJulia4DFlight.frag
\*****************************************************************************/
/*! @file
 *
 *  @brief
 *  QUATERNIONIC JULIA 4D FLIGHT: Raymarched flight through a true 4D Quaternion Julia fractal (q_{n+1} = q_n^2 +
 *  C).
 *
 *  Projected into 3D via 4D hyper-rotations with metallic specular highlights, audio-reactive constant morphing,
 *  and continuous photo texture refraction.
 *
 *    audioAdvance -> rotates 4D hyper-plane slicing angles (xw, yw, zw)
 *    audioKick    -> morphs quaternion constant C & triggers metallic flashes
 *    audioBass    -> pulses 4D Julia escape radius and fractal density
 *    audioSwell   -> increases specular glossiness and iridescence
 *
 *  Per-activation variety:
 *    iterP   float raymarching & fractal iteration depth (0.5..2.0)
 *    sliceP  float 4D hyperspace slice offset            (0.5..2.2)
 *    speedP  float 4D rotation velocity                 (0.5..2.0)
 *    hueP    float metallic iridescence hue offset      (0..6.28)
 *
 *  The distance field itself is BAKED by the companion QuaternionicJulia4DFlight.comp
 *  into texBake (a 96^3 RG32F volume: R = distance, G = orbit trap), re-baked
 *  every few frames rather than evaluated live at every one of the march's 48
 *  steps -- see EffectShader::stepBake(). The 9-iteration quaternion-squaring
 *  formula itself now lives ONLY in the .comp file; this file just samples the
 *  result, so a change to the fractal formula belongs there, not here.
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

uniform float     iterP;   ///< Iter knob: raymarching & fractal iteration depth (0.5..2.0).
uniform float     sliceP;  ///< Slice knob: 4D hyperspace slice offset, 0.5..2.2.
uniform float     speedP;  ///< Speed knob, 0..1.
uniform float     hueP;    ///< Hue knob (radians), usually the music's chroma hue plus a rolled offset.
uniform sampler3D texBake; ///< The baked distance field (distance and orbit trap per voxel).

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

/// The bake cube spans [-BakeExtent, BakeExtent] on every axis -- MUST match
/// QuaternionicJulia4DFlight.comp's EXTENT constant.
const float BakeExtent = 2.2;
/**  World position to the baked volume's texture coordinate.
 *
 * @param p  The world position. (in)
 *
 * @return
 *   The texture coordinate, 0..1.
 **/
vec3 worldToUV( vec3 p )
{
    return ( p + BakeExtent ) / ( 2.0 * BakeExtent );
}

/**  Distance + orbit-trap lookup against the baked field (see the .comp file): the 4D hyper-rotation and the qJulia
 * formula itself were already applied PER VOXEL when it was baked, so a lookup by plain 3D world position "p"
 * already accounts for both -- nothing here needs to know about C, wCoord, or the rotation at all.
 *
 * @param p  The world position. (in)
 *
 * @return
 *   The distance (r) and the orbit trap (g).
 **/
vec2 fieldAt( vec3 p )
{
    return texture( texBake, worldToUV( p ) ).rg;
}

/** Entry point of this shader stage (the file description says what it draws). */
void main()
{
    float hue = ( hueP > 0.0 ) ? hueP : 0.0;
    float spd = ( speedP > 0.0 ) ? speedP : 1.0;

    vec2 uv = ( gl_FragCoord.xy - 0.5 * resolution ) / resolution.y;
    vec2 st = gl_FragCoord.xy / resolution;

    // Only needed here for the camera ray's own rotation now -- the fractal
    // formula, its C/wCoord morph and its 4D hyper-rotation all moved into
    // QuaternionicJulia4DFlight.comp (see fieldAt() above). MUST still match
    // the .comp's own "t" so the baked rotation and this live camera stay in
    // sync (kept in step deliberately, not shared code -- see that file).
    float t = time * 0.3 * spd + audioAdvance * 0.15;

    // Raymarching setup
    vec3 ro = vec3( 0.0, 0.0, -2.4 );
    vec3 rd = normalize( vec3( uv, 1.2 ) ); // was 1.2 - 0.25*audioKick: the FOV lurched on every kick

    rd.yz = rot2D( sin( t * 0.4 ) * 0.3 ) * rd.yz;
    rd.xz = rot2D( t * 0.5 ) * rd.xz;

    float d_o = 0.0;
    float hit_dist = -1.0;
    float trap_min = 1e5;
    vec3  hit_p = vec3( 0.0 ); // guarded by hit_dist, but the compiler cannot see that

    for ( int i = 0; i < 48; ++i )
    {
        vec3 p = ro + rd * d_o;

        vec2  field = fieldAt( p );
        float d_s = field.r;
        // Camera clearance: the morphing set can swell right up to the
        // (fixed) camera -- keep a free bubble instead of clipping into it.
        d_s = max( d_s, 0.35 - length( p - ro ) );
        trap_min = min( trap_min, field.g );

        if ( d_s < 0.003 )
        {
            hit_dist = d_o;
            hit_p = p;
            break;
        }
        if ( d_o > 6.0 )
            break;
        d_o += d_s * 0.7;
    }

    // Miss rays carry trap_min too: an orbit-trap AURA fills the frame with
    // the fractal's energy field instead of near-black (the metric scan
    // measured luma 6 / coverage 0 -- the set is thin at many C morphs and
    // most rays miss).  Level breathes the aura, phase spins its colour.
    vec3 col = vec3( 0.02, 0.02, 0.05 );
    vec3 aura = imgPalette( ( trap_min * 8.0 + audioPhase ) * 0.159 )
                * exp( -trap_min * 1.4 ) * ( 0.9 + 0.4 * audioLevel );
    col += aura * 0.85;

    if ( hit_dist > 0.0 )
    {
        // Normal approximation: central differences on the baked field
        // (the voxel grid caps the achievable detail -- a softer normal than
        // the old live analytic one, in exchange for not evaluating the
        // 9-iteration formula three more times per hit pixel).
        vec3 e = vec3( 0.01, 0.0, 0.0 );
        vec3 n = normalize( vec3(
            fieldAt( hit_p + e.xyy ).r - fieldAt( hit_p - e.xyy ).r,
            fieldAt( hit_p + e.yxy ).r - fieldAt( hit_p - e.yxy ).r,
            fieldAt( hit_p + e.yyx ).r - fieldAt( hit_p - e.yyx ).r ) );

        vec3  light_dir = normalize( vec3( 0.6, 0.8, -0.5 ) );
        float diff = max( dot( n, light_dir ), 0.0 );
        float spec = pow( max( dot( reflect( -light_dir, n ), -rd ), 0.0 ), 32.0 );

        // Photo mapping from surface reflection and normal
        vec2 photo_uv = fract( n.xy * 0.5 + 0.5 + hit_p.z * 0.1 );
        vec3 photo = img( photo_uv );

        // Iridescent metallic gradient
        vec3 irid = imgPalette( ( trap_min * 12.0 + audioPhase ) * 0.159 );

        col = mix( photo * 0.9, irid, 0.5 );
        col = col * ( 0.3 + 0.7 * diff ) + spec * vec3( 1.0, 0.95, 0.9 ) * ( 1.2 + audioKick * 2.0 );

        // Depth fog
        col = mix( col, vec3( 0.02, 0.02, 0.06 ), 1.0 - exp( -hit_dist * 0.3 ) );
    }

    if ( audioChromaHue != 0.0 )
        if ( hue > 0.001 )
            col = hueRot( col, hue );

    fragColor = vec4( col, 1.0 );
}
