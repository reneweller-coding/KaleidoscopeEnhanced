#version 330 core
/*****************************************************************************\
 *                              Physarum.frag
\*****************************************************************************/
/*! @file
 *
 *  @brief
 *  The living Physarum (slime mould) vein network, simulated on the GPU (see
 *  `Engine/PhysarumAgents`/`PhysarumDeposit`/`PhysarumDiffuse`) and exposed on "texPhysarum": 65k agents lay and
 *  follow pheromone trails, so glowing veins grow, merge and constantly rebuild — one of the most organic images a
 *  computer can make.
 *
 *  Two species live in R and G; here they get warm/cool hues around the musical key, the veins are lit like
 *  embossed relief, and the picture is stained through the strongest lanes.  Kicks scatter the swarm in the SIM
 *  (the network visibly explodes and re-forms).
 *
 *  @author René Weller
 */
out vec4 fragColor; ///< The pixel's colour (output).

uniform vec2      resolution;    ///< Size of the render target in pixels.
uniform float     time;          ///< Seconds since this activation, plus a rolled start (see sceneTime).
uniform sampler2D tex0;          ///< The current photo.
uniform sampler2D tex1;          ///< The next photo (cross-faded in by interpolation).
uniform sampler2D texPhysarum;   ///< trail map (R/G = species pheromone)
uniform float     interpolation; ///< Cross-fade between the photos: 1 = tex0, 0 = tex1.

uniform float audioBeat;      ///< Beat envelope, 0..1.
uniform float audioOnset;     ///< Onset envelope (any instrument), 0..1.
uniform float audioPhase;     ///< Rotation phase driven by the music (integrated, never jumps).
uniform float audioSwell;     ///< Slow loudness envelope, 0..1 (seconds).
uniform float audioChromaHue; ///< Hue of the dominant pitch class (radians, unwrapped: continuous).
uniform float audioDrop;      ///< Drop envelope: high after a detected drop, decaying.
uniform float audioLevel;     ///< Overall loudness, 0..1.

// Per-activation variety:
uniform int   sidesP; ///< kaleido fold (0/1 off; 2..8)
uniform float zoomP;  ///< field zoom (0 -> 1.0; 0.7..1.6)

const float Pi = 3.14159265358979; ///< Pi.

/**  2D rotation matrix.
 *
 * @param a  The angle in radians. (in)
 *
 * @return
 *   The rotation matrix.
 **/
mat2 rot( float a )
{
    float c = cos( a ), s = sin( a );
    return mat2( c, -s, s, c );
}
/**  The photo at a coordinate: the cross-fade of tex0 and tex1.
 *
 * @param uv  Coordinate in the photo, 0..1. (in)
 *
 * @return
 *   The cross-faded photo colour (RGB).
 **/
vec3 img( vec2 uv )
{
    return ( interpolation * texture( tex0, uv )
             + ( 1.0 - interpolation ) * texture( tex1, uv ) )
        .rgb;
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
/**  Kaleidoscope fold of the coordinate with the given mirrors.
 *
 * @param p      The coordinate (centred). (in)
 * @param sides  Number of mirrors. (in)
 *
 * @return
 *   The folded coordinate.
 **/
vec2 kaleido( vec2 p, float sides )
{
    float a = atan( p.y, p.x );
    float r = length( p );
    float seg = Pi / sides;
    a = mod( a + Pi, 2.0 * seg ) - seg;
    a = abs( a );
    return vec2( cos( a ), sin( a ) ) * r;
}

/** Entry point of this shader stage (the file description says what it draws). */
void main()
{
    vec2  uv = gl_FragCoord.xy / resolution;
    float zoom_v = ( zoomP <= 0.01 ) ? 1.0 : zoomP;

    vec2 suv;
    if ( sidesP >= 2 )
    {
        vec2 cp = ( gl_FragCoord.xy - 0.5 * resolution ) / resolution.y;
        cp = rot( time * 0.012 + audioPhase * 0.04 ) * cp;
        suv = kaleido( cp, float( sidesP ) ) * 0.8 * zoom_v + 0.5;
    }
    else
        suv = ( uv - 0.5 ) * zoom_v + 0.5
              + 0.015 * vec2( sin( uv.y * 5.0 + audioPhase * 0.2 ), cos( uv.x * 5.0 + audioPhase * 0.2 ) );

    vec2 tr = texture( texPhysarum, suv ).rg;

    // Relief lighting from the trail gradient (embossed living veins).
    vec2  px = vec2( 2.0 / 512.0 );
    float h_c = tr.r + tr.g;
    float h_x = texture( texPhysarum, suv + vec2( px.x, 0.0 ) ).r
                + texture( texPhysarum, suv + vec2( px.x, 0.0 ) ).g - h_c;
    float h_y = texture( texPhysarum, suv + vec2( 0.0, px.y ) ).r
                + texture( texPhysarum, suv + vec2( 0.0, px.y ) ).g - h_c;
    vec3  n = normalize( vec3( -h_x * 8.0, -h_y * 8.0, 1.0 ) );
    float diff = max( dot( n, normalize( vec3( 0.4, 0.5, 0.8 ) ) ), 0.0 );

    // Two species: warm and cool hues around the musical key.
    vec3 v_a = hueRot( vec3( 1.0, 0.45, 0.12 ), audioChromaHue );
    vec3 v_b = hueRot( vec3( 0.15, 0.55, 1.0 ), audioChromaHue );
    vec3 veins = v_a * smoothstep( 0.04, 0.8, tr.r )
                 + v_b * smoothstep( 0.04, 0.8, tr.g );
    veins *= 0.55 + 0.65 * diff;

    // The picture shines through the strongest lanes.
    float lane = smoothstep( 0.25, 1.1, h_c );
    vec3  pic = img( fract( suv + vec2( 0.0, 0.02 * sin( audioPhase * 0.1 ) ) ) );
    vec3  col = pic * ( 0.10 + 0.65 * lane );
    col += veins * ( 0.9 + 0.5 * audioSwell + 0.35 * audioBeat );
    col += vec3( 1.0, 0.95, 0.85 ) * pow( h_c * 0.6, 3.0 ) * 0.35; // hot cores

    col *= 1.0 + 0.15 * audioOnset + 0.8 * audioDrop;
    col *= 0.9 + 0.3 * audioLevel;

    fragColor = vec4( clamp( col, 0.0, 1.0 ), 1.0 );
}
