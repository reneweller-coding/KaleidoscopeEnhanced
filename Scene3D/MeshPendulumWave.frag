#version 330 core
/*****************************************************************************\
 *                              MeshPendulumWave.frag
\*****************************************************************************/
/*! @file
 *
 *  @brief
 *  MESH PENDULUM WAVE: twelve real pendulums (one model, instances="12") hanging from a rail in a dark lab,
 *  swinging the pendulum-wave pattern on time.
 *
 *  The bob glows with the bass; the bob passing through centre lights on the beat; the swell is the lamp. The mesh
 *  counterpart of the procedural PendulumWaveTempo.
 *
 *  Audio Reactivity:
 *    audioBeat  -> highlight on the bob passing centre (light)
 *    audioBass  -> bob glow (light)
 *    audioSwell -> lamp brightness, swing amplitude (slow)
 *    time       -> the swings (continuous, vertex stage)
 *
 *  Per-instance: sizeP, cycleP. Per-activation variety: hueP.
 *
 *  @author René Weller
 */
out vec4 fragColor; ///< The pixel's colour (output).

uniform sampler2DArray texMeshMaterial;       ///< The mesh's material textures (albedo, roughness, normal ...).
uniform int            texMeshMaterialLayers; ///< Number of layers in texMeshMaterial.

uniform float time;       ///< Seconds since this activation, plus a rolled start (see sceneTime).
uniform float audioBeat;  ///< Beat envelope, 0..1.
uniform float audioBass;  ///< Bass band level, 0..1.
uniform float audioSwell; ///< Slow loudness envelope, 0..1 (seconds).

uniform float hueP; ///< Hue knob (radians), usually the music's chroma hue plus a rolled offset.

in vec2  vUV;     ///< Texture coordinate 0..1 over the screen (from the vertex stage).
in vec3  vNormal; ///< Surface normal (from the vertex stage).
in vec3  vPos;    ///< Position (from the vertex stage).
in vec3  vLocal;  ///< Object-space position (from the vertex stage).
in float vBg;     ///< Background flag (from the vertex stage).
in float vInst;   ///< Inst (from the vertex stage).
in float vSwing;  ///< Swing (from the vertex stage).

const float Dist = 70.0;    ///< Distance of the main object from the camera (world units).
const float PivotY = 22.0;  ///< Height of the pivots (world units).
const float Ground = -20.0; ///< Height of the ground (world units).

// ---- shadow map of the scene's lamp (Tools/scenegen/patch_shadow3d.py) ----
uniform float           shadowPass;                          ///< 1 during the shadow map's depth-only pass.
uniform sampler2DShadow texShadow;                           ///< The lamp's shadow map (depth comparison).
uniform float           shadowTexel;                         ///< Size of a shadow-map texel (texture coordinates).
uniform float           shadowMapP; ///< Lamp shadow: 0 = none (the old look, no depth pass) .. 1 = full.
const vec3              SmLamp = vec3( 0.0, 0.8, -0.6 );     ///< Toward the lamp main() shades with.
const vec3              SmCentre = vec3( 0.0, -20.0, Dist ); ///< Centre of the shadow box (world units).
const float             SmBox = 70.0;                        ///< Half size of the shadow box (world units).

/**  A point in the clip space of the lamp's shadow map: an orthographic view along the lamp onto the box around
 * SmCentre.
 *
 * @param p  The point (world units). (in)
 *
 * @return
 *   Its clip coordinates (w = 1).
 *
 * The construction of RenderPipeline::updateLightMatrixGeneric() -- eye 2 SmBox out along the lamp, looking at the
 * box centre, near 0.1, far 4 SmBox -- but along the scene's own lamp, so the shadows fall where its light says.
 **/
