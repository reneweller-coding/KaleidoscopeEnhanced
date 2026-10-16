#version 330 core
out vec4 fragColor; ///< The pixel's colour (output).
/**
 * @file FerrofluidHexMatrix.frag
 * @brief FERROFLUID HEX MATRIX: Raymarched magnetic liquid ferrofluid pool rising
 * into sharp Rosensweig instability cone spikes in a dynamic hexagonal
 * magnetic lattice, with viscous fluid vortex advection, oily rainbow
 * thin-film sheen, and audio-reactive magnetic field flux.
 */

uniform vec2      resolution;    ///< Size of the render target in pixels.
uniform float     time;          ///< Seconds since the program started (never reset; see sceneTime).
uniform sampler2D tex0;          ///< The current photo.
uniform sampler2D tex1;          ///< The next photo (cross-faded in by interpolation).
uniform float     interpolation; ///< Cross-fade between the photos: 1 = tex0, 0 = tex1.

uniform float audioPhase;        ///< Rotation phase driven by the music (integrated, never jumps).
uniform float audioAdvance;      ///< The music's advance: integrated tempo-weighted energy (never jumps, never runs
                                 ///< backwards).
uniform float audioSwell;        ///< Slow loudness envelope, 0..1 (seconds).
uniform float audioLevel;        ///< Overall loudness, 0..1.
uniform float audioKick;         ///< Kick-drum envelope, 0..1 (fast attack, short decay).
uniform float audioCentroid;     ///< Spectral centroid (brightness of the sound), 0..1.
uniform float audioValence;      ///< Mood valence: 0 dark .. 1 bright.
uniform float audioSubBass;      ///< Sub-bass band level, 0..1.
uniform float audioBass;         ///< Bass band level, 0..1.
uniform float audioMid;          ///< Mid band level, 0..1.
uniform float audioHigh;         ///< High band level, 0..1.
uniform float audioFlux;         ///< Spectral flux (how fast the spectrum changes), 0..1.
uniform float audioChromaHue;    ///< Hue of the dominant pitch class (radians, unwrapped: continuous).
uniform float audioSpectrum[32]; ///< Spectrum bands, 0..1.

uniform float spikeP;
uniform float viscosityP;
uniform float speedP; ///< Speed knob, 0..1.
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

/**  IMG-PALETTE (house standard, replaces the generic cos-rainbow): colours come from a rotating arc in the CURRENT
 * slideshow image, so every activation inherits a fresh palette from the photos, and the arc follows the musical
 * key (chromaHue is circular-slewed = jump-free) with a slow advance drift.
 *
 * @param t  Position on the palette arc, 0..1 for one turn. (in)
 *
 * @return
 *   The palette colour (RGB).
 *
 * Valence shapes saturation toward the mood.
 **/
