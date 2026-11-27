#version 330 core
/*****************************************************************************\
 *                              MeshFoundryPour.frag
\*****************************************************************************/
/*! @file
 *
 *  @brief
 *  MESH FOUNDRY POUR: a real sand mould (model=) on the foundry floor and a real ladle (model2=) tipping molten
 *  metal into it on the scene clock.
 *
 *  The stream is painted on the shell along the line from the lip to the pouring cup (there is no geometry for it,
 *  and everything the stream crosses on screen is background); the melt spreads in the mould and cools from white
 *  through orange to dull red; sparks fly from the cup; the glow lights the whole shop. The bass is the furnace
 *  roar as light, the kick a burst of sparks, the swell the pour's brightness. The mesh counterpart of the
 *  procedural FoundryPour.
 *
 *  Audio Reactivity:
 *    sceneProgress -> the pour, the melt, the cooling (the clock)
 *    audioKick     -> spark bursts (light)
 *    audioBass     -> furnace glow (light)
 *    audioSwell    -> the stream's brightness (slow)
 *
 *  Per-instance: sizeP, ladleP, lipP. Per-activation variety: hueP.
 *
 *  @author René Weller
 */
out vec4 fragColor; ///< The pixel's colour (output).

uniform sampler2DArray texMeshMaterial;        ///< the mould
uniform int            texMeshMaterialLayers;  ///< Number of layers in texMeshMaterial.
uniform sampler2DArray texMeshMaterial2;       ///< the ladle
uniform int            texMeshMaterialLayers2; ///< Number of layers in the second mesh's material textures.

uniform float time;          ///< Seconds since this activation, plus a rolled start (see sceneTime).
uniform float sceneTime;     ///< Seconds since this scene was activated.
uniform float sceneProgress; ///< Progress through this scene's solo time, 0..1.
uniform float audioKick;     ///< Kick-drum envelope, 0..1 (fast attack, short decay).
uniform float audioBass;     ///< Bass band level, 0..1.
uniform float audioSwell;    ///< Slow loudness envelope, 0..1 (seconds).

uniform float hueP; ///< Hue knob (radians), usually the music's chroma hue plus a rolled offset.

in vec2  vUV;     ///< Texture coordinate 0..1 over the screen (from the vertex stage).
in vec3  vNormal; ///< Surface normal (from the vertex stage).
in vec3  vPos;    ///< Position (from the vertex stage).
in vec3  vLocal;  ///< Object-space position (from the vertex stage).
in float vBg;     ///< Background flag (from the vertex stage).
in float vLadle;  ///< Ladle (from the vertex stage).
in float vPour;   ///< Pour (from the vertex stage).
in vec3  vLip;    ///< Lip (from the vertex stage).
in vec3  vCup;    ///< Cup (from the vertex stage).

const float Dist = 48.0;    ///< Distance of the main object from the camera (world units).
const float Ground = -18.0; ///< Height of the ground (world units).

// ---- shadow map of the scene's lamp (Tools/scenegen/patch_shadow3d.py) ----
uniform float           shadowPass;                           ///< 1 during the shadow map's depth-only pass.
uniform sampler2DShadow texShadow;                            ///< The lamp's shadow map (depth comparison).
uniform float           shadowTexel;                          ///< Size of a shadow-map texel (texture coordinates).
uniform float           shadowMapP; ///< Lamp shadow: 0 = none (the old look, no depth pass) .. 1 = full.
const vec3              SmLamp = vec3( -0.2, 0.8, -0.5 );     ///< Toward the lamp main() shades with.
const vec3              SmCentre = vec3( 0.0, Ground, Dist ); ///< Centre of the shadow box (world units).
const float             SmBox = 35.0;                         ///< Half size of the shadow box (world units).

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
const vec3 ShaftCol = vec3( 0.7, 0.7, 0.75 ); ///< Colour of the lamp's light in the haze.

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

/**  Heat colour: white-hot down to dull red.
 *
 * @param h  Heat, 0..1. (in)
 *
 * @return
 *   The colour (RGB).
 **/
vec3 heatCol( float h )
{
    return mix( mix( vec3( 0.25, 0.02, 0.0 ), vec3( 1.0, 0.35, 0.05 ), smoothstep( 0.0, 0.5, h ) ),
                vec3( 1.0, 0.92, 0.75 ), smoothstep( 0.5, 1.0, h ) );
}