vec4 smClip( vec3 p )
{
    vec3  l = normalize( SmLamp );
    vec3  f = -l;
    vec3  up = ( abs( f.y ) > 0.98 ) ? vec3( 1.0, 0.0, 0.0 ) : vec3( 0.0, 1.0, 0.0 );
    vec3  s = normalize( cross( f, up ) );
    vec3  u = cross( s, f );
    vec3  q = p - SmCentre - l * ( 2.0 * SmBox );
    float zn = 0.1, zf = 4.0 * SmBox;
    return vec4( dot( q, s ) / SmBox, dot( q, u ) / SmBox, ( 2.0 * dot( q, f ) - zf - zn ) / ( zf - zn ), 1.0 );
}

/**  How much of the lamp's light reaches a point: the shadow map, 3 x 3 taps on top of the hardware's own 2 x 2
 * comparison filter, the lookup lifted off the surface along its normal (no self-shadowing stripes).
 *
 * @param p  The point (world units). (in)
 * @param n  Its normal (unit length). (in)
 *
 * @return
 *   1 lit .. 0 in shadow; 1 outside the box.
 **/
float smShadow( vec3 p, vec3 n )
{
    vec3  l = normalize( SmLamp );
    float ndl = max( dot( n, l ), 0.0 );
    vec4  c = smClip( p + n * ( 2.0 * SmBox * shadowTexel * 2.2 / max( ndl, 0.15 ) ) );
    vec3  t = c.xyz * 0.5 + 0.5;
    if ( t.z > 1.0 || any( lessThan( t.xy, vec2( 0.0 ) ) ) || any( greaterThan( t.xy, vec2( 1.0 ) ) ) )
        return 1.0;
    float bias = 0.0006 + 0.0030 * ( 1.0 - ndl );
    float s = 0.0;
    for ( int y = -1; y <= 1; ++y )
        for ( int x = -1; x <= 1; ++x )
            s += texture( texShadow, vec3( t.xy + vec2( float( x ), float( y ) ) * 1.5 * shadowTexel, t.z - bias ) );
    return s / 9.0;
}
// ---- end of the shadow map ----

// ---- light shafts of the scene's lamp (Tools/scenegen/patch_shaft3d.py) ----
uniform float shaftP; ///< Light shafts in the haze: 0 = none (the old look) .. 1 = strong; acts only with shadowMapP >
                      ///< 0.
const vec3 ShaftCol = vec3( 1.0, 0.92, 0.8 ); ///< Colour of the lamp's light in the haze.

/**  Whether the lamp sees a point in the air: one lookup of the shadow map (the hardware's 2 x 2 comparison filter).
 *
 * @param p  The point (world units). (in)
 *
 * @return
 *   1 lit .. 0 in an object's shadow; 1 outside the map.
 **/
float smLit( vec3 p )
{
    vec3 t = smClip( p ).xyz * 0.5 + 0.5;
    if ( t.z > 1.0 || any( lessThan( t.xy, vec2( 0.0 ) ) ) || any( greaterThan( t.xy, vec2( 1.0 ) ) ) )
        return 1.0;
    return textureLod( texShadow, vec3( t.xy, t.z - 0.0015 ), 0.0 );
}

/**  The lamp's light scattered toward the eye by a thin haze over the floor, added to a pixel: light shafts with the
 * objects' shadows cut into them.
 *
 * @param col  The pixel's colour so far, 0..1. (in)
 * @param p    The surface point the pixel shows (world units, the eye at the origin); of the sky shell only the
 *             direction counts. (in)
 * @param sky  True for the sky shell: the ray ends on the floor (below the horizon) or leaves the haze. (in)
 *
 * @return
 *   The colour with the haze's light added (a screen blend, stays in 0..1).
 *
 * 12 steps through the part of the ray inside a sphere of 1.6 SmBox around SmCentre, the start jittered with a
 * static interleaved-gradient noise; the haze's density falls with the height above the floor and toward the edge of
 * the sphere; a Henyey-Greenstein lobe (g = 0.45) toward the lamp; 0.75 .. 1 with the slow swell.
 **/
