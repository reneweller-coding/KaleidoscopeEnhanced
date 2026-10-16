#version 330 core
out vec4 fragColor; ///< The pixel's colour (output).
/**
 * @file SacredGeometryFlowerOfLife3D.frag
 * @brief SACRED GEOMETRY FLOWER OF LIFE 3D: Volumetric raymarching of extruded
 * Flower of Life interlocking torus fields, Metatron's Cube hyper-lattices,
 * and kinetic multi-frequency moiré light conduits.
 *
 * Audio Reactivity:
 *   audioAdvance -> drives continuous 3D camera orbital flight & lattice rotation
 *   audioKick    -> flashes central merkaba core & expands toroidal radius
 *   audioCentroid-> modulates moiré interference frequency
 *   audioSubBass -> pulses sacred geometric node spheres
 *   audioChromaHue-> rotates the luminous spectral rainbow palette
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
uniform float speedP;   ///< Speed knob, 0..1.
uniform float densityP; ///< Density knob, 0..1.
uniform float radiusP;  ///< Radius knob, 0..1.
uniform float glowP;    ///< Glow / afterglow knob, 0..1.
uniform float hueP;     ///< Hue knob (radians), usually the music's chroma hue plus a rolled offset.

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

/**  Distance estimators for 3D Torus and Cylinder
 *
 * @param p  The point. (in)
 * @param t  Radius of the ring (x) and of the tube (y). (in)
 *
 * @return
 *   The signed distance (a bound where the shape has no exact one).
 **/
float sdTorus( vec3 p, vec2 t )
{
    vec2 q = vec2( length( p.xy ) - t.x, p.z );
    return length( q ) - t.y;
}

/**  SDF primitives
 *
 * @param p  The point. (in)
 * @param s  Radius. (in)
 *
 * @return
 *   The signed distance (a bound where the shape has no exact one).
 **/
float sdSphere( vec3 p, float s )
{
    return length( p ) - s;
}

/**  Distance to the flower of life in 3D: the central sphere and the circle tori.
 *
 * @param p      The point. (in)
 * @param t      Time. (in)
 * @param rBase  Radius of the circles. (in)
 *
 * @return
 *   The distance to the nearest surface.
 **/
float mapSacred( vec3 p, float t, float rBase )
{
    // Central sphere / Merkaba core
    float d = sdSphere( p, 0.35 + 0.1 * audioKick );

    // 6 outer intersecting Flower of Life circles in hexagonal arrangement
    float ring_r = rBase;
    float tube_r = 0.025 + 0.01 * audioLevel;

    // Central primary torus
    d = min( d, sdTorus( p, vec2( ring_r, tube_r ) ) );

    // Hexagonal outer rings
    for ( int i = 0; i < 6; ++i )
    {
        float a = float( i ) * 1.04719755; // 60 degrees
        vec3  center = vec3( cos( a ), sin( a ), 0.0 ) * ring_r;
        d = min( d, sdTorus( p - center, vec2( ring_r, tube_r ) ) );

        // Spherical node at intersection
        d = min( d, sdSphere( p - center, 0.08 + 0.03 * audioSubBass ) );
    }

    // 3D extrusion along Z: INTERSECT with the slab (keep |z| < 0.25).
    // The old max(d, -dZ) subtracted it -- it deleted the geometry inside
    // the slab and kept only what stuck out, which is why the recording
    // showed a stray strut instead of the Flower of Life.
    float d_z = abs( p.z ) - 0.25;
    d = max( d, d_z );

    // Diagonal Metatron connecting struts
    vec3  p_rot = p;
    float cs = 0.866025, sn = 0.5;
    vec2  q = vec2( abs( p.x ) * cs - p.y * sn, abs( p.x ) * sn + p.y * cs );
    float strut = length( vec2( q.x, p.z ) ) - tube_r * 0.8;
    d = min( d, strut );

    return d;
}

