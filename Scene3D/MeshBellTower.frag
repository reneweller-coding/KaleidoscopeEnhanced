#version 330 core
/*****************************************************************************\
 *                              MeshBellTower.frag
\*****************************************************************************/
/*! @file
 *
 *  @brief
 *  MESH BELL TOWER: four real bronze bells (one model, instances="4") of falling size swinging in a belfry, the
 *  dusk sky through the arcade behind them.
 *
 *  Each bell answers a band -- the big one the bass, then the low mids, the mids, the treble -- glowing warm in the
 *  bronze; the kick is the clapper's strike, a flash on the bell and on the stone; the swell is the lamp and the
 *  swing. The mesh counterpart of BellTowerDownbeat.
 *
 *  Audio Reactivity:
 *    audioBass / audioLowMid / audioMid / audioHigh -> one bell each (light)
 *    audioKick  -> the strike (light)
 *    audioSwell -> lamp, swing amplitude (slow)
 *    time       -> the swings (continuous, vertex stage)
 *
 *  Per-instance: sizeP. Per-activation variety: hueP.
 *
 *  @author René Weller
 */
out vec4 fragColor; ///< The pixel's colour (output).

uniform sampler2DArray texMeshMaterial;       ///< The mesh's material textures (albedo, roughness, normal ...).
uniform int            texMeshMaterialLayers; ///< Number of layers in texMeshMaterial.

uniform float time;        ///< Seconds since this activation, plus a rolled start (see sceneTime).
uniform float audioBass;   ///< Bass band level, 0..1.
uniform float audioLowMid; ///< Low-mid band level (150-500 Hz), 0..1.
uniform float audioMid;    ///< Mid band level, 0..1.
uniform float audioHigh;   ///< High band level, 0..1.
uniform float audioKick;   ///< Kick-drum envelope, 0..1 (fast attack, short decay).
uniform float audioSwell;  ///< Slow loudness envelope, 0..1 (seconds).

uniform float hueP; ///< Hue knob (radians), usually the music's chroma hue plus a rolled offset.

in vec2  vUV;     ///< Texture coordinate 0..1 over the screen (from the vertex stage).
in vec3  vNormal; ///< Surface normal (from the vertex stage).
in vec3  vPos;    ///< Position (from the vertex stage).
in vec3  vLocal;  ///< Object-space position (from the vertex stage).
in float vBg;     ///< Background flag (from the vertex stage).
in float vInst;   ///< Inst (from the vertex stage).
in float vSwing;  ///< Swing (from the vertex stage).

const float Ground = -20.0; ///< Height of the ground (world units).

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
    return fract( sin( dot( p, vec2( 127.1, 311.7 ) ) ) * 43758.5453 );
}
/**  Smooth 2D value noise, 0..1.
 *
 * @param x  The point. (in)
 *
 * @return
 *   The noise value, 0..1.
 **/
float noise2( vec2 x )
{
    vec2 i = floor( x ), f = fract( x );
    f = f * f * ( 3.0 - 2.0 * f );
    float a = hash21( i ), b = hash21( i + vec2( 1.0, 0.0 ) );
    float c = hash21( i + vec2( 0.0, 1.0 ) ), d = hash21( i + vec2( 1.0, 1.0 ) );
    return mix( mix( a, b, f.x ), mix( c, d, f.x ), f.y );
}
/**  Fractal noise: octaves of noise2, each turned against the last.
 *
 * @param p  The point. (in)
 *
 * @return
 *   The fractal noise value, about 0..1.
 **/
float fbm2( vec2 p )
{
    float      v = 0.0, a = 0.5;
    const mat2 R = mat2( 0.80, 0.60, -0.60, 0.80 );
    for ( int i = 0; i < 4; ++i )
    {
        v += a * noise2( p );
        p = R * p * 2.03 + 7.1;
        a *= 0.5;
    }
    return v;
}
/**  A starfield on the sphere of directions: round, jittered points, a few of them bright.
 *
 * @param v  The view direction. (in)
 *
 * @return
 *   The star colour (RGB).
 **/
vec3 stars( vec3 v )
{
    vec2  sph = vec2( atan( v.z, v.x ) / 6.2831853 + 0.5, acos( clamp( v.y, -1.0, 1.0 ) ) / 3.14159 );
    vec2  g = sph * vec2( 180.0, 90.0 );
    vec2  id = floor( g );
    vec2  f = fract( g ) - 0.5;
    float h = hash21( id );
    vec2  jit = vec2( hash21( id + 1.3 ), hash21( id + 7.9 ) ) - 0.5;
    float d = length( f - jit * 0.8 );
    return vec3( 0.85, 0.88, 1.0 ) * step( 0.94, h ) * pow( 1.0 - clamp( d * 3.2, 0.0, 1.0 ), 4.0 ) * 0.6;
}
/**  Exposure that brings the material's average brightness to a common level.
 *
 * @param tex  The material texture array (layer 0 is the albedo). (in)
 *
 * @return
 *   The exposure factor, 0.3..2.
 **/