vec3 smShafts( vec3 col, vec3 p, bool sky )
{
    const int   Steps = 12;
    const float G = 0.45;
    float       radius = 1.6 * SmBox;
    vec3        dir = normalize( p );
    float       b = dot( dir, SmCentre );
    float       disc = b * b - dot( SmCentre, SmCentre ) + radius * radius;
    if ( disc <= 0.0 )
        return col;
    float root = sqrt( disc );
    float t0 = max( b - root, 0.0 );
    float t1 = b + root;
    if ( !sky )
        t1 = min( t1, length( p ) );
    else if ( dir.y < -0.004 )
        t1 = min( t1, SmCentre.y / dir.y );
    if ( t1 <= t0 )
        return col;
    float ds = ( t1 - t0 ) / float( Steps );
    float jit = fract( 52.9829189 * fract( dot( gl_FragCoord.xy, vec2( 0.06711056, 0.00583715 ) ) ) );
    float sum = 0.0;
    for ( int i = 0; i < Steps; ++i )
    {
        vec3  q = dir * ( t0 + ( float( i ) + jit ) * ds );
        float fog = exp( -max( q.y - SmCentre.y, 0.0 ) / ( 0.45 * SmBox ) )
                    * ( 1.0 - smoothstep( 0.5 * radius, radius, distance( q, SmCentre ) ) );
        sum += fog * smLit( q );
    }
    float c = dot( dir, normalize( SmLamp ) );
    float phase = ( 1.0 - G * G ) / pow( 1.0 + G * G - 2.0 * G * c, 1.5 );
    float env = 0.75 + 0.25 * clamp( audioSwell, 0.0, 1.0 );
    vec3  s = ShaftCol * ( shaftP * 0.6 * env * phase * sum * ds / SmBox );
    return col + ( 1.0 - col ) * ( 1.0 - exp( -s ) );
}
// ---- end of the light shafts ----

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

