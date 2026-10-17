#version 330 core
/*****************************************************************************\
 *                              MeshSeismograph.frag
\*****************************************************************************/
/*! @file
 *
 *  @brief
 *  MESH SEISMOGRAPH: a real drum seismograph -- the cast-iron base with its pen arm (model=) and the paper drum
 *  (model2=) turning under the pen on time.
 *
 *  The trace on the paper is REAL: the last revolution of the drum carries the bass energy of the last eighteen
 *  seconds, read from the engine's spectrogram ring (texSpectro) at the age each point on the paper passed under
 *  the pen, drawn as a wandering ink line; older revolutions are the faint helix of earlier traces. A desk lamp
 *  with the swell; the kick makes the pen's ink bloom. The mesh counterpart of the procedural SeismographDrum.
 *
 *  Audio Reactivity:
 *    texSpectro (bass band history) -> the trace (light: ink on paper)
 *    audioKick  -> ink bloom at the pen (light)
 *    audioSwell -> lamp (slow)
 *    time       -> the drum turns (continuous, vertex stage)
 *
 *  Per-instance: sizeP, drumP, drumXP/YP/ZP. Per-activation variety: hueP.
 *
 *  @author René Weller
 */
out vec4 fragColor; ///< The pixel's colour (output).

uniform sampler2DArray texMeshMaterial;        ///< the base
uniform int            texMeshMaterialLayers;  ///< Number of layers in texMeshMaterial.
uniform sampler2DArray texMeshMaterial2;       ///< the drum
uniform int            texMeshMaterialLayers2; ///< Number of layers in the second mesh's material textures.

uniform sampler2D texSpectro;  ///< 32 log-spaced bands across, ~20 s of history down (ring)
uniform float     spectroHead; ///< T coordinate of "now"
uniform float     spectroFill; ///< How full the spectrogram ring texSpectro is, 0..1 (after a scene start).

uniform float time;       ///< Seconds since this activation, plus a rolled start (see sceneTime).
uniform float audioKick;  ///< Kick-drum envelope, 0..1 (fast attack, short decay).
uniform float audioSwell; ///< Slow loudness envelope, 0..1 (seconds).
uniform float audioLevel; ///< Overall loudness, 0..1.

uniform float hueP; ///< Hue knob (radians), usually the music's chroma hue plus a rolled offset.

in vec2  vUV;     ///< Texture coordinate 0..1 over the screen (from the vertex stage).
in vec3  vNormal; ///< Surface normal (from the vertex stage).
in vec3  vPos;    ///< Position (from the vertex stage).
in vec3  vLocal;  ///< Object-space position (from the vertex stage).
in float vBg;     ///< Background flag (from the vertex stage).
in float vDrum;   ///< Drum (from the vertex stage).
in float vTurn;   ///< Turn (from the vertex stage).