vec3 imgPalette( float t )
{
    float ang = audioChromaHue + audioAdvance * 0.04 + t * 6.2831853;
    float rad = 0.16 + 0.08 * sin( audioAdvance * 0.013 );
    vec3  col = img( clamp( vec2( 0.5 ) + rad * vec2( cos( ang ), sin( ang ) ), 0.0, 1.0 ) );
    float g = dot( col, vec3( 0.333 ) );
    return mix( vec3( g ), col, 0.55 + 0.45 * audioValence );
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

/**  Hexagonal tiling coordinate helper
 *
 * @param p  The point. (in)
 *
 * @return
 *   Offset from the cell centre (xy) and the cell id (zw).
 **/
vec4 hexGrid( vec2 p )
{
    vec2 s = vec2( 1.0, 1.7320508 );
    vec4 h_c = floor( vec4( p, p - vec2( 0.5, 1.0 ) ) / s.xyxy ) + 0.5;
    vec4 h = vec4( p - h_c.xy * s, p - ( h_c.zw + 0.5 ) * s );
    return ( dot( h.xy, h.xy ) < dot( h.zw, h.zw ) ) ? vec4( h.xy, h_c.xy ) : vec4( h.zw, h_c.zw + vec2( 0.5, 0.5 ) );
}

/**  Ferrofluid heightfield & distance function
 *
 * @param p     The point. (in)
 * @param spk   Spike knob. (in)
 * @param visc  Viscosity knob. (in)
 *
 * @return
 *   The distance to the nearest surface.
 **/
float mapFerrofluid( vec3 p, float spk, float visc )
{
    vec2 xz = p.xz;

    // Vortex swirl advection
    float r = length( xz );
    float angle = atan( xz.y, xz.x ) + ( time * 0.4 + audioAdvance * 0.2 ) / ( r * 0.8 + 1.0 );
    vec2  swirled = vec2( cos( angle ), sin( angle ) ) * r;

    // Hexagonal magnetic spike lattice
    vec4 h = hexGrid( swirled * 1.6 );
    vec2 hex_center = h.zw;
    vec2 local_pos = h.xy;

    // Hash for per-cell magnetic pulse
    float cell_hash = fract( sin( dot( hex_center, vec2( 127.1, 311.7 ) ) ) * 43758.5453 );
    int   spec_idx = int( clamp( cell_hash * 31.0, 0.0, 31.0 ) );
    float band_energy = audioSpectrum[spec_idx];

    // Rosensweig cone shape
    float local_r = length( local_pos );
    float spike_height = ( 0.6 + 1.2 * band_energy + 0.8 * audioBass ) * spk;

    // Kick geyser pulse
    spike_height += exp( -abs( r - fract( time * 0.7 ) * 4.0 ) * 4.0 ) * audioKick * 1.5;

    float cone = exp( -local_r * 5.0 * visc ) * spike_height;

    // Fluid base ripples
    float ripple = sin( r * 8.0 - time * 4.0 ) * 0.06 * ( 0.5 + 0.5 * audioMid );

    float height = cone + ripple - 0.4;
    return p.y - height;
}

/**  Surface normal of the distance field by central differences.
 *
 * @param p     The surface point. (in)
 * @param spk   Spike knob. (in)
 * @param visc  Viscosity knob. (in)
 *
 * @return
 *   The unit normal.
 **/
vec3 calcNormal( vec3 p, float spk, float visc )
{
    vec2 e = vec2( 0.005, 0.0 );
    return normalize( vec3(
        mapFerrofluid( p + e.xyy, spk, visc ) - mapFerrofluid( p - e.xyy, spk, visc ),
        mapFerrofluid( p + e.yxy, spk, visc ) - mapFerrofluid( p - e.yxy, spk, visc ),
        mapFerrofluid( p + e.yyx, spk, visc ) - mapFerrofluid( p - e.yyx, spk, visc ) ) );
}

/** Entry point of this shader stage (the file description says what it draws). */
void main()
{
    float spk = ( spikeP > 0.0 ) ? spikeP : 1.0;
    float visc = ( viscosityP > 0.0 ) ? viscosityP : 1.0;
    float spd = ( speedP > 0.0 ) ? speedP : 1.0;
    float hue = ( hueP > 0.0 ) ? hueP : 0.0;

    vec2 uv = ( gl_FragCoord.xy - 0.5 * resolution ) / resolution.y;

    // Camera setup - looking down into magnetic pool
    float cam_angle = time * 0.25 * spd;
    vec3  ro = vec3( cos( cam_angle ) * 3.8, 2.8, sin( cam_angle ) * 3.8 );
    vec3  ta = vec3( 0.0, 0.0, 0.0 );
    vec3  ww = normalize( ta - ro );
    vec3  uu = normalize( cross( ww, vec3( 0.0, 1.0, 0.0 ) ) );
    vec3  vv = cross( uu, ww );
    vec3  rd = normalize( uv.x * uu + uv.y * vv + 1.4 * ww );

    float t = 0.0;
    for ( int i = 0; i < 70; ++i )
    {
        vec3  p = ro + rd * t;
        float d = mapFerrofluid( p, spk, visc );
        if ( d < 0.002 || t > 15.0 )
            break;
        t += d * 0.65;
    }

    vec3 col = vec3( 0.01, 0.01, 0.02 );

    if ( t < 15.0 )
    {
        vec3 p = ro + rd * t;
        vec3 n = calcNormal( p, spk, visc );
        vec3 ref = reflect( rd, n );

        // Magnetic laboratory lighting
        vec3 light_pos1 = vec3( 2.0, 5.0, 2.0 );
        vec3 light_pos2 = vec3( -3.0, 4.0, -2.0 );
        vec3 l1 = normalize( light_pos1 - p );
        vec3 l2 = normalize( light_pos2 - p );

        float diff1 = max( dot( n, l1 ), 0.0 );
        float diff2 = max( dot( n, l2 ), 0.0 );
        float spec1 = pow( max( dot( reflect( -l1, n ), -rd ), 0.0 ), 48.0 );
        float spec2 = pow( max( dot( reflect( -l2, n ), -rd ), 0.0 ), 32.0 );
        float fresnel = pow( 1.0 - max( dot( -rd, n ), 0.0 ), 4.0 );

        // Oily rainbow thin-film sheen
        vec3 oil_sheen = imgPalette( ( ( p.x + p.z ) * 4.0 + fresnel * 6.0 + audioPhase ) * 0.159 );

        // Reflection of photo texture
        vec2 ref_uv = ref.xz * 0.3 + 0.5;
        vec3 photo_ref = img( fract( ref_uv ) );

        // Jet-black ferrofluid base color with specular glints
        vec3 fluid_base = vec3( 0.04, 0.04, 0.05 ) + photo_ref * 0.15;
        col = fluid_base * ( diff1 * 0.5 + diff2 * 0.3 + 0.2 );
        col += ( vec3( 1.0 ) * spec1 + vec3( 0.7, 0.9, 1.0 ) * spec2 ) * ( 0.8 + 0.5 * audioHigh );
        col += oil_sheen * fresnel * ( 0.6 + 0.8 * audioLevel );

        // Glow on spike crests
        float spike_tip = smoothstep( 0.5, 1.5, p.y );
        col += vec3( 0.1, 0.5, 1.0 ) * spike_tip * ( 0.4 + 1.2 * audioKick );

        // Fog
        col = mix( col, vec3( 0.01, 0.01, 0.02 ), 1.0 - exp( -t * 0.1 ) );
    }

    col = hueRot( col, hue ); // chromaHue handled inside imgPalette
    col = pow( col, vec3( 0.9 ) );

    fragColor = vec4( col, 1.0 );
}
