#version 330 core
out vec4 fragColor; ///< The pixel's colour (output).
/**
 * @file EinsteinRingGravitationalLens.frag
 * @brief EINSTEIN RING GRAVITATIONAL LENS: Relativistic gravitational lensing around
 * a massive rotating dark-matter singularity. Background photo textures are
 * warped into Einstein rings, arc mirages, and multiple relativistic images
 * with Doppler frequency shifts and gravitational wave metric ripples.
 *   audioAdvance -> rotates relativistic accretion and frame dragging
 *   audioKick    -> fires gravitational metric compression shockwaves
 *   audioSubBass -> expands Einstein radius and event horizon shadow
 *   audioChromaHue-> shifts relativistic Doppler color grading
 *
 * Per-activation variety:
 *   lensP   float Einstein ring deflection strength (0.5..2.2)
 *   massP   float central singularity mass scale    (0.5..2.0)
 *   speedP  float orbital frame dragging velocity  (0.5..2.0)
 *   hueP    float base chromatic palette offset     (0..6.28)
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

uniform float lensP;  ///< Lens knob, 0..1.
uniform float massP;  ///< Mass knob: central singularity mass scale, 0.5..2.
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


/**  House tint: bend a colour toward the photo palette while keeping its luminance -- the identity look survives,
 * only the hue follows the photos.
 *
 * @param c  The colour. (in)
 * @param t  Position on the palette, 0..1. (in)
 * @param k  Strength of the tint, 0..1. (in)
 *
 * @return
 *   The tinted colour.
 **/
vec3 palTint( vec3 c, float t, float k )
{
    vec3 tp = imgPalette( t );
    tp *= dot( c, vec3( 0.3333 ) ) / max( dot( tp, vec3( 0.3333 ) ), 1e-3 );
    return mix( c, tp, k );
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

/** Entry point of this shader stage (the file description says what it draws). */
void main()
{
    float lns = ( lensP > 0.0 ) ? lensP : 1.0;
    float mss = ( massP > 0.0 ) ? massP : 1.0;
    float spd = ( speedP > 0.0 ) ? speedP : 1.0;
    float hue = ( hueP > 0.0 ) ? hueP : 0.0;

    vec2 uv = ( gl_FragCoord.xy - 0.5 * resolution ) / resolution.y;
    vec2 st = gl_FragCoord.xy / resolution;

    float t = time * 0.3 * spd + audioAdvance * 0.15;

    // Lens center with slow gravitational drift
    vec2  lens_center = vec2( sin( t * 0.4 ) * 0.18, cos( t * 0.3 ) * 0.12 );
    vec2  rel = uv - lens_center;
    float r = length( rel );
    float angle = atan( rel.y, rel.x );

    // Einstein radius with audio swell & mass
    float r_einstein = ( 0.32 + 0.12 * audioSwell + 0.08 * audioSubBass ) * lns * sqrt( mss );
    // The frame is only 0.5 uv units tall from the centre: past ~0.42 the
    // luminous ring leaves the picture and the shadow disc below swallows
    // everything (the recording showed exactly that -- an 85%-black frame).
    r_einstein = min( r_einstein, 0.40 );

    // Gravitational wave metric ripples on kick
    float gw_ripple = sin( r * 35.0 - t * 8.0 ) * exp( -r * 3.0 ) * audioKick * 0.08;

    // Relativistic light deflection formula: alpha(r) = 4GM / r
    // Deflection angle theta_source = theta - r_einstein^2 / theta
    float defl_factor = ( r_einstein * r_einstein ) / max( r * r + 0.002, 0.001 );
    vec2  warped_rel = rel * ( 1.0 - defl_factor ) + rel * gw_ripple;

    // Frame dragging swirl near the photon sphere
    float frame_drag = ( 0.25 * mss ) / ( r * r * r * 8.0 + 1.0 );
    warped_rel = rot2D( frame_drag * ( 1.0 + audioBass * 1.5 ) ) * warped_rel;

    // Reconstruct texture coordinate
    vec2 photo_uv = ( warped_rel * resolution.y + 0.5 * resolution ) / resolution;
    // Langsame Hintergrund-Drift: das gelinste Feld zieht vorbei.
    photo_uv += vec2( t * 0.03, t * 0.012 );
    photo_uv = fract( photo_uv );

    vec3 photo = img( photo_uv );

    // WANDERNDER QUASAR hinter der Linse: er laeuft im Orbit und wird durch
    // das GEWARPTE Feld gezeichnet -- die Linse zerlegt ihn in wandernde
    // Bogen und Mehrfachbilder.
    vec2  src_pos = vec2( sin( t * 0.23 ), cos( t * 0.31 ) ) * 0.45;
    float src_d = length( warped_rel - src_pos );
    vec3  quasar = max( imgPalette( 0.82 ), vec3( 0.85, 0.75, 0.55 ) )
                   * exp( -src_d * src_d * 700.0 ) * ( 1.8 + 1.2 * audioSwell );

    // Einstein ring luminous photon ring glow
    float ring_dist = abs( r - r_einstein );
    float ring_glow = exp( -ring_dist * 45.0 / lns ) * ( 1.2 + audioKick * 2.5 + audioMid );

    // Relativistic Doppler beaming across azimuthal angle
    float doppler = 1.0 + 0.45 * sin( angle + t * 2.0 );
    vec3 doppler_color = palTint( mix( vec3( 0.1, 0.7, 1.0 ), vec3( 1.0, 0.3, 0.1 ), clamp( doppler * 0.5, 0.0, 1.0 ) ),
                                  0.30 * clamp( doppler * 0.5, 0.0, 1.0 ), 0.22 );

    // Event horizon shadow at the core
    float horizon_r = min( r_einstein * 0.35 * mss, 0.14 );
    float shadow = smoothstep( horizon_r * 0.8, horizon_r * 1.2, r );

    // Combine visualizer
    vec3 col = photo * ( 0.8 + 0.4 * audioLevel ) * shadow;
    col += quasar * shadow;
    col += ring_glow * doppler_color * ( 0.9 + audioHigh * 1.2 );

    // Accretion disk inner ring glints
    float inner_r = abs( r - horizon_r * 1.4 );
    float inner_glow = exp( -inner_r * 30.0 ) * ( audioSubBass * 1.8 + audioKick * 1.5 );
    col += inner_glow * vec3( 1.0, 0.85, 0.4 );

    // Chroma rotation
    if ( audioChromaHue != 0.0 )
        if ( hue > 0.001 )
            col = hueRot( col, hue );

    // Subtle edge vignette
    float vig = smoothstep( 1.4, 0.4, length( uv ) );
    col *= vig;

    fragColor = vec4( col, 1.0 );
}
