#version 330 core
out vec4 fragColor; ///< The pixel's colour (output).
/**
 * @file MeshRocketLaunch.frag
 * @brief MESH ROCKET LAUNCH: a real launch pad (model=) and a real rocket
 * (model2=) at night, seen from the causeway. The floodlights come up with
 * the build-up; the engines light just before the liftoff mark and the
 * rocket climbs out of the frame on the scene's own clock, its flame
 * lighting the pad, the exhaust cloud rolling out across the ground behind
 * it, the sky glowing round the plume. The counterpart of the procedural
 * BuildUpRocketLaunch, built to answer one question: does a generated mesh
 * read better than a stylised 2D object?
 *
 * Lighting: moon (cool key), two warm floodlights on the ground, and the
 * engine flame as a point light that rises with the rocket. Every hull is
 * exposed against its own material average (materialExposure).
 *
 * Audio Reactivity:
 *   audioBuildUp  -> floodlights come up (slow)
 *   audioBass     -> engine glow and the flame light (light)
 *   audioKick     -> flame flare (light)
 *   audioSwell    -> sky-glow strength (slow)
 *   sceneProgress -> ignition and the climb (vertex stage, the clock)
 *
 * Per-instance: sizeP, platP, offP, depthP (placing the rocket on THIS pad).
 * Per-activation variety: liftP (when the liftoff falls), hueP.
 */

uniform sampler2DArray texMeshMaterial;       ///< the pad
uniform int            texMeshMaterialLayers; ///< Number of layers in texMeshMaterial.
uniform sampler2DArray texMeshMaterial2;      ///< the rocket
uniform int            texMeshMaterialLayers2;

uniform float time;         ///< Seconds since the program started (never reset; see sceneTime).
uniform float audioBuildUp; ///< Build-up toward a drop, 0..1.
uniform float audioBass;    ///< Bass band level, 0..1.
uniform float audioKick;    ///< Kick-drum envelope, 0..1 (fast attack, short decay).
uniform float audioSwell;   ///< Slow loudness envelope, 0..1 (seconds).

uniform float hueP; ///< Hue knob (radians), usually the music's chroma hue plus a rolled offset.

in vec2  vUV;     ///< Texture coordinate 0..1 over the screen (from the vertex stage).
in vec3  vNormal; ///< Surface normal (from the vertex stage).
in vec3  vPos;    ///< Position (from the vertex stage).
in vec3  vLocal;  ///< Object-space position (from the vertex stage).
in float vBg;     ///< Background flag (from the vertex stage).
in float vRocket;
in vec4  vFlame;
in float vClimb;

const float Dist = 84.0;
const float Ground = -16.0;

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
/**  Octaves rotated against each other: axis-aligned octaves sum to square cloud edges at low base frequencies.
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

/**  Round, jittered stars on the sphere of directions.
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
    float bright = step( 0.92, h ) * pow( 1.0 - clamp( d * 3.2, 0.0, 1.0 ), 4.0 );
    float big = step( 0.988, h ) * pow( 1.0 - clamp( d * 1.8, 0.0, 1.0 ), 3.0 );
    vec3  tint = mix( vec3( 0.75, 0.82, 1.0 ), vec3( 1.0, 0.9, 0.75 ), hash21( id + 3.1 ) );
    return tint * ( bright * 0.7 + big * 1.4 );
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

/**  A point light with a soft range.
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

const vec3 FloodA = vec3( -34.0, Ground + 2.0, Dist - 30.0 );
const vec3 FloodB = vec3( 36.0, Ground + 2.0, Dist - 26.0 );

/**  The sky colour for a direction.
 *
 * @param dir  The view direction (unit length). (in)
 *
 * @return
 *   The sky colour (RGB).
 **/
