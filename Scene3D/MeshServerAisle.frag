#version 330 core
out vec4 fragColor; ///< The pixel's colour (output).
/**
 * @file MeshServerAisle.frag
 * @brief MESH SERVER AISLE: sixteen real server racks (one model,
 * instances="16") in two rows down a cold aisle, in perspective toward a
 * vanishing point under strip lights. The racks' LEDs are the music: each
 * rack answers a spectrum band, its rows of lights blinking with the
 * band's energy; the kick lights every rack a little; the swell is the
 * aisle light. The mesh counterpart of the procedural ServerRoomAisle.
 *
 * Audio Reactivity:
 *   audioSpectrum[32] -> the LEDs of each rack (light)
 *   audioKick         -> all the LEDs, a little (light)
 *   audioSwell        -> aisle light (slow)
 *   time              -> the blink patterns (continuous)
 *
 * Per-instance: sizeP. Per-activation variety: hueP.
 */

uniform sampler2DArray texMeshMaterial;       ///< The mesh's material textures (albedo, roughness, normal ...).
uniform int            texMeshMaterialLayers; ///< Number of layers in texMeshMaterial.

uniform float time;              ///< Seconds since the program started (never reset; see sceneTime).
uniform float audioSpectrum[32]; ///< Spectrum bands, 0..1.
uniform float audioKick;         ///< Kick-drum envelope, 0..1 (fast attack, short decay).
uniform float audioSwell;        ///< Slow loudness envelope, 0..1 (seconds).

uniform float hueP; ///< Hue knob (radians), usually the music's chroma hue plus a rolled offset.

in vec2  vUV;     ///< Texture coordinate 0..1 over the screen (from the vertex stage).
in vec3  vNormal; ///< Surface normal (from the vertex stage).
in vec3  vPos;    ///< Position (from the vertex stage).
in vec3  vLocal;  ///< Object-space position (from the vertex stage).
in float vBg;     ///< Background flag (from the vertex stage).
in float vInst;   ///< Inst (from the vertex stage).

const float Ground = -16.0; ///< Height of the ground (world units).

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
    float light = 0.8 + 0.7 * swell;
    vec3  col;
    if ( dir.y < -0.004 )
    {
        // Raised floor tiles, a cool sheen down the aisle.
        float t = Ground / dir.y;
        vec3  P = dir * t;
        float haze = exp( -t * 0.006 );
        float tile = smoothstep( 0.0, 0.03,
                                 min( abs( fract( P.x / 6.0 ) - 0.5 ), abs( fract( P.z / 6.0 ) - 0.5 ) ) - 0.46 );
        col = vec3( 0.30, 0.32, 0.36 ) * ( 0.6 + 0.4 * tile ) * ( 0.8 + 0.3 * noise2( P.xz * 0.4 ) ) * light;
        col *= 0.6 + 0.6 * ( 1.0 - smoothstep( 0.0, 20.0, abs( P.x ) ) );
        col = mix( vec3( 0.05, 0.06, 0.08 ), col, haze );
    }
    else if ( dir.y > 0.30 )
    {
        // The ceiling: dark, with two strip lights running down the aisle.
        float t = 20.0 / dir.y;
        vec3  P = dir * t;
        col = vec3( 0.05, 0.05, 0.06 );
        float strip = ( 1.0 - smoothstep( 0.6, 1.4, abs( abs( P.x ) - 5.0 ) ) ) * step( 0.15, fract( P.z / 12.0 ) );
        col += vec3( 0.85, 0.9, 1.0 ) * strip * light;
    }
    else
    {
        // The far end of the hall, and the walls beyond the rows.
        float h = clamp( dir.y, 0.0, 1.0 );
        col = vec3( 0.10, 0.11, 0.14 ) * ( 0.5 + 0.5 * noise2( vec2( atan( dir.x, dir.z ) * 8.0, dir.y * 10.0 ) ) )
              * light;
        float door = step( abs( dir.x ), 0.05 ) * step( -0.05, dir.y ) * step( dir.y, 0.16 );
        col += vec3( 0.4, 0.8, 1.0 ) * door * 0.4 * light;
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
    float light = 0.8 + 0.7 * swell;
    int   i = int( vInst + 0.5 );
    float band = clamp( audioSpectrum[( i * 2 ) % 32] * 1.5, 0.0, 1.0 );

    vec4 base = texture( texMeshMaterial, vec3( vUV, 0.0 ) );
    if ( base.a < 0.1 )
        discard;
    float roughness = 0.6, metallic = 0.3;
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

    // Strip lights from above, the aisle's cool glow on the fronts.
    vec3 col = alb * vec3( 0.85, 0.9, 1.0 ) * max( n.y, 0.0 ) * 0.9 * light;
    vec3 aisle_dir = normalize( vec3( -vPos.x, 2.0, 0.0 ) );
    col += alb * vec3( 0.6, 0.75, 1.0 ) * max( dot( n, aisle_dir ), 0.0 ) * 0.6 * light;
    col += alb * vec3( 0.10, 0.11, 0.14 ) * 0.5;

    vec3  half_v = normalize( vec3( 0.0, 1.0, 0.0 ) + view_dir );
    float spec = pow( max( dot( n, half_v ), 0.0 ), mix( 70.0, 8.0, roughness ) );
    col += mix( vec3( 0.9, 0.95, 1.0 ), base.rgb, metallic ) * spec * 0.3 * light;

    // The LEDs: saturated blue, green and cyan texels, blinking in rows
    // with the rack's band.
    float mx = max( base.r, max( base.g, base.b ) );
    float mn = min( base.r, min( base.g, base.b ) );
    float sat = ( mx - mn ) / max( mx, 1e-3 );
    float led = smoothstep( 0.45, 0.75, sat ) * smoothstep( 0.15, 0.4, max( base.g, base.b ) - base.r )
                * smoothstep( 0.25, 0.5, mx );
    float row = floor( vLocal.y * 30.0 );
    float blink = step( 0.35,
                        fract( time * ( 1.5 + 2.0 * hash21( vec2( row, vInst ) ) ) + hash21( vec2( vInst, row ) ) ) );
    col += base.rgb / max( mx, 1e-3 ) * led * ( 0.8 + 2.4 * band * blink + 0.8 * kick );

    float fres = pow( 1.0 - max( dot( n, view_dir ), 0.0 ), 4.0 );
    col += vec3( 0.6, 0.8, 1.0 ) * fres * 0.12 * light;

    if ( hue > 0.001 )
        col = hueRot( col, 0.08 * sin( hue ) );

    vec3 cat_tone = max( col, 0.0 );
    cat_tone /= 1.0 + 0.30 * max( cat_tone.r, max( cat_tone.g, cat_tone.b ) );
    fragColor = vec4( clamp( cat_tone, 0.0, 1.0 ), 1.0 );
}
