#version 330 core
/*****************************************************************************\
 *                              PrismaticCrystalChamber.frag
\*****************************************************************************/
/*! @file
 *
 *  @brief
 *  PRISMATIC CRYSTAL CHAMBER: 100% viewport-filling infinity mirror room of faceted quartz crystals and dichroic
 *  glass prisms.
 *
 *  The loaded photo is reflected across multiple internal total-reflection bounces with chromatic dispersion,
 *  diamond facet sparkling, and kaleidoscopic symmetry.
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
uniform float audioSubBass;   ///< Sub-bass band level, 0..1.
uniform float audioBass;      ///< Bass band level, 0..1.
uniform float audioMid;       ///< Mid band level, 0..1.
uniform float audioHigh;      ///< High band level, 0..1.
uniform float audioFlux;      ///< Spectral flux (how fast the spectrum changes), 0..1.
uniform float audioChromaHue; ///< Hue of the dominant pitch class (radians, unwrapped: continuous).

uniform float facetP;      ///< Facet knob, 0.5..2.
uniform float dispersionP; ///< Dispersion knob, 0.5..2.2.
uniform float speedP;      ///< Speed knob, 0..1.
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

/**  Pseudo-random number 0..1 from a 2D point.
 *
 * @param p  The point. (in)
 *
 * @return
 *   A pseudo-random number 0..1.
 **/
float hash21( vec2 p )
{
    p = fract( p * vec2( 123.34, 345.45 ) );
    p += dot( p, p + 34.345 );
    return fract( p.x * p.y );
}

/** Entry point of this shader stage (the file description says what it draws). */
void main()
{
    float fct = ( facetP > 0.0 ) ? facetP : 1.0;
    float disp = ( dispersionP > 0.0 ) ? dispersionP : 1.0;
    float spd = ( speedP > 0.0 ) ? speedP : 1.0;
    float hue = ( hueP > 0.0 ) ? hueP : 0.0;

    vec2 uv = ( gl_FragCoord.xy - 0.5 * resolution ) / resolution.y;

    float t = time * 0.3 * spd + audioAdvance * 0.2;

    // Ray setup inside crystal mirror room
    vec3 ro = vec3( sin( t * 0.5 ) * 0.8, cos( t * 0.4 ) * 0.6, -2.5 );
    vec3 rd = normalize( vec3( uv, 1.4 ) );

    // Dynamic rotation of crystal chamber mirrors
    float rot_angle = t * 0.4 + audioPhase * 0.15;
    float cr = cos( rot_angle ), sr = sin( rot_angle );
    rd.xy = vec2( rd.x * cr - rd.y * sr, rd.x * sr + rd.y * cr );

    vec3  col = vec3( 0.0 );
    vec3  cur_p = ro;
    vec3  cur_dir = rd;
    float throughput = 1.0;

    // Multi-bounce crystal reflection trace
    for ( int bounce = 0; bounce < 4; ++bounce )
    {
        // Intersect bounding crystal facet box / polyhedron
        vec3  box_size = vec3( 1.4, 1.4, 1.4 ) * ( 1.0 + 0.2 * sin( audioAdvance * 0.1 ) );
        vec3  t1 = ( -box_size - cur_p ) / cur_dir;
        vec3  t2 = ( box_size - cur_p ) / cur_dir;
        vec3  t_max = max( t1, t2 );
        float dist = min( min( t_max.x, t_max.y ), t_max.z );

        cur_p += cur_dir * dist;

        // Facet normal calculation
        vec3 normal = vec3( 0.0 );
        if ( abs( cur_p.x - box_size.x ) < 1e-3 )
            normal = vec3( -1.0, 0.0, 0.0 );
        else if ( abs( cur_p.x + box_size.x ) < 1e-3 )
            normal = vec3( 1.0, 0.0, 0.0 );
        else if ( abs( cur_p.y - box_size.y ) < 1e-3 )
            normal = vec3( 0.0, -1.0, 0.0 );
        else if ( abs( cur_p.y + box_size.y ) < 1e-3 )
            normal = vec3( 0.0, 1.0, 0.0 );
        else if ( abs( cur_p.z - box_size.z ) < 1e-3 )
            normal = vec3( 0.0, 0.0, -1.0 );
        else
            normal = vec3( 0.0, 0.0, 1.0 );

        // Facet bevel displacement
        vec2 facet_uv = ( normal.x != 0.0 ) ? cur_p.yz : ( ( normal.y != 0.0 ) ? cur_p.xz : cur_p.xy );
        facet_uv *= 2.5 * fct;
        vec2 facet_cell = floor( facet_uv );
        vec2 facet_f = fract( facet_uv ) - vec2( 0.5 );

        // Perturb normal along crystal facet bevels
        normal = normalize( normal + vec3( facet_f * 0.4, 0.0 ) );

        // Sample photo with chromatic dispersion (RGB channel offset)
        vec2  sample_uv = facet_uv * 0.25 + vec2( 0.5 ) + vec2( float( bounce ) * 0.1 );
        float disp_amt = 0.02 * disp * ( 1.0 + 0.5 * audioKick );

        vec3 photo_r = img( fract( sample_uv + vec2( disp_amt, 0.0 ) ) );
        vec3 photo_g = img( fract( sample_uv ) );
        vec3 photo_b = img( fract( sample_uv - vec2( disp_amt, 0.0 ) ) );
        vec3 photo_sample = vec3( photo_r.r, photo_g.g, photo_b.b );

        // Dichroic glass transmission & reflection color
        vec3 dichroic_col = imgPalette( ( float( bounce ) * 1.5 + audioPhase ) * 0.159 );

        // Sparkling diamond glints on facet vertices
        float glint_hash = hash21( facet_cell + float( bounce ) * 17.0 );
        float glint = pow( max( dot( reflect( cur_dir, normal ), normalize( vec3( 0.5, 0.8, -0.6 ) ) ), 0.0 ), 48.0 );
        glint *= ( 1.0 + 1.2 * audioHigh * glint_hash ); // ohne Blink-Gate

        // EDGE FADE: when a bounce changes from one wall to the neighbouring one,
        // its crop of the photo jumps -- so near the edge its share is faded out,
        // and the hard change of texture becomes a cross-fade.
        vec3  an = abs( cur_p ) / box_size;
        float second = max( min( an.x, an.y ), min( max( an.x, an.y ), an.z ) );
        float edge_w = smoothstep( 1.0, 0.86, second );
        col += ( photo_sample * dichroic_col * 1.4 + vec3( 1.0 ) * glint * 2.0 )
               * throughput * edge_w;

        // Next bounce reflection
        cur_dir = reflect( cur_dir, normal );
        throughput *= 0.65;
    }

    col = hueRot( col, hue );       // chromaHue handled inside imgPalette
    col = pow( col, vec3( 0.88 ) ); // Contrast boost
    col += vec3( 0.03, 0.02, 0.06 ) * audioSwell;

    fragColor = vec4( col, 1.0 );
}