vec3 renderSky( vec3 dir )
{
    float build = clamp( audioBuildUp, 0.0, 1.0 );
    float bass = clamp( audioBass, 0.0, 1.0 );
    float swell = clamp( audioSwell, 0.0, 1.0 );
    vec3  flame = vFlame.xyz;
    float burn = vFlame.w;
    vec3  col;
    if ( dir.y < -0.004 )
    {
        // The ground: a dark flat, the floodlight pools, and the exhaust
        // cloud rolling out from the pad once the engines are lit.
        float t = Ground / dir.y;
        vec3  P = dir * t;
        float haze = exp( -t * 0.0045 );
        float g = fbm2( P.xz * 0.03 );
        col = vec3( 0.035, 0.04, 0.05 ) * ( 0.6 + 0.8 * g );
        float pool_a = exp( -length( P.xz - FloodA.xz ) * 0.05 );
        float pool_b = exp( -length( P.xz - FloodB.xz ) * 0.05 );
        col += vec3( 0.5, 0.45, 0.35 ) * ( pool_a + pool_b ) * ( 0.25 + 0.75 * build ) * ( 0.7 + 0.6 * g );

        float r = 9.0 + 48.0 * vClimb;
        float dc = length( P.xz - flame.xz );
        float cloud = fbm2( P.xz * 0.06 + vec2( time * 0.05, -time * 0.02 ) );
        float mask = smoothstep( r, r * 0.25, dc ) * burn;
        float dens = clamp( cloud * 1.8 - 0.35, 0.0, 1.0 ) * mask;
        vec3  low_col = vec3( 1.0, 0.62, 0.30 ) * ( 1.2 + 0.8 * bass );
        vec3  high_col = vec3( 0.85, 0.85, 0.9 ) * ( 0.35 + 0.65 * build );
        vec3  cloud_col = mix( low_col, high_col, smoothstep( 0.0, 0.45, vClimb ) );
        col = mix( col, cloud_col, dens );
        col = mix( vec3( 0.03, 0.03, 0.05 ), col, haze );
    }
    else
    {
        // Night sky: gradient, stars, a distant town glow at the horizon,
        // and the plume's own glow around the flame while it burns.
        float h = clamp( dir.y, 0.0, 1.0 );
        col = mix( vec3( 0.05, 0.05, 0.10 ), vec3( 0.008, 0.008, 0.03 ), pow( h, 0.5 ) );
        col += vec3( 0.9, 0.5, 0.25 ) * exp( -h * 22.0 ) * 0.10;
        col += stars( dir ) * ( 0.6 + 0.4 * smoothstep( 0.05, 0.4, h ) );
        vec3  fd = normalize( flame );
        float a = 1.0 - dot( dir, fd );
        col += vec3( 1.0, 0.55, 0.25 ) * exp( -a * 55.0 ) * burn * ( 0.6 + 0.5 * bass ) * ( 0.7 + 0.5 * swell );
        col += vec3( 1.0, 0.7, 0.4 ) * exp( -a * 9.0 ) * burn * 0.08;
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
    float build = clamp( audioBuildUp, 0.0, 1.0 );
    float bass = clamp( audioBass, 0.0, 1.0 );
    float kick = clamp( audioKick, 0.0, 1.0 );
    bool  rocket = vRocket > 0.5;

    // Each hull reads its OWN material array.
    vec4  base;
    float roughness = 0.6, metallic = 0.1;
    vec3  n = normalize( vNormal );
    float expose;
    if ( rocket )
    {
        base = texture( texMeshMaterial2, vec3( vUV, 0.0 ) );
        if ( texMeshMaterialLayers2 >= 2 )
        {
            vec4 mr = texture( texMeshMaterial2, vec3( vUV, 1.0 ) );
            roughness = mr.g;
            metallic = mr.b;
        }
        n = perturbNormal( texMeshMaterial2, texMeshMaterialLayers2, vUV, n, vPos, 1.0 );
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

    // Moon: a cool key from behind the camera's left shoulder.
    vec3 moon_dir = normalize( vec3( -0.4, 0.7, -0.55 ) );
    vec3 col = alb * vec3( 0.55, 0.65, 0.9 ) * ( 0.10 + 0.25 * max( dot( n, moon_dir ), 0.0 ) );
    // Sky ambient.
    col += alb * vec3( 0.10, 0.11, 0.15 ) * ( 0.5 + 0.5 * n.y );

    // Floodlights: on the ground in front of the pad, coming up with the build-up.
    vec3 flood_col = vec3( 1.0, 0.9, 0.7 ) * ( 0.9 + 2.6 * build );
    vec3 flood = lightAt( vPos, n, FloodA, flood_col, 48.0 ) + lightAt( vPos, n, FloodB, flood_col, 48.0 );
    col += alb * flood;

    // The engines as a point light that rises with the rocket.
    float burn = vFlame.w;
    vec3  flame_pos = vFlame.xyz - vec3( 0.0, 2.0, 0.0 );
    vec3  flame_col = vec3( 1.0, 0.6, 0.28 ) * burn * ( 4.0 + 3.0 * bass + 1.5 * kick );
    col += alb * lightAt( vPos, n, flame_pos, flame_col, 45.0 );

    // Specular from the floods (a wet concrete sheen, a painted hull).
    vec3  h_a = normalize( normalize( FloodA - vPos ) + view_dir );
    float spec = pow( max( dot( n, h_a ), 0.0 ), mix( 60.0, 6.0, roughness ) );
    vec3  spec_color = mix( vec3( 1.0 ), base.rgb, metallic );
    col += spec_color * spec * ( 0.15 + 0.35 * build ) * ( 0.5 + 0.6 * ( 1.0 - roughness ) );

    if ( rocket )
    {
        // The engine bells at the bottom of the hull glow once lit; the
        // flicker is light only.
        float bells = smoothstep( -0.72, -0.90, vLocal.y );
        float flick = 0.85 + 0.15 * sin( time * 41.0 ) * sin( time * 27.0 );
        col += vec3( 1.0, 0.55, 0.2 ) * bells * burn * ( 1.6 + 1.6 * bass ) * flick;
        col += vec3( 1.0, 0.9, 0.75 ) * smoothstep( -0.90, -1.0, vLocal.y ) * burn * 1.5;
    }
    // (No "brightest texels as lamps" on the pad: on a concrete platform the
    // brightest texels are the concrete's own highlights, and lighting them
    // red drew lava cracks all over the base in the first render.)

    if ( hue > 0.001 )
        col = hueRot( col, 0.15 * sin( hue ) );

    vec3 cat_tone = max( col, 0.0 );
    cat_tone /= 1.0 + 0.35 * max( cat_tone.r, max( cat_tone.g, cat_tone.b ) );
    fragColor = vec4( clamp( cat_tone, 0.0, 1.0 ), 1.0 );
}
