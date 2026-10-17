#version 330 core
/*****************************************************************************\
 *                              CrystalMirrorGrid.frag
\*****************************************************************************/
/*! @file
 *
 *  @brief
 *  CRYSTAL MIRROR GRID: Raymarched 3D crystal mirror lattice filling 100% of the screen.
 *
 *  Every facet refracts and reflects the live photo/kaleidoscope.
 *
 *    audioKick    -> shatter impulse bursting crystal facets towards the camera lens
 *    audioMid     -> lattice rotation & folding wave
 *    audioBass    -> facet extrusion depth & pulse
 *    audioChroma  -> spectral dispersion on crystal edges
 *
 *  Per-activation variety (0 = default):
 *    facetP   float facet density multiplier   (0 -> 1.0; 0.6..1.8)
 *    shatterP float shatter impulse strength   (0 -> 1.0; 0.5..2.0)
 *    refractP float refraction dispersion mul  (0 -> 1.0; 0.5..1.5)
 *    hueP     float global hue rotation        (0 -> none; 0..6.28)
 *
 *  @author René Weller
 */
out vec4 fragColor; ///< The pixel's colour (output).

uniform vec2      resolution;    ///< Size of the render target in pixels.
uniform float     time;          ///< Seconds since this activation, plus a rolled start (see sceneTime).
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

uniform float facetP;         ///< Facet knob: facet density multiplier, 0.6..1.8.
uniform float shatterP;       ///< Shatter knob: shatter impulse strength, 0.5..2.
uniform float refractP;       ///< Refract knob: refraction dispersion mul, 0.5..1.5.
uniform float hueP;           ///< Hue knob (radians), usually the music's chroma hue plus a rolled offset.
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

/**  Pseudo-random number 0..1 from a 3D point.
 *
 * @param p  The point. (in)
 *
 * @return
 *   A pseudo-random number 0..1.
 **/
float hash3D( vec3 p )
{
    p = fract( p * vec3( 0.1031, 0.1030, 0.0973 ) );
    p += dot( p, p.yxz + 33.33 );
    return fract( ( p.x + p.y ) * p.z );
}

/**  Signed Distance Field for Crystal Lattice Box with Facet Beveling Soft-max, used to carve a smooth clearance
 * bubble around the camera out of the distance field: the flight can never clip through geometry -- a would-be
 * collision becomes a soft bulge sliding past the lens.
 *
 * @param a  One distance. (in)
 * @param b  The other distance. (in)
 * @param k  Blend width. (in)
 *
 * @return
 *   The smooth maximum.
 **/
float smax( float a, float b, float k )
{
    float h = clamp( 0.5 - 0.5 * ( a - b ) / k, 0.0, 1.0 );
    return mix( a, b, h ) + k * h * ( 1.0 - h );
}

/**  Distance to the lattice of crystals, each shattered off its cell centre.
 *
 * @param p         The point. (in)
 * @param fDensity  Cells per unit. (in)
 * @param shatter   Shatter offset of the crystals. (in)
 *
 * @return
 *   The distance to the nearest surface.
 **/
float mapLattice( vec3 p, float fDensity, float shatter )
{
    vec3 grid_pos = floor( p * fDensity );
    vec3 local_pos = fract( p * fDensity ) - 0.5;

    // Shatter offset per crystal cell
    float cell_hash = hash3D( grid_pos );
    float kick_disp = sin( cell_hash * 6.28 + time * 4.0 ) * shatter * audioKick;
    local_pos += vec3( sin( cell_hash * 3.14 ), cos( cell_hash * 1.5 ), sin( cell_hash * 9.2 ) ) * kick_disp * 0.4;

    // Box SDF with bevelled crystal facets
    vec3  d = abs( local_pos ) - vec3( 0.38 + 0.08 * sin( time + cell_hash * 10.0 ) );
    float box_sdf = length( max( d, 0.0 ) ) + min( max( d.x, max( d.y, d.z ) ), 0.0 );

    // Bevel cut
    float plane_bevel = dot( local_pos, normalize( vec3( 1.0 ) ) ) - ( 0.42 + 0.05 * audioBass );
    float lat = max( box_sdf, plane_bevel ) / fDensity;
    // The lattice fills ALL of space; the orbiting camera (r = 3) sat
    // permanently inside a crystal, so every frame was one facet's flat
    // interior. Carve a spherical chamber around the orbit: the camera
    // now circles inside a crystal hall whose walls ARE the grid.
    // FLOATING CLUSTER instead of a chamber: the chamber wall only showed the
    // mirrored photo in one piece ("looks like just the picture").  A mirror
    // block circled from outside breaks it up visibly.
    return max( lat, length( p ) - 2.2 );
}

/**  Surface normal of the distance field by central differences.
 *
 * @param p         The surface point. (in)
 * @param fDensity  Cells per unit. (in)
 * @param shatter   Shatter offset of the crystals. (in)
 *
 * @return
 *   The unit normal.
 **/
