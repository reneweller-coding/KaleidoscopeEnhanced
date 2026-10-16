#version 330 core
out vec4 fragColor; ///< The pixel's colour (output).
/**
 * @file MeshHeliostatField.frag
 * @brief MESH HELIOSTAT FIELD: a real receiver tower (model=) in a field
 * of real heliostats (model2=, instanced), each aimed so the sun lands on
 * the receiver. The panels reflect the sky -- a true reflection, the sky
 * shell sampled along the mirrored view direction -- and track the sun as
 * it creeps on time. The receiver glows white-hot with the bass, the
 * treble runs glints across the field where a panel catches the sun, the
 * swell is the daylight and the haze of the beams. Desert noon. The mesh
 * counterpart of the procedural HeliostatSolarTower.
 *
 * Audio Reactivity:
 *   audioBass  -> receiver glow (light)
 *   audioHigh  -> panel glints (light)
 *   audioSwell -> daylight and beam haze (slow)
 *   time       -> the sun and the tracking (continuous, vertex stage)
 *
 * Per-instance: sizeP, mirrorP. Per-activation variety: hueP.
 */

uniform sampler2DArray texMeshMaterial;       ///< the tower
uniform int            texMeshMaterialLayers; ///< Number of layers in texMeshMaterial.
uniform sampler2DArray texMeshMaterial2;      ///< the heliostat
uniform int            texMeshMaterialLayers2;

uniform float time;       ///< Seconds since the program started (never reset; see sceneTime).
uniform float audioBass;  ///< Bass band level, 0..1.
uniform float audioHigh;  ///< High band level, 0..1.
uniform float audioSwell; ///< Slow loudness envelope, 0..1 (seconds).

uniform float hueP; ///< Hue knob (radians), usually the music's chroma hue plus a rolled offset.

in vec2  vUV;     ///< Texture coordinate 0..1 over the screen (from the vertex stage).
in vec3  vNormal; ///< Surface normal (from the vertex stage).
in vec3  vPos;    ///< Position (from the vertex stage).
in vec3  vLocal;  ///< Object-space position (from the vertex stage).
in float vBg;     ///< Background flag (from the vertex stage).
in float vMirror;
in vec3  vAim;

const float Ground = -6.0;
const vec3  TowerFoot = vec3( 0.0, Ground, 170.0 );
const float TowerH = 70.0;

/**  Direction to the sun, drifting slowly.
 *
 * @return
 *   The unit direction.
 **/
vec3 sunDir()
{
    float a = 0.4 + 0.10 * sin( time * 0.017 );
    float e = 0.62 + 0.06 * sin( time * 0.011 );
    return normalize( vec3( sin( a ) * cos( e ), sin( e ), -cos( a ) * cos( e ) ) );
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
    return fract( sin( dot( p, vec2( 127.1, 311.7 ) ) ) * 43758.5453 );
}
/**  Pseudo-random number 0..1 from a float.
 *
 * @param p  The input value. (in)
 *
 * @return
 *   A pseudo-random number 0..1.
 **/