/**  Weight that closes atan's cut: 0 over most of the circle, 1 at a = pi.
 *
 * @param a  The angle, -pi..pi. (in)
 *
 * @return
 *   The weight, 0..1.
 *
 * A noise of an angle from atan() does not repeat after a turn and tears along the cut; mixed toward the same noise of
 * a - 2*pi near a = pi it meets, at the cut, exactly the value on the other side (17.10.2026).
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
    vec3  col;
    if ( dir.y < -0.004 )
    {
        // The lab floor: dark tiles, a faint grid.
        float t = Ground / dir.y;
        vec3  P = dir * t;
        float haze = exp( -t * 0.008 );
        float grid = 1.0
                     - smoothstep( 0.0, 0.06,
                                   min( abs( fract( P.x / 10.0 ) - 0.5 ), abs( fract( P.z / 10.0 ) - 0.5 ) ) - 0.44 );
        col = vec3( 0.10, 0.11, 0.13 ) * ( 0.7 + 0.4 * noise2( P.xz * 0.2 ) ) + vec3( 0.06 ) * grid;
        col *= 0.4 + 0.6 * swell;
        if ( shadowMapP > 0.0 )
            col *= 1.0 - 0.65 * shadowMapP * ( 1.0 - smShadow( P, vec3( 0.0, 1.0, 0.0 ) ) ); // patch_shadow3d.py
        col = mix( vec3( 0.02 ), col, haze );
    }
    else
    {
        // The wall, and the rail the pendulums hang from.
        float az = atan( dir.x, dir.z );
        float h = clamp( dir.y, 0.0, 1.0 );
        col = vec3( 0.14, 0.15, 0.18 )
              * ( 0.6
                  + 0.6
                        * mix( fbm2( vec2( az * 6.0, dir.y * 8.0 ) ),
                               fbm2( vec2( ( az - 6.2831853 ) * 6.0, dir.y * 8.0 ) ), seamW( az ) ) )
              * exp( -h * 2.5 );
        float rail_e = atan( PivotY + 1.5, Dist );
        float rail = 1.0 - smoothstep( 0.004, 0.009, abs( dir.y - rail_e ) );
        col += vec3( 0.6, 0.6, 0.65 ) * rail * 0.6;
        col *= 0.4 + 0.6 * swell;
        col += vec3( 1.0, 0.9, 0.75 ) * exp( -distance( dir, normalize( vec3( 0.0, 0.8, 1.0 ) ) ) * 4.0 ) * 0.14
               * ( 0.5 + 0.5 * swell );
    }
    return col;
}

/** Entry point of this shader stage (the file description says what it draws). */
void main()
{
    if ( shadowPass > 0.5 )
    {
        fragColor = vec4( 0.0 ); // the depth pass (patch_shadow3d.py): nothing to shade
        return;
    }
    if ( vBg > 0.5 )
    {
        fragColor = vec4( renderSky( normalize( vPos ) ), 1.0 );
        if ( shaftP > 0.0 && shadowMapP > 0.0 )
            fragColor.rgb = smShafts( fragColor.rgb, vPos, true ); // patch_shaft3d.py
        return;
    }

    float hue = ( hueP > 0.01 ? hueP : 0.0 );
    float swell = clamp( audioSwell, 0.0, 1.0 );
    float beat = clamp( audioBeat, 0.0, 1.0 );
    float bass = clamp( audioBass, 0.0, 1.0 );

    vec4 base = texture( texMeshMaterial, vec3( vUV, 0.0 ) );
    if ( base.a < 0.1 )
        discard;
    float roughness = 0.4, metallic = 0.6;
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

    vec3 lamp_dir = normalize( vec3( 0.0, 0.8, -0.6 ) );
    vec3 col = alb * vec3( 1.0, 0.92, 0.8 ) * max( dot( n, lamp_dir ), 0.0 ) * ( 0.9 + 0.8 * swell );
    if ( shadowMapP > 0.0 )
        col *= 1.0 - shadowMapP * ( 1.0 - smShadow( vPos, n ) ); // the lamp's shadow (patch_shadow3d.py)
    col += alb * vec3( 0.18, 0.19, 0.24 ) * ( 0.55 + 0.45 * n.y ) * 0.6;
    col += alb * 0.05;

    vec3  half_v = normalize( lamp_dir + view_dir );
    float spec = pow( max( dot( n, half_v ), 0.0 ), mix( 90.0, 8.0, roughness ) );
    col += mix( vec3( 1.0, 0.95, 0.85 ), base.rgb, metallic ) * spec * ( 0.4 + 0.8 * metallic );

    // The bob glows with the bass; the pendulum passing through centre
    // lights on the beat.
    float bob = smoothstep( -0.45, -0.7, vLocal.y );
    col += vec3( 1.0, 0.7, 0.35 ) * bob * ( 0.05 + 0.6 * bass );
    float centre = 1.0 - smoothstep( 0.0, 0.25, abs( vSwing ) );
    col += vec3( 0.8, 0.9, 1.0 ) * centre * beat * 0.9;

    float fres = pow( 1.0 - max( dot( n, view_dir ), 0.0 ), 4.0 );
    col += vec3( 0.9, 0.9, 1.0 ) * fres * 0.12;

    if ( hue > 0.001 )
        col = hueRot( col, 0.08 * sin( hue ) );

    vec3 cat_tone = max( col, 0.0 );
    cat_tone /= 1.0 + 0.30 * max( cat_tone.r, max( cat_tone.g, cat_tone.b ) );
    fragColor = vec4( clamp( cat_tone, 0.0, 1.0 ), 1.0 );
    if ( shaftP > 0.0 && shadowMapP > 0.0 )
        fragColor.rgb = smShafts( fragColor.rgb, vPos, false ); // patch_shaft3d.py
}