float materialExposure( sampler2DArray tex )
{
    vec3  avg = textureLod( tex, vec3( 0.5, 0.5, 0.0 ), 20.0 ).rgb;
    float l = dot( avg, vec3( 0.299, 0.587, 0.114 ) );
    return clamp( 0.28 / max( l, 0.02 ), 0.60, 1.8 );
}
/**  Tangent frame from screen derivatives (normal mapping without tangents).
 *
 * @param N   The surface normal. (in)
 * @param p   The position (world). (in)
 * @param uv  The texture coordinate. (in)
 *
 * @return
 *   The tangent frame (tangent, bitangent, normal) as the columns of a matrix.
 **/
mat3 cotangentFrame( vec3 N, vec3 p, vec2 uv )
{
    vec3  dp1 = dFdx( p ), dp2 = dFdy( p );
    vec2  du1 = dFdx( uv ), du2 = dFdy( uv );
    vec3  dp2perp = cross( dp2, N );
    vec3  dp1perp = cross( N, dp1 );
    vec3  T = dp2perp * du1.x + dp1perp * du2.x;
    vec3  B = dp2perp * du1.y + dp1perp * du2.y;
    float inv = inversesqrt( max( max( dot( T, T ), dot( B, B ) ), 1e-12 ) );
    return mat3( T * inv, B * inv, N );
}
/**  The normal tilted by the material's normal map.
 *
 * @param tex       The material texture array. (in)
 * @param layers    Its layer count (the normal map is layer 2). (in)
 * @param uv        Material texture coordinate. (in)
 * @param n         The surface normal. (in)
 * @param wpos      World position (for the tangent frame). (in)
 * @param strength  Strength of the normal map. (in)
 *
 * @return
 *   The tilted normal (unit length); n itself without a normal map.
 **/
vec3 perturbNormal( sampler2DArray tex, int layers, vec2 uv, vec3 n, vec3 wpos, float strength )
{
    if ( layers < 3 )
        return n;
    vec3 m = texture( tex, vec3( uv, 2.0 ) ).rgb * 2.0 - 1.0;
    if ( dot( m, m ) < 1e-4 )
        return n;
    m.xy *= strength;
    return normalize( cotangentFrame( n, wpos, uv ) * normalize( m ) );
}

/**  The dusk outside, seen through the arcade.
 *
 * @param dir  The direction. (in)
 *
 * @return
 *   The colour (RGB).
 **/
vec3 dusk( vec3 dir )
{
    float h = clamp( dir.y, 0.0, 1.0 );
    vec3  col = mix( vec3( 0.95, 0.55, 0.30 ), vec3( 0.15, 0.10, 0.35 ), pow( h * 1.6, 0.5 ) );
    col += stars( dir ) * smoothstep( 0.1, 0.4, h );
    return col;
}

/**  Weight that closes atan's cut: 0 over most of the circle, 1 at a = pi.  A noise of an angle from atan() does
 *   not repeat after a turn and tears along the cut; mixed toward the same noise of a - 2*pi near a = pi it meets,
 *   at the cut, exactly the value on the other side (17.10.2026).
 *
 * @param a  The angle, -pi..pi. (in)
 *
 * @return
 *   The weight, 0..1.
 **/
float seamW( float a )
{
    return smoothstep( 2.5, 3.14159265, a );
}

/**  The sky colour for a direction.
 *
 * @param dir  The view direction (unit length). (in)
 *
 * @return
 *   The sky colour (RGB).
 **/
vec3 renderSky( vec3 dir )
{
    float swell = clamp( audioSwell, 0.0, 1.0 );
    float kick = clamp( audioKick, 0.0, 1.0 );
    float az = atan( dir.x, dir.z );
    vec3  col;
    if ( dir.y < -0.004 )
    {
        float t = Ground / dir.y;
        vec3  P = dir * t;
        float haze = exp( -t * 0.010 );
        float plank = smoothstep( 0.0, 0.03, abs( fract( P.x / 5.0 ) - 0.5 ) - 0.46 );
        col = vec3( 0.22, 0.15, 0.09 ) * ( 0.6 + 0.4 * plank ) * ( 0.7 + 0.4 * noise2( P.xz * 0.5 ) )
              * ( 0.3 + 0.5 * swell );
        col = mix( vec3( 0.02 ), col, haze );
    }
    else if ( dir.y > 0.42 )
    {
        // The roof: rafters.
        float t = 24.0 / dir.y;
        vec3  P = dir * t;
        float beam = smoothstep( 0.0, 0.1, abs( fract( P.x / 7.0 ) - 0.5 ) - 0.38 );
        col = vec3( 0.10, 0.07, 0.04 ) * ( 0.5 + 0.5 * beam ) * ( 0.3 + 0.5 * swell );
    }
    else
    {
        // Stone walls with three arched openings onto the dusk.
        vec3  stone = vec3( 0.32, 0.28, 0.24 )
                      * ( 0.6
                          + 0.6
                                * mix( fbm2( vec2( az * 6.0, dir.y * 9.0 ) ),
                                       fbm2( vec2( ( az - 6.2831853 ) * 6.0, dir.y * 9.0 ) ), seamW( az ) ) );
        float block = smoothstep( 0.0, 0.02, abs( fract( dir.y * 14.0 ) - 0.5 ) - 0.44 )
                      * smoothstep( 0.0, 0.02,
                                    abs( fract( az * 9.0 + step( 0.5, fract( dir.y * 7.0 ) ) * 0.5 ) - 0.5 ) - 0.45 );
        stone *= 0.75 + 0.25 * block;
        col = stone * ( 0.12 + 0.45 * swell ) * ( 0.5 + 0.5 * exp( -dir.y * 3.0 ) );
        float opening = 0.0;
        for ( int i = -1; i <= 1; ++i )
        {
            float a = float( i ) * 0.62;
            float dx = ( az - a ) / 0.17;
            float dy = ( dir.y - 0.02 ) / 0.17;
            float arch = ( dy < 1.0 ) ? step( abs( dx ), 1.0 ) * step( 0.0, dy + 0.3 )
                                      : step( dx * dx + ( dy - 1.0 ) * ( dy - 1.0 ), 1.0 );
            opening = max( opening, arch );
        }
        col = mix( col, dusk( dir ), opening );
        // The strike lights the stone.
        col += vec3( 1.0, 0.75, 0.45 ) * kick * 0.12 * ( 1.0 - opening );
    }
    return col;
}