float hash11( float p )
{
    return fract( sin( p * 12.9898 ) * 43758.5453 );
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
/**  Smooth 1D value noise.
 *
 * @param x  The input. (in)
 *
 * @return
 *   The noise value, 0..1.
 **/
float noise1( float x )
{
    float i = floor( x ), f = fract( x );
    f = f * f * ( 3.0 - 2.0 * f );
    return mix( hash11( i ), hash11( i + 1.0 ), f );
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

/**  The sky and the desert, also sampled by the mirrors.
 *
 * @param dir  The view direction (unit length). (in)
 *
 * @return
 *   The sky colour (RGB).
 **/
vec3 renderSky( vec3 dir )
{
    float swell = clamp( audioSwell, 0.0, 1.0 );
    float bass = clamp( audioBass, 0.0, 1.0 );
    float day = 0.85 + 0.25 * swell;
    vec3  sd = sunDir();
    vec3  col;
    if ( dir.y < -0.004 )
    {
        float t = Ground / dir.y;
        vec3  P = dir * t;
        float haze = exp( -t * 0.003 );
        float g = fbm2( P.xz * 0.04 ), g2 = fbm2( P.xz * 0.35 );
        col = mix( vec3( 0.55, 0.45, 0.30 ), vec3( 0.72, 0.62, 0.45 ), g ) * ( 0.75 + 0.4 * g2 ) * day;
        col = mix( vec3( 0.80, 0.78, 0.75 ) * day, col, haze );
    }
    else
    {
        float h = clamp( dir.y, 0.0, 1.0 );
        col = mix( vec3( 0.85, 0.85, 0.82 ), vec3( 0.28, 0.50, 0.85 ), pow( h, 0.5 ) ) * day;
        float sdist = distance( dir, sd );
        col += vec3( 1.0, 0.95, 0.85 ) * exp( -sdist * 6.0 ) * 0.6;
        col += vec3( 1.0 ) * ( 1.0 - smoothstep( 0.03, 0.04, sdist ) ) * 3.0;
        float az = atan( dir.x, dir.z );
        float ridge = 0.015 + 0.03 * noise1( az * 3.0 + 4.0 ) + 0.01 * noise1( az * 12.0 );
        float mtn = 1.0 - smoothstep( ridge - 0.004, ridge + 0.004, dir.y );
        col = mix( col, vec3( 0.62, 0.60, 0.65 ) * day, mtn );
    }
    // The receiver's halo and the haze of the converging beams -- small:
    // at the first setting the halo was the picture and the tower a
    // silhouette inside it.
    vec3  recv = normalize( TowerFoot + vec3( 0.0, TowerH * 0.82, 0.0 ) );
    float a = 1.0 - dot( dir, recv );
    col += vec3( 1.0, 0.95, 0.85 ) * exp( -a * 900.0 ) * ( 0.3 + 0.9 * bass );
    col += vec3( 1.0, 0.9, 0.75 ) * exp( -a * 60.0 ) * ( 0.04 + 0.10 * swell );
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
    float bass = clamp( audioBass, 0.0, 1.0 );
    float high = clamp( audioHigh, 0.0, 1.0 );
    float day = 0.85 + 0.25 * swell;
    bool  mirror = vMirror > 0.5;

    vec4  base;
    float roughness = 0.7, metallic = 0.0;
    vec3  n = normalize( vNormal );
    float expose;
    if ( mirror )
    {
        base = texture( texMeshMaterial2, vec3( vUV, 0.0 ) );
        if ( texMeshMaterialLayers2 >= 2 )
        {
            vec4 mr = texture( texMeshMaterial2, vec3( vUV, 1.0 ) );
            roughness = mr.g;
            metallic = mr.b;
        }
        expose = materialExposure( texMeshMaterial2 );
    }
    else
    {
        base = texture( texMeshMaterial, vec3( vUV, 0.0 ) );
        if ( texMeshMaterialLayers >= 2 )
        {
            vec4 mr = texture( texMeshMaterial, vec3( vUV, 1.0 ) );
            roughness = mr.g;
            metallic = mr.b;
        }
        n = perturbNormal( texMeshMaterial, texMeshMaterialLayers, vUV, n, vPos, 1.0 );
        expose = materialExposure( texMeshMaterial );
    }
    if ( base.a < 0.1 )
        discard;

    vec3 view_dir = normalize( -vPos );
    vec3 alb = base.rgb * expose;
    vec3 sd = sunDir();

    // Noon: hard sun, a bright sky fill, the sand's bounce. The tower's
    // concrete is dark in the texture and stood as a silhouette at first --
    // a generous fill is what a desert at noon looks like anyway.
    vec3 col = alb * vec3( 1.0, 0.95, 0.85 ) * max( dot( n, sd ), 0.0 ) * 1.6 * day;
    col += alb * vec3( 0.55, 0.65, 0.90 ) * ( 0.55 + 0.45 * n.y ) * 0.9 * day;
    col += alb * vec3( 0.65, 0.55, 0.40 ) * max( -n.y, 0.0 ) * 0.6 * day;
    col += alb * 0.12;

    if ( mirror )
    {
        // The glass: a real reflection of the sky along the mirrored view.
        // Which texels are the glass is a question of ORIENTATION, not of
        // the material (the baked metallic map of a photographed panel says
        // nothing reliable, and the object-space front axis was a guess that
        // failed): the panel is the face that points along the aiming normal.
        float glass = smoothstep( 0.55, 0.85, dot( normalize( vNormal ), vAim ) );
        vec3  r = reflect( -view_dir, n );
        vec3  refl = renderSky( r ) * 1.3;
        float glint = pow( max( dot( r, sd ), 0.0 ), 60.0 );
        col = mix( col, refl, glass * 0.9 );
        col += vec3( 1.0, 0.98, 0.9 ) * glint * glass * ( 0.8 + 3.0 * high );
    }
    else
    {
        // The receiver: the bright band near the top, white-hot with the bass.
        float luma = dot( base.rgb, vec3( 0.299, 0.587, 0.114 ) );
        float recv = smoothstep( 0.45, 0.62, vLocal.y ) * ( 1.0 - smoothstep( 0.85, 0.95, vLocal.y ) )
                     * smoothstep( 0.35, 0.6, luma );
        col += vec3( 1.0, 0.95, 0.85 ) * recv * ( 0.8 + 2.2 * bass );
        col += vec3( 1.0, 0.7, 0.4 ) * recv * 0.3;
    }

    vec3  half_v = normalize( sd + view_dir );
    float spec = pow( max( dot( n, half_v ), 0.0 ), mix( 60.0, 6.0, roughness ) );
    col += mix( vec3( 1.0 ), base.rgb, metallic ) * spec * 0.25 * day;

    if ( hue > 0.001 )
        col = hueRot( col, 0.08 * sin( hue ) );

    vec3 cat_tone = max( col, 0.0 );
    cat_tone /= 1.0 + 0.30 * max( cat_tone.r, max( cat_tone.g, cat_tone.b ) );
    fragColor = vec4( clamp( cat_tone, 0.0, 1.0 ), 1.0 );
}
