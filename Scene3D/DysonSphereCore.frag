#version 330 core
/*****************************************************************************\
 *                              DysonSphereCore.frag
\*****************************************************************************/
/*! @file
 *
 *  @brief
 *  DYSON SPHERE CORE: Huge panels and spires of a megastructure surrounding a central star.
 *
 *  The geometry is built from instances, and shaded with intricate tech patterns and emissive energy lines.
 *
 *    audioAdvance -> rotation of the structure and camera travel
 *    audioKick    -> flashes from energy conduits
 *    audioSwell   -> ambient illumination and star brightness
 *    audioChromaHue-> color palette follows the musical key
 *
 *  Per-activation variety:
 *    panelP float panel density/size (0.7..1.5)
 *    energyP float brightness of energy lines (0.6..1.8)
 *    hueP float palette offset (0..6.28)
 *
 *  @author René Weller
 */
out vec4 fragColor; ///< The pixel's colour (output).

uniform float time;           ///< Seconds since the program started (never reset; see sceneTime).
uniform float audioAdvance;   ///< The music's advance: integrated tempo-weighted energy (never jumps, never runs
                              ///< backwards).
uniform float audioKick;      ///< Kick-drum envelope, 0..1 (fast attack, short decay).
uniform float audioSwell;     ///< Slow loudness envelope, 0..1 (seconds).
uniform float audioChromaHue; ///< Hue of the dominant pitch class (radians, unwrapped: continuous).
uniform float audioValence;   ///< Mood valence: 0 dark .. 1 bright.
uniform float audioLevel;     ///< Overall loudness, 0..1.

uniform sampler2D tex0;          ///< The current photo.
uniform sampler2D tex1;          ///< The next photo (cross-faded in by interpolation).
uniform float     interpolation; ///< Cross-fade between the photos: 1 = tex0, 0 = tex1.

uniform float panelP;  ///< Panel knob: panel density/size (0.7..1.5).
uniform float energyP; ///< Energy knob: brightness of energy lines (0.6..1.8).
uniform float hueP;    ///< Hue knob (radians), usually the music's chroma hue plus a rolled offset.

in vec4 vCol;    ///< Colour (from the vertex stage).
in vec3 vCorner; ///< Corner (from the vertex stage).
in vec3 vPos;    ///< Position (from the vertex stage).
in vec3 vNormal; ///< Surface normal (from the vertex stage).

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

/**  Tech pattern for panels
 *
 * @param uv  Coordinate on the panel. (in)
 *
 * @return
 *   The pattern, 0..1.
 **/
float techPattern( vec2 uv )
{
    uv *= 5.0;
    vec2  id = floor( uv );
    vec2  f = fract( uv );
    float h = fract( sin( dot( id, vec2( 12.9898, 78.233 ) ) ) * 43758.5453 );

    // Split into smaller grids
    if ( h > 0.5 )
    {
        uv *= 2.0;
        id = floor( uv );
        f = fract( uv );
        h = fract( sin( dot( id, vec2( 34.12, 12.33 ) ) ) * 43758.5453 );
    }

    float edge = step( 0.1, f.x ) * step( f.x, 0.9 ) * step( 0.1, f.y ) * step( f.y, 0.9 );
    return edge * ( 0.5 + 0.5 * h );
}

/** Entry point of this shader stage (the file description says what it draws). */
void main()
{
    float pp = ( panelP > 0.01 ? panelP : 1.0 );
    float ep = ( energyP > 0.01 ? energyP : 1.0 );
    float hue = ( hueP > 0.01 ? hueP : 0.0 );

    vec3 n = normalize( vNormal );

    // Fake a central star light
    vec3  light_dir = normalize( vec3( 0.0 ) - vPos );
    float dif = max( dot( n, light_dir ), 0.0 );
    float fill = 0.5 + 0.5 * dot( n, vec3( 0.0, 1.0, 0.0 ) );

    vec3 albedo = vec3( 0.2, 0.22, 0.25 );

    // Map uv based on normal for triplanar-ish mapping
    vec2 uv = vec2( 0.0 );
    if ( abs( n.x ) > 0.5 )
        uv = vPos.yz;
    else if ( abs( n.y ) > 0.5 )
        uv = vPos.xz;
    else
        uv = vPos.xy;

    float pat = techPattern( uv * pp );
    albedo *= 0.5 + 0.5 * pat;

    vec3 energy_color = imgPalette( 0.8 + 0.1 * audioKick );
    vec3 panel_color = imgPalette( 0.2 );

    vec3 col = albedo * ( 0.1 + dif * ( 1.0 + audioSwell ) ) * panel_color;
    col += albedo * fill * 0.2;

    // Energy lines in the cracks
    float energy_lines = step( pat, 0.1 ) * fract( sin( vCol.w * 100.0 ) * 43758.5 );
    energy_lines *= smoothstep( 0.0, 0.2, sin( uv.x * 2.0 + time * 2.0 + audioAdvance * 5.0 ) );

    col += energy_color * energy_lines * ( 1.5 + 3.0 * audioKick ) * ep;

    // Central star glow on the panels (atmospheric/corona scattering)
    float dist_to_center = length( vPos );
    float corona = exp( -dist_to_center * 0.02 ) * ( 1.0 + audioSwell * 0.5 );
    col += imgPalette( 0.5 ) * corona * 0.5;

    // Fade into distance, matched to where the panels ACTUALLY are.
    //
    // Two wrong ranges before this one, both from wrong assumptions about the
    // distribution.  40..140 spanned the whole visible shell (mean fade 0.65).
    // 90..140 assumed the three mod() wraps scatter the panels uniformly
    // through a 300-cube -- but world.x and world.y are already inside
    // [-150,150] on the shell, so those two wraps do nothing: only z moves.
    // The real distances are median 150, 10th percentile 98, 90th 188, max
    // 212, and 90..140 left 68 % of them more than nine tenths faded.
    //
    // 150..270 puts two thirds of the panels in the clear, fades the far side
    // of the shell for depth, and never erases anything outright.
    float dist = length( vPos );
    float fog = clamp( ( dist - 150.0 ) / 120.0, 0.0, 1.0 );
    col = mix( col, vec3( 0.0 ), fog );

    if ( hue > 0.001 )
        col = hueRot( col, 0.2 * sin( hue ) );

    vec3 cat_tone = max( col, 0.0 );
    cat_tone /= 1.0 + 0.35 * max( cat_tone.r, max( cat_tone.g, cat_tone.b ) );
    fragColor = vec4( clamp( cat_tone, 0.0, 1.0 ), 1.0 );
}
