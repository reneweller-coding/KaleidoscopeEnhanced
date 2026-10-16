#version 330 core
out vec4 fragColor; ///< The pixel's colour (output).
/**
 * @file MeshCoolingTowers.frag
 * @brief MESH COOLING TOWERS: three real hyperboloid towers (one model,
 * instances="3") against an evening sky, each breathing a plume of steam
 * that rises and leans away on the scene clock. The plumes are painted on
 * the sky shell above each tower, lit from below by the plant floodlights
 * and from the side by the last sun, and each carries the colour of a
 * spectrum band by height, so the sky reads the music. The swell is how
 * much steam there is; the kick is a floodlight on the concrete; the bass
 * the glow inside the towers. The mesh counterpart of CoolingTowerPlumes.
 *
 * Audio Reactivity:
 *   audioSpectrum[32] -> the plume colours by height (light)
 *   audioSwell        -> plume volume (slow)
 *   audioKick         -> a floodlight on the shell (light, local)
 *   audioBass         -> the glow inside the towers (light)
 *   sceneTime         -> the plumes rise and drift (continuous)
 *
 * Per-instance: sizeP. Per-activation variety: hueP.
 */

uniform sampler2DArray texMeshMaterial;       ///< The mesh's material textures (albedo, roughness, normal ...).
uniform int            texMeshMaterialLayers; ///< Number of layers in texMeshMaterial.

uniform float time;              ///< Seconds since the program started (never reset; see sceneTime).
uniform float sceneTime;         ///< Seconds since this scene was activated.
uniform float audioSpectrum[32]; ///< Spectrum bands, 0..1.
uniform float audioSwell;        ///< Slow loudness envelope, 0..1 (seconds).
uniform float audioKick;         ///< Kick-drum envelope, 0..1 (fast attack, short decay).
uniform float audioBass;         ///< Bass band level, 0..1.

uniform float hueP; ///< Hue knob (radians), usually the music's chroma hue plus a rolled offset.

in vec2  vUV;     ///< Texture coordinate 0..1 over the screen (from the vertex stage).
in vec3  vNormal; ///< Surface normal (from the vertex stage).
in vec3  vPos;    ///< Position (from the vertex stage).
in vec3  vLocal;  ///< Object-space position (from the vertex stage).
in float vBg;     ///< Background flag (from the vertex stage).
in float vInst;

const float Ground = -22.0;
const float TowerH = 60.0;

/**  The three towers' feet, shared with the fragment stage.
 *
 * @param i  Index of the tower (0..2). (in)
 *
 * @return
 *   The foot's position.
 **/