/**  Distance from a direction to the great-circle segment between two directions.
 *
 * @param d  The direction. (in)
 * @param a  One end. (in)
 * @param b  The other end. (in)
 * @param u  Receives the parameter of the closest point, 0..1. (out)
 *
 * @return
 *   The distance.
 **/
float segDist( vec3 d, vec3 a, vec3 b, out float u )
{
    vec3 ab = b - a;
    u = clamp( dot( d - a, ab ) / max( dot( ab, ab ), 1e-6 ), 0.0, 1.0 );
    return distance( d, normalize( a + ab * u ) );
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
    float bass = clamp( audioBass, 0.0, 1.0 );
    float kick = clamp( audioKick, 0.0, 1.0 );
    float swell = clamp( audioSwell, 0.0, 1.0 );
    float pour = vPour;
    vec3  col;
    float az = atan( dir.x, dir.z );
    if ( dir.y < -0.004 )
    {
        float t = Ground / dir.y;
        vec3  P = dir * t;
        float haze = exp( -t * 0.008 );
        col = vec3( 0.12, 0.10, 0.08 ) * ( 0.6 + 0.6 * noise2( P.xz * 0.15 ) );
        col += vec3( 1.0, 0.45, 0.12 ) * exp( -length( P.xz - vCup.xz ) * 0.05 ) * ( 0.3 + 1.2 * pour );
        if ( shadowMapP > 0.0 )
            col *= 1.0 - 0.65 * shadowMapP * ( 1.0 - smShadow( P, vec3( 0.0, 1.0, 0.0 ) ) ); // patch_shadow3d.py
        col = mix( vec3( 0.02 ), col, haze );
    }
    else
    {
        float h = clamp( dir.y, 0.0, 1.0 );
        col = vec3( 0.10, 0.08, 0.07 )
              * ( 0.6
                  + 0.5
                        * mix( noise2( vec2( az * 6.0, dir.y * 8.0 ) ),
                               noise2( vec2( ( az - 6.2831853 ) * 6.0, dir.y * 8.0 ) ), seamW( az ) ) )
              * exp( -h * 2.5 );
        // The furnace mouth, low on the right: the bass is its roar as light.
        float mouth = step( abs( az - 0.95 ), 0.10 ) * step( 0.0, dir.y ) * step( dir.y, 0.14 );
        col += vec3( 1.0, 0.45, 0.10 ) * mouth * ( 0.5 + 1.2 * bass );
        col += vec3( 1.0, 0.4, 0.1 )
               * exp( -distance( dir, normalize( vec3( sin( 0.95 ), 0.07, cos( 0.95 ) ) ) ) * 5.0 )
               * ( 0.15 + 0.35 * bass );
    }
    // The stream: from the lip to the cup, wavering, bright.
    if ( pour > 0.01 )
    {
        vec3  a = normalize( vLip ), b = normalize( vCup );
        float u;
        float d = segDist( dir, a, b, u );
        float waver = 0.004 * sin( u * 40.0 - sceneTime * 12.0 ) * ( 1.0 - u );
        float w = 0.010 + 0.006 * u;
        float core = 1.0 - smoothstep( w * 0.5, w, abs( d - waver ) );
        float glow = exp( -d * 90.0 );
        col += heatCol( 0.9 ) * core * pour * ( 2.0 + 1.0 * swell );
        col += vec3( 1.0, 0.5, 0.15 ) * glow * pour * 0.6;
    }
    // Sparks from the cup: round points on their own arcs, the kick a burst.
    vec3 c = normalize( vCup );
    for ( int i = 0; i < 24; ++i )
    {
        float fi = float( i );
        float life = fract( sceneTime * ( 0.5 + 0.4 * hash11( fi ) ) + hash11( fi + 7.0 ) );
        float ang = hash11( fi + 3.0 ) * 3.14159 - 1.57;
        float r = life * ( 0.06 + 0.08 * hash11( fi + 9.0 ) );
        vec3  sp = normalize( c + vec3( sin( ang ) * r, r * 1.4 - life * life * 0.12, 0.0 ) );
        float dd = distance( dir, sp );
        col += vec3( 1.0, 0.7, 0.3 ) * ( 1.0 - smoothstep( 0.0025, 0.004, dd ) ) * ( 1.0 - life ) * ( 0.4 + 1.2 * kick )
               * pour;
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
    float bass = clamp( audioBass, 0.0, 1.0 );
    float kick = clamp( audioKick, 0.0, 1.0 );
    float pour = vPour;
    bool  ladle = vLadle > 0.5;

    vec4  base;
    float roughness = 0.7, metallic = 0.2;
    float expose;
    if ( ladle )
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
        expose = materialExposure( texMeshMaterial );
    }
    if ( base.a < 0.1 )
        discard;
    vec3 n = normalize( vNormal );
    vec3 view_dir = normalize( -vPos );
    vec3 alb = base.rgb * expose;

    // The shop's light: a dim lamp, the furnace from the right, and the
    // melt itself as two point lights (the lip and the cup).
    vec3 lamp_dir = normalize( vec3( -0.2, 0.8, -0.5 ) );
    vec3 col = alb * vec3( 0.7, 0.7, 0.75 ) * max( dot( n, lamp_dir ), 0.0 ) * 0.5;
    if ( shadowMapP > 0.0 )
        col *= 1.0 - shadowMapP * ( 1.0 - smShadow( vPos, n ) ); // the lamp's shadow (patch_shadow3d.py)
    col += alb * vec3( 1.0, 0.45, 0.15 ) * max( dot( n, normalize( vec3( 0.8, 0.1, 0.5 ) ) ), 0.0 )
           * ( 0.2 + 0.6 * bass );
    col += alb * vec3( 0.10, 0.09, 0.10 ) * 0.5;
    vec3 melt_col = vec3( 1.0, 0.55, 0.2 ) * ( 3.0 + 2.0 * pour );
    col += alb * lightAt( vPos, n, vCup + vec3( 0.0, 2.0, 0.0 ), melt_col * pour, 22.0 );
    col += alb * lightAt( vPos, n, vLip, melt_col * ( 0.4 + 0.6 * pour ), 18.0 );

    vec3  half_v = normalize( lamp_dir + view_dir );
    float spec = pow( max( dot( n, half_v ), 0.0 ), mix( 60.0, 8.0, roughness ) );
    col += mix( vec3( 1.0 ), base.rgb, metallic ) * spec * 0.2;

    float luma = dot( base.rgb, vec3( 0.299, 0.587, 0.114 ) );
    if ( ladle )
    {
        // The lining glows from inside: the upward-facing interior.
        float inside = smoothstep( 0.1, 0.6, vLocal.y ) * smoothstep( 0.0, 0.5, n.y );
        col += heatCol( 0.85 ) * inside * ( 0.6 + 0.8 * pour ) * ( 0.7 + 0.5 * bass );
    }
    else
    {
        // The melt in the mould: the cavity (the dark texels on the top)
        // fills as the pour runs and cools from the edges afterwards.
        float top = smoothstep( 0.55, 0.85, vLocal.y ) * smoothstep( 0.3, 0.8, n.y );
        float cavity = top * ( 1.0 - smoothstep( 0.25, 0.45, luma ) );
        float fill = smoothstep( 0.20, 0.55, sceneProgress );
        float cool = smoothstep( 0.55, 1.0, sceneProgress );
        float heat = fill * ( 1.0 - 0.8 * cool );
        col = mix( col, heatCol( heat ) * ( 1.5 + 0.6 * bass ), cavity * fill );
    }

    float fres = pow( 1.0 - max( dot( n, view_dir ), 0.0 ), 4.0 );
    col += vec3( 1.0, 0.5, 0.2 ) * fres * ( 0.1 + 0.3 * pour );

    if ( hue > 0.001 )
        col = hueRot( col, 0.06 * sin( hue ) );

    vec3 cat_tone = max( col, 0.0 );
    cat_tone /= 1.0 + 0.30 * max( cat_tone.r, max( cat_tone.g, cat_tone.b ) );
    fragColor = vec4( clamp( cat_tone, 0.0, 1.0 ), 1.0 );
    if ( shaftP > 0.0 && shadowMapP > 0.0 )
        fragColor.rgb = smShafts( fragColor.rgb, vPos, false ); // patch_shaft3d.py
}