const float Dist = 46.0;       ///< Distance of the main object from the camera (world units).
const float Ground = -16.0;    ///< Height of the ground (world units).
const float Rate = 0.35;       ///< Turning speed of the drum (radians per second).
const float PenAngle = 1.5708; ///< the pen touches the top of the drum (+Y in the drum's frame at turn 0)

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
    // The lamp at 0.75 .. 1.25 with the swell (17.10.2026): from 0.45 the object stood dim on a dark floor in quiet
    // music.
    float lamp = 0.75 + 0.5 * swell;
    vec3  col;
    if ( dir.y < -0.004 )
    {
        float t = Ground / dir.y;
        vec3  P = dir * t;
        float haze = exp( -t * 0.010 );
        float grain = 0.7 + 0.4 * noise2( vec2( P.x * 0.4, P.z * 3.0 ) );
        col = vec3( 0.32, 0.24, 0.14 ) * grain * lamp;
        col += vec3( 1.0, 0.85, 0.6 ) * exp( -length( P.xz - vec2( 6.0, 40.0 ) ) * 0.05 ) * 0.3 * lamp;
        col = mix( vec3( 0.02 ), col, haze );
    }
    else
    {
        float h = clamp( dir.y, 0.0, 1.0 );
        float az = atan( dir.x, dir.z );
        col = vec3( 0.18, 0.19, 0.17 )
              * ( 0.6
                  + 0.5
                        * mix( noise2( vec2( az * 6.0, dir.y * 8.0 ) ),
                               noise2( vec2( ( az - 6.2831853 ) * 6.0, dir.y * 8.0 ) ), seamW( az ) ) )
              * exp( -h * 3.0 ) * lamp;
        col += vec3( 1.0, 0.85, 0.6 ) * exp( -distance( dir, normalize( vec3( 0.35, 0.65, 1.0 ) ) ) * 4.0 ) * 0.18
               * lamp;
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
    // The lamp at 0.75 .. 1.25 with the swell (17.10.2026): from 0.45 the object stood dim on a dark floor in quiet
    // music.
    float lamp = 0.75 + 0.5 * swell;
    bool  drum = vDrum > 0.5;

    vec4  base;
    float roughness = 0.5, metallic = 0.3;
    float expose;
    if ( drum )
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

    if ( drum )
    {
        // The paper: the pale unsaturated texels round the cylinder.
        float luma = dot( base.rgb, vec3( 0.299, 0.587, 0.114 ) );
        float mx = max( base.r, max( base.g, base.b ) );
        float mn = min( base.r, min( base.g, base.b ) );
        float paper = smoothstep( 0.30, 0.55, luma )
                      * ( 1.0 - smoothstep( 0.15, 0.35, ( mx - mn ) / max( mx, 1e-3 ) ) );
        // Where on the cylinder: the angle round the axle, and the position along it.
        float phi = atan( vLocal.y, vLocal.z );
        // This point passed under the pen when the drum had turned by (PenAngle - phi).
        float since = mod( vTurn - ( PenAngle - phi ), 6.2831853 ) / Rate; // seconds ago, one revolution at most
        float age01 = clamp( since / 20.0, 0.0, 0.95 );
        float e = texture( texSpectro, vec2( 0.08, fract( spectroHead - age01 ) ) ).r;
        float fine = texture( texSpectro, vec2( 0.45, fract( spectroHead - age01 ) ) ).r;
        e = clamp( e * 1.4, 0.0, 1.0 ) * min( spectroFill * 4.0, 1.0 );
        // The pen creeps along the drum as it turns, so the trace is a helix.
        float slow = fract( ( time - since ) / 140.0 );
        float x_pen = -0.70 + 1.40 * slow;
        float wiggle = ( e - 0.12 ) * 0.35 * sin( since * 9.0 + phi * 3.0 )
                       + ( fine - 0.1 ) * 0.12 * sin( since * 31.0 );
        // The line a little wider (17.10.2026): at 0.010 .. 0.022 of the drum's length it was one pixel at 720p.
        float ink = 1.0 - smoothstep( 0.016, 0.034, abs( vLocal.x - ( x_pen + wiggle ) ) );
        ink *= paper * smoothstep( 0.0, 0.06, age01 );
        // Older revolutions: the faint helix of earlier traces.
        float older = 0.0;
        for ( int k = 1; k < 5; ++k )
        {
            float xk = x_pen - float( k ) * ( 6.2831853 / Rate ) / 140.0 * 1.40;
            float wk = 0.08 * sin( phi * 7.0 + float( k ) * 2.0 )
                       * ( 0.3
                           + 0.7
                                 * mix( noise2( vec2( phi * 3.0, float( k ) ) ),
                                        noise2( vec2( ( phi - 6.2831853 ) * 3.0, float( k ) ) ), seamW( phi ) ) );
            older += ( 1.0 - smoothstep( 0.008, 0.018, abs( vLocal.x - ( xk + wk ) ) ) ) * 0.45;
        }
        older *= paper;
        vec3 col = alb * vec3( 1.0, 0.92, 0.78 )
                   * ( 0.5 + 0.5 * max( dot( n, normalize( vec3( 0.3, 0.7, -0.5 ) ) ), 0.0 ) ) * 1.2 * lamp;
        col += alb * 0.08;
        col = mix( col, vec3( 0.04, 0.04, 0.06 ), clamp( ink + older, 0.0, 1.0 ) );
        // The ink blooms at the pen on the kick.
        float at_pen = 1.0
                       - smoothstep( 0.0, 0.15,
                                     abs( atan( sin( phi - ( PenAngle - mod( vTurn, 6.2831853 ) ) ),
                                                cos( phi - ( PenAngle - mod( vTurn, 6.2831853 ) ) ) ) ) );
        col = mix( col, vec3( 0.05, 0.05, 0.10 ), at_pen * paper * kick * 0.6 );
        if ( hue > 0.001 )
            col = hueRot( col, 0.05 * sin( hue ) );
        vec3 _t = max( col, 0.0 );
        _t /= 1.0 + 0.30 * max( _t.r, max( _t.g, _t.b ) );
        fragColor = vec4( clamp( _t, 0.0, 1.0 ), 1.0 );
        return;
    }

    vec3 lamp_dir = normalize( vec3( 0.3, 0.7, -0.5 ) );
    vec3 col = alb * vec3( 1.0, 0.9, 0.75 ) * max( dot( n, lamp_dir ), 0.0 ) * 1.2 * lamp;
    col += alb * vec3( 0.18, 0.18, 0.20 ) * ( 0.55 + 0.45 * n.y ) * 0.6;
    col += alb * 0.05;
    vec3  half_v = normalize( lamp_dir + view_dir );
    float spec = pow( max( dot( n, half_v ), 0.0 ), mix( 80.0, 8.0, roughness ) );
    col += mix( vec3( 1.0, 0.95, 0.85 ), base.rgb, metallic ) * spec * ( 0.3 + 0.7 * metallic ) * lamp;
    float fres = pow( 1.0 - max( dot( n, view_dir ), 0.0 ), 4.0 );
    col += vec3( 1.0, 0.85, 0.65 ) * fres * 0.12 * lamp;

    if ( hue > 0.001 )
        col = hueRot( col, 0.06 * sin( hue ) );

    // x1.30 (17.10.2026): the screen showed 0.043 of full brightness on the average, after the auto exposure.
    vec3 cat_tone = max( col * 1.3, 0.0 );
    cat_tone /= 1.0 + 0.30 * max( cat_tone.r, max( cat_tone.g, cat_tone.b ) );
    fragColor = vec4( clamp( cat_tone, 0.0, 1.0 ), 1.0 );
}