/** Entry point of this shader stage (the file description says what it draws). */
void main()
{
    if ( vBg > 0.5 )
    {
        fragColor = vec4( renderSky( normalize( vPos ) ), 1.0 );
        return;
    }

    float hue = ( hueP > 0.01 ? hueP : 0.0 );
    float swell = clamp( audioSwell, 0.0, 1.0 );
    float kick = clamp( audioKick, 0.0, 1.0 );
    int   i = int( vInst + 0.5 );
    float band = ( i == 0 ) ? audioBass : ( i == 1 ) ? audioLowMid
                                      : ( i == 2 )   ? audioMid
                                                     : audioHigh;
    band = clamp( band, 0.0, 1.0 );

    vec4 base = texture( texMeshMaterial, vec3( vUV, 0.0 ) );
    if ( base.a < 0.1 )
        discard;
    float roughness = 0.5, metallic = 0.6;
    if ( texMeshMaterialLayers >= 2 )
    {
        vec4 mr = texture( texMeshMaterial, vec3( vUV, 1.0 ) );
        roughness = mr.g;
        metallic = mr.b;
    }
    vec3 n = normalize( vNormal );
    n = perturbNormal( texMeshMaterial, texMeshMaterialLayers, vUV, n, vPos, 1.0 );
    vec3 view_dir = normalize( -vPos );
    vec3 alb = base.rgb * materialExposure( texMeshMaterial );

    // Dusk through the arches (warm, low, from behind the bells), a lamp in
    // the belfry (behind the camera, above), the floor's bounce.
    vec3 dusk_dir = normalize( vec3( 0.2, 0.1, 0.9 ) );
    vec3 lamp_dir = normalize( vec3( -0.3, 0.7, -0.6 ) );
    vec3 col = alb * vec3( 1.0, 0.6, 0.35 ) * max( dot( n, dusk_dir ), 0.0 ) * 0.6;
    col += alb * vec3( 1.0, 0.85, 0.65 ) * max( dot( n, lamp_dir ), 0.0 ) * ( 0.6 + 0.8 * swell );
    col += alb * vec3( 0.20, 0.17, 0.22 ) * ( 0.55 + 0.45 * n.y ) * 0.5;
    col += alb * 0.05;

    vec3  half_v = normalize( lamp_dir + view_dir );
    float spec = pow( max( dot( n, half_v ), 0.0 ), mix( 70.0, 8.0, roughness ) );
    col += mix( vec3( 1.0, 0.9, 0.7 ), base.rgb, metallic ) * spec * ( 0.3 + 0.7 * metallic );

    // The bell's band glows in the bronze; the strike flashes it.
    float bronze = smoothstep( 0.3, 0.7, metallic );
    col += vec3( 1.0, 0.65, 0.3 ) * bronze * band * 0.7;
    float strike = kick * ( 0.5 + 0.5 * smoothstep( 0.6, 0.95, abs( vSwing ) ) );
    col += vec3( 1.0, 0.9, 0.75 ) * bronze * strike * 0.9;

    float fres = pow( 1.0 - max( dot( n, view_dir ), 0.0 ), 4.0 );
    col += vec3( 1.0, 0.6, 0.35 ) * fres * 0.2;

    if ( hue > 0.001 )
        col = hueRot( col, 0.08 * sin( hue ) );

    vec3 cat_tone = max( col, 0.0 );
    cat_tone /= 1.0 + 0.30 * max( cat_tone.r, max( cat_tone.g, cat_tone.b ) );
    fragColor = vec4( clamp( cat_tone, 0.0, 1.0 ), 1.0 );
}