vec3 calcNormal( vec3 p, float fDensity, float shatter )
{
    vec2 e = vec2( 0.002, 0.0 );
    return normalize( vec3(
        mapLattice( p + e.xyy, fDensity, shatter ) - mapLattice( p - e.xyy, fDensity, shatter ),
        mapLattice( p + e.yxy, fDensity, shatter ) - mapLattice( p - e.yxy, fDensity, shatter ),
        mapLattice( p + e.yyx, fDensity, shatter ) - mapLattice( p - e.yyx, fDensity, shatter ) ) );
}

/** Entry point of this shader stage (the file description says what it draws). */
void main()
{
    float f_dens = ( facetP > 0.0 ) ? facetP : 1.0;
    float shat = ( shatterP > 0.0 ) ? shatterP : 1.0;
    float refr = ( refractP > 0.0 ) ? refractP : 1.0;

    vec2 uv = ( gl_FragCoord.xy - 0.5 * resolution ) / resolution.y;

    // Camera setup
    vec3 ro = vec3( 0.0, 0.0, -3.0 );
    vec3 rd = normalize( vec3( uv, 1.2 ) );

    // Dynamic rotation matrices driven by time and audio
    float rot_x = time * 0.2 + audioAdvance * 0.15;
    float rot_y = time * 0.25 + audioAdvance * 0.12; // was + audioMid*0.5: the camera angle jittered with the mid band
    mat2  rx = mat2( cos( rot_x ), sin( rot_x ), -sin( rot_x ), cos( rot_x ) );
    mat2  ry = mat2( cos( rot_y ), sin( rot_y ), -sin( rot_y ), cos( rot_y ) );

    ro.yz = rx * ro.yz;
    rd.yz = rx * rd.yz;
    ro.xz = ry * ro.xz;
    rd.xz = ry * rd.xz;

    // Raymarching distance loop
    float t = 0.0;
    float hit_dist = -1.0;
    for ( int i = 0; i < 48; ++i )
    {
        vec3  p = ro + rd * t;
        float d = mapLattice( p, 2.0 * f_dens, shat );
        if ( d < 0.003 )
        {
            hit_dist = t;
            break;
        }
        t += d * 0.7;
        if ( t > 7.0 )
            break;
    }

    vec3 final_col = vec3( 0.0 );

    if ( hit_dist > 0.0 )
    {
        vec3 p = ro + rd * hit_dist;
        vec3 N = calcNormal( p, 2.0 * f_dens, shat );
        // MOSAIC mirrors: every cell tilts its mirror its own way, otherwise the
        // smooth chamber wall simply reflects the photo in one piece ("looks like
        // just the picture").
        vec3 cell_id = floor( p * 2.0 * f_dens );
        vec3 tilt_h = vec3( hash3D( cell_id ), hash3D( cell_id + 7.1 ), hash3D( cell_id + 13.7 ) );
        N = normalize( N + ( tilt_h - 0.5 ) * 0.85 );
        vec3 R = reflect( rd, N );

        // Map reflection ray to source image UV
        vec2 refl_uv = vec2( atan( R.z, R.x ) / 6.283185 + 0.5, R.y * 0.5 + 0.5 );
        vec3 refl_col = img( fract( refl_uv ) );

        // Refraction dispersion (RGB split on crystal edges)
        vec3 refr_r = refract( rd, N, 0.75 * refr );
        vec3 refr_g = refract( rd, N, 0.72 * refr );
        vec3 refr_b = refract( rd, N, 0.69 * refr );

        vec3 refr_col;
        refr_col.r = img( fract( refl_uv + refr_r.xy * 0.1 ) ).r;
        refr_col.g = img( fract( refl_uv + refr_g.xy * 0.1 ) ).g;
        refr_col.b = img( fract( refl_uv + refr_b.xy * 0.1 ) ).b;

        // Fresnel term for glass/crystal specular highlight
        float fresnel = pow( 1.0 - max( dot( -rd, N ), 0.0 ), 3.0 );
        final_col = mix( refr_col, refl_col, fresnel * 0.8 + 0.2 );

        // Specular spark on kick drum
        vec3  light_dir = normalize( vec3( 0.5, 1.0, -1.0 ) );
        float spec = pow( max( dot( R, light_dir ), 0.0 ), 16.0 );
        final_col += vec3( 1.0, 0.9, 0.7 ) * spec * ( 1.0 + audioKick * 2.0 );

        // Edge glow
        float edge = 1.0 - max( dot( -rd, N ), 0.0 );
        final_col += imgPalette( 0.30 * audioCentroid ) * 1.5 * pow( edge, 4.0 ) * audioHigh;
    }
    else
    {
        // Background fallback projection
        // Dark room + a breath of palette: the cluster should glow, not the
        // background.
        final_col = imgPalette( 0.6 ) * 0.10 + img( fract( uv * 0.5 + 0.5 ) ) * 0.06;
    }

    if ( hueP > 0.0 )
    {
        final_col = hueRot( final_col, hueP );
    }

    fragColor = vec4( final_col, 1.0 );
}