/** Entry point of this shader stage (the file description says what it draws). */
void main()
{
    vec2 uv = ( gl_FragCoord.xy - 0.5 * resolution.xy ) / min( resolution.x, resolution.y );

    float spd = ( speedP > 0.01 ) ? speedP : 1.0;
    float rBase = ( radiusP > 0.01 ) ? radiusP : 0.85;
    float glw = ( glowP > 0.01 ) ? glowP : 1.0;

    float t = time * 0.150 * spd + audioAdvance * 0.150 * spd;
    // Zeit-Basis + Musik-Schub: audioAdvance ALLEIN steht bei ruhiger
    // Musik still (die gemeldete "wirkt wie ein Bild"-Klasse).

    // Camera ray setup with dynamic orbital tilt
    float cam_dist = 2.9 + 0.35 * sin( audioSwell * 2.0 );
    // The rings live in the XY plane, so the camera belongs on the Z axis:
    // a small tilt keeps it dimensional without turning the pattern edge-on.
    float tilt = 0.28 * sin( t * 0.4 );
    float roll = 0.22 * sin( t * 0.31 + audioPhase * 0.1 );
    vec3  ro = vec3( sin( roll ) * cam_dist, sin( tilt ) * cam_dist,
                     -cos( tilt ) * cos( roll ) * cam_dist );
    vec3  ta = vec3( 0.0, 0.0, 0.0 );
    vec3  ww = normalize( ta - ro );
    vec3  uu = normalize( cross( ww, vec3( 0.0, 1.0, 0.02 ) ) );
    vec3  vv = cross( uu, ww );
    vec3  rd = normalize( uv.x * uu + uv.y * vv + ( 1.3 + 0.2 * sin( audioSwell ) ) * ww );

    // Raymarch through Sacred Geometry field
    float tot_dist = 0.0;
    float min_d = 1e4;
    vec3  hit_col = vec3( 0.0 );

    for ( int i = 0; i < 56; ++i )
    {
        vec3 p = ro + rd * tot_dist;

        // Apply slow dynamic inner rotation
        float cs_y = cos( t * 0.2 ), sn_y = sin( t * 0.2 );
        p.xz = mat2( cs_y, -sn_y, sn_y, cs_y ) * p.xz;

        float d = mapSacred( p, t, rBase );
        min_d = min( min_d, abs( d ) );

        if ( abs( d ) < 0.003 || tot_dist > 7.0 )
        {
            vec2 sample_uv = fract( p.xy * 0.3 + p.z * 0.2 + 0.5 );
            vec3 tex_col = img( sample_uv );
            vec3 pal = imgPalette( length( p ) * 0.4 + t * 0.1 );
            hit_col = mix( tex_col, pal, 0.5 ) * ( 0.8 + 0.5 * ( 1.0 - d ) );
            break;
        }

        tot_dist += max( 0.015, d * 0.7 );
    }

    // Volumetric glow along all sacred geometric edges
    // A sharper falloff and a palette tint instead of the old white
    // vec3(1.3,1.1,1.6)*2.5kick, which saturated into one glare pillar
    // whenever a torus tube sat edge-on to the camera.
    float glow = exp( -min_d * ( 26.0 + 10.0 * audioCentroid ) ) * glw;
    glow = min( glow, 0.85 );
    vec3 glow_tint = imgPalette( fract( 0.08 + min_d * 2.0 ) ) * glow * ( 0.9 + 0.9 * audioKick );

    // Background moiré interference field
    float moire = sin( length( uv ) * ( 35.0 + 20.0 * audioCentroid ) - t * 3.0 )
                  * cos( atan( uv.y, uv.x ) * 12.0 + t );
    vec3  bg_col = imgPalette( moire * 0.2 + 0.3 ) * ( 0.2 + 0.15 * audioLevel );

    vec3 final_col = mix( bg_col, hit_col, clamp( length( hit_col ), 0.0, 1.0 ) );
    final_col += glow_tint;

    // Center Merkaba flare
    float center_flare = exp( -length( uv ) * 4.5 ) * ( 0.8 + 1.5 * audioKick );
    final_col += imgPalette( 0.85 ) * center_flare;

    final_col = pow( final_col, vec3( 0.88 ) );
    fragColor = vec4( clamp( final_col, 0.0, 1.0 ), 1.0 );
}
