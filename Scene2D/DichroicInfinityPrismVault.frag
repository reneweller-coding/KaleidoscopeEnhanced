#version 330 core
out vec4 fragColor; ///< The pixel's colour (output).
/**
 * @file DichroicInfinityPrismVault.frag
 * @brief DICHROIC INFINITY PRISM VAULT: Raymarched infinite mirror chamber of
 * dichroic glass prisms and cubic beam-splitters. RGB spectral dispersion,
 * total internal reflection (TIR), multi-bounce optical caustics, and
 * continuous kaleidoscopic photo refraction.
 *   audioAdvance -> navigates camera through the infinite prism vault
 *   audioKick    -> flashes total internal reflection facet edges & glints
 *   audioBass    -> pulses dichroic thin-film transmission wavelength
 *   audioChromaHue-> shifts spectral dispersion prism angles
 *
 * Per-activation variety:
 *   prismP      float prism lattice density & facet scale (0.5..2.2)
 *   dispersionP float chromatic RGB separation spread     (0.5..2.2)
 *   speedP      float camera traversal velocity           (0.5..2.0)
 *   hueP        float dichroic filter base hue offset     (0..6.28)
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

uniform float prismP;
uniform float dispersionP;
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
    float prs = ( prismP > 0.0 ) ? prismP : 1.0;
    float dsp = ( dispersionP > 0.0 ) ? dispersionP : 1.0;
    float spd = ( speedP > 0.0 ) ? speedP : 1.0;
    float hue = ( hueP > 0.0 ) ? hueP : 0.0;

    vec2 uv = ( gl_FragCoord.xy - 0.5 * resolution ) / resolution.y;
    vec2 st = gl_FragCoord.xy / resolution;

    float t = time * 0.3 * spd + audioAdvance * 0.15;

    // Raymarching camera through infinite prism vault
    // Fluss halbiert (Nutzer: "zu schnell").
    vec3 ro = vec3( t * 0.7, sin( t * 0.5 ) * 0.4, cos( t * 0.4 ) * 0.4 );
    vec3 rd = normalize( vec3( uv, 1.2 ) ); // Kick-FOV-Pumpen entfernt

    rd.yz = rot2D( sin( t * 0.3 ) * 0.3 ) * rd.yz;
    rd.xy = rot2D( t * 0.1 ) * rd.xy;

    vec3  p = ro;
    float edge_accum = 0.0;
    float bounce_count = 0.0;
    vec2  uv_sample = vec2( 0.0 );

    for ( int i = 0; i < 42; ++i )
    {
        p += rd * 0.07;

        // Infinite cubic / octahedral prism lattice
        vec3 cell_p = fract( p * 0.8 * prs ) - 0.5;
        vec3 abs_p = abs( cell_p );

        // Chamfered prism edges & corner cuts
        float box_dist = max( max( abs_p.x, abs_p.y ), abs_p.z ) - 0.35;
        float oct_dist = ( abs_p.x + abs_p.y + abs_p.z - 0.55 ) * 0.577;
        float prism_dist = max( box_dist, oct_dist );

        if ( prism_dist < 0.05 )
        {
            // Prism edge glow
            float edge = exp( -abs( prism_dist ) * 35.0 );
            edge_accum += edge * 0.05;
            bounce_count += 1.0;

            // Optical refraction reflection bounce
            vec3 n = normalize( cell_p );
            rd = reflect( rd, n );
            uv_sample = fract( cell_p.xy * 2.0 + 0.5 );
        }
    }

    // Chromatic RGB dispersion sampling
    float disp_spread = 0.02 * dsp * ( 1.0 + audioKick * 0.8 );
    vec3  photo_r = img( fract( st + vec2( disp_spread, 0.0 ) ) );
    vec3  photo_g = img( fract( st ) );
    vec3  photo_b = img( fract( st - vec2( disp_spread, 0.0 ) ) );
    vec3  photo = vec3( photo_r.r, photo_g.g, photo_b.b );

    // Dichroic thin-film interference colors (cyan, magenta, gold)
    vec3 dichroic = imgPalette( ( bounce_count * 0.4 + audioPhase ) * 0.159 );

    // Diamond specular glints on kick
    // Kompakter Zentrums-Glint statt des bildschirmbreiten weissen Kreuzes.
    float glint = exp( -( abs( uv.x ) + abs( uv.y ) ) * 6.0 ) * ( audioKick * 1.5 + audioHigh * 0.6 );

    // Combine visualizer
    vec3 col = mix( photo * 0.85, dichroic, 0.45 + 0.2 * audioSwell );
    col += edge_accum * vec3( 0.3, 0.9, 1.0 ) * ( 1.2 + audioKick * 2.5 );
    col += glint * vec3( 1.0, 0.98, 0.9 );

    if ( audioChromaHue != 0.0 )
        if ( hue > 0.001 )
            col = hueRot( col, hue );

    // Vignette
    float vig = smoothstep( 1.3, 0.35, length( uv ) );
    col *= vig;

    // Catalogue review: soft-knee exposure — hot audio compresses
    // instead of clipping the whole frame to white.
    vec3 cat_tone = ( col ) * 0.65;
    cat_tone /= 1.0 + 0.35 * max( cat_tone.r, max( cat_tone.g, cat_tone.b ) );
    fragColor = vec4( cat_tone, 1.0 );
}