vec3 towerFoot( int i )
{
    if ( i == 0 )
        return vec3( -66.0, Ground, 165.0 );
    if ( i == 1 )
        return vec3( 4.0, Ground, 148.0 );
    return vec3( 72.0, Ground, 172.0 );
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
/**  HSV (all 0..1) to RGB.
 *
 * @param c  Hue, saturation and value, all 0..1. (in)
 *
 * @return
 *   The RGB colour.
 **/
vec3 hsv2rgb( vec3 c )
{
    vec3 p = abs( fract( c.xxx + vec3( 0.0, 2.0 / 3.0, 1.0 / 3.0 ) ) * 6.0 - 3.0 );
    return c.z * mix( vec3( 1.0 ), clamp( p - 1.0, 0.0, 1.0 ), c.y );
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
    for ( int i = 0; i < 5; ++i )
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
/**  Diffuse light from a point light with a soft range falloff.
 *
 * @param P      The lit point. (in)
 * @param n      Its normal. (in)
 * @param lp     Position of the light. (in)
 * @param lc     Colour of the light. (in)
 * @param range  Range of the falloff. (in)
 *
 * @return
 *   The light arriving (RGB).
 **/
vec3 lightAt( vec3 P, vec3 n, vec3 lp, vec3 lc, float range )
{
    vec3  d = lp - P;
    float dist = length( d );
    d /= max( dist, 1e-3 );
    float att = 1.0 / ( 1.0 + ( dist * dist ) / ( range * range ) );
    return lc * max( dot( n, d ), 0.0 ) * att;
}

const vec3 SunDir = vec3( 0.75, 0.10, -0.55 ); // the last sun, low, right, behind the camera

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
    float bass = clamp( audioBass, 0.0, 1.0 );
    vec3  col;
    float az = atan( dir.x, dir.z );
    if ( dir.y < -0.004 )
    {
        float t = Ground / dir.y;
        vec3  P = dir * t;
        float haze = exp( -t * 0.004 );
        float g = fbm2( P.xz * 0.05 );
        col = vec3( 0.06, 0.06, 0.07 ) * ( 0.6 + 0.8 * g );
        // Floodlight pools at the towers' feet.
        for ( int i = 0; i < 3; ++i )
        {
            vec3 f = towerFoot( i );
            col += vec3( 0.45, 0.40, 0.30 ) * exp( -length( P.xz - f.xz ) * 0.03 ) * 0.6;
        }
        col = mix( vec3( 0.10, 0.08, 0.12 ), col, haze );
    }
    else
    {
        float h = clamp( dir.y, 0.0, 1.0 );
        col = mix( vec3( 0.85, 0.42, 0.25 ), vec3( 0.05, 0.05, 0.16 ), pow( h, 0.45 ) );
        col += stars( dir ) * smoothstep( 0.2, 0.6, h );
        // The plant on the horizon: blocky silhouettes.
        float roof = 0.02 + 0.03 * step( 0.5, noise1( az * 14.0 ) ) + 0.015 * noise1( az * 40.0 );
        float plant_mask = 1.0 - smoothstep( roof - 0.004, roof + 0.004, dir.y );
        col = mix( col, vec3( 0.03, 0.03, 0.04 ), plant_mask );
        // A few sodium lamps along it.
        float lamp = step( 0.93, hash21( vec2( floor( az * 60.0 ), 1.0 ) ) )
                     * ( 1.0 - smoothstep( 0.004, 0.009, abs( dir.y - roof + 0.006 ) ) );
        col += vec3( 1.0, 0.7, 0.3 ) * lamp * 0.8;

        // The plumes: one column of steam above each tower, rising on the
        // scene clock, leaning with the wind, coloured by the spectrum band
        // of its height, lit warm from below and orange from the sun's side.
        for ( int i = 0; i < 3; ++i )
        {
            vec3  top = towerFoot( i ) + vec3( 0.0, TowerH, 0.0 );
            vec3  td = normalize( top );
            float az0 = atan( td.x, td.z );
            float e0 = asin( td.y );
            float rise = ( dir.y - e0 + 0.02 ) / 0.42;
            if ( rise < -0.1 || rise > 1.4 )
                continue;
            float lean = 0.10 * rise * rise + 0.02 * rise;
            float w = 0.045 + 0.12 * rise;
            float d_az = az - az0 - lean;
            float column = exp( -pow( d_az / w, 2.0 ) ) * smoothstep( -0.08, 0.10, rise )
                           * ( 1.0 - smoothstep( 0.55, 1.3, rise ) );
            // The fbm is the expensive part: only pay it inside the column.
            if ( column < 0.003 )
                continue;
            float dens = fbm2(
                vec2( ( d_az ) * 14.0 + float( i ) * 3.0, dir.y * 9.0 - sceneTime * 0.16 - float( i ) ) );
            float steam = column * smoothstep( 0.62 - 0.30 * swell, 0.85, dens + 0.15 * swell );
            int   band = int( clamp( rise, 0.0, 0.999 ) * 32.0 );
            float sp = clamp( audioSpectrum[band] * 1.5, 0.0, 1.0 );
            vec3  band_col = hsv2rgb( vec3( 0.02 + 0.65 * rise, 0.55, 1.0 ) );
            vec3  steam_col = mix( vec3( 0.85, 0.80, 0.85 ), band_col, 0.25 + 0.65 * sp ) * ( 0.5 + 0.7 * sp );
            steam_col *= 0.5 + 0.6 * exp( -rise * 2.0 ); // floodlit from below
            steam_col += vec3( 1.0, 0.5, 0.2 ) * 0.35 * smoothstep( -0.3, 0.6, d_az ) * ( 1.0 - rise * 0.5 ); // the
                                                                                                              // sun's
                                                                                                              // side
            col = mix( col, steam_col, clamp( steam, 0.0, 0.9 ) );
        }
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
    float bass = clamp( audioBass, 0.0, 1.0 );

    vec4 base = texture( texMeshMaterial, vec3( vUV, 0.0 ) );
    if ( base.a < 0.1 )
        discard;
    float roughness = 0.85, metallic = 0.0;
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

    // The last sun, the evening sky, floodlights from the plant floor.
    vec3 sun_dir = normalize( SunDir );
    vec3 col = alb * vec3( 1.0, 0.55, 0.32 ) * max( dot( n, sun_dir ), 0.0 ) * 1.1;
    col += alb * vec3( 0.28, 0.25, 0.42 ) * ( 0.55 + 0.45 * n.y ) * 0.5;
    col += alb * 0.04;
    int  ti = int( vInst + 0.5 );
    vec3 foot = towerFoot( ti );
    vec3 flood_col = vec3( 1.0, 0.85, 0.6 ) * ( 1.2 + 2.5 * kick );
    col += alb * lightAt( vPos, n, foot + vec3( 30.0, 4.0, -40.0 ), flood_col, 55.0 );
    col += alb * lightAt( vPos, n, foot + vec3( -26.0, 4.0, -36.0 ), flood_col * 0.7, 55.0 );

    // The glow inside: the rim at the top lit from within with the bass,
    // and the aircraft warning lights, blinking slowly.
    float rim = smoothstep( 0.78, 0.97, vLocal.y );
    col += vec3( 1.0, 0.55, 0.25 ) * rim * ( 0.08 + 0.6 * bass ) * ( 0.5 + 0.5 * max( n.y, 0.0 ) );
    float blink = 0.5 + 0.5 * sin( time * 2.2 + vInst * 2.0 );
    float beacon = smoothstep( 0.985, 1.0, vLocal.y )
                   * step( 0.7, fract( atan( vLocal.x, vLocal.z ) / 6.2831853 * 3.0 + 0.5 ) );
    col += vec3( 1.0, 0.1, 0.05 ) * beacon * blink * 1.5;

    float fres = pow( 1.0 - max( dot( n, view_dir ), 0.0 ), 4.0 );
    col += vec3( 0.9, 0.5, 0.35 ) * fres * 0.15;

    if ( hue > 0.001 )
        col = hueRot( col, 0.10 * sin( hue ) );

    vec3 cat_tone = max( col, 0.0 );
    cat_tone /= 1.0 + 0.30 * max( cat_tone.r, max( cat_tone.g, cat_tone.b ) );
    fragColor = vec4( clamp( cat_tone, 0.0, 1.0 ), 1.0 );
}
