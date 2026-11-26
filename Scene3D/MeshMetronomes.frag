#version 330 core
/*****************************************************************************\
 *                              MeshMetronomes.frag
\*****************************************************************************/
/*! @file
 *
 *  @brief
 *  MESH METRONOMES: twelve real metronomes (body model= and a rod from model2=, instances="12") on a bench in two
 *  rows, each ticking at its own tempo, their rods swinging on time.
 *
 *  Each body answers a spectrum band, glowing on its scale plate; the brass weights glint on the kick and flash at
 *  the ends of their swings (the tick); the swell is the lamp. The mesh counterpart of the procedural
 *  MetronomeForest.
 *
 *  Audio Reactivity:
 *    audioSpectrum[32] -> each body's band glow (light)
 *    audioKick         -> weights glint (light)
 *    audioSwell        -> lamp (slow)
 *    time              -> the swings and the ticks (continuous)
 *
 *  Per-instance: sizeP, armP, pivotP, frontP. Per-activation variety: hueP.
 *
 *  @author René Weller
 */
out vec4 fragColor; ///< The pixel's colour (output).

uniform sampler2DArray texMeshMaterial;        ///< the body
uniform int            texMeshMaterialLayers;  ///< Number of layers in texMeshMaterial.
uniform sampler2DArray texMeshMaterial2;       ///< the rod
uniform int            texMeshMaterialLayers2; ///< Number of layers in the second mesh's material textures.

uniform float time;              ///< Seconds since this activation, plus a rolled start (see sceneTime).
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
in float vArm;    ///< Arm (from the vertex stage).
in float vSwing;  ///< Swing (from the vertex stage).

const float Ground = -14.0; ///< Height of the ground (world units).

// ---- shadow map of the scene's lamp (Tools/scenegen/patch_shadow3d.py) ----
uniform float           shadowPass;                           ///< 1 during the shadow map's depth-only pass.
uniform sampler2DShadow texShadow;                            ///< The lamp's shadow map (depth comparison).
uniform float           shadowTexel;                          ///< Size of a shadow-map texel (texture coordinates).
uniform float           shadowMapP; ///< Lamp shadow: 0 = none (the old look, no depth pass) .. 1 = full.
const vec3              SmLamp = vec3( 0.3, 0.7, -0.55 );     ///< Toward the lamp main() shades with.
const vec3              SmCentre = vec3( 0.0, Ground, 52.0 ); ///< Centre of the shadow box (world units).
const float             SmBox = 45.0;                         ///< Half size of the shadow box (world units).

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
        // The bench: oak boards.
        float t = Ground / dir.y;
        vec3  P = dir * t;
        float haze = exp( -t * 0.010 );
        float board = smoothstep( 0.0, 0.03, abs( fract( P.z / 8.0 ) - 0.5 ) - 0.46 );
        float grain = 0.7 + 0.4 * noise2( vec2( P.x * 0.4, P.z * 3.0 ) );
        col = vec3( 0.40, 0.28, 0.15 ) * grain * ( 0.6 + 0.4 * board ) * lamp;
        if ( shadowMapP > 0.0 )
            col *= 1.0 - 0.65 * shadowMapP * ( 1.0 - smShadow( P, vec3( 0.0, 1.0, 0.0 ) ) ); // patch_shadow3d.py
        col = mix( vec3( 0.02 ), col, haze );
    }
    else
    {
        float h = clamp( dir.y, 0.0, 1.0 );
        col = vec3( 0.20, 0.18, 0.16 ) * ( 0.6 + 0.5 * noise2( vec2( atan( dir.x, dir.z ) * 6.0, dir.y * 8.0 ) ) )
              * exp( -h * 3.0 ) * lamp;
        col += vec3( 1.0, 0.85, 0.6 ) * exp( -distance( dir, normalize( vec3( 0.3, 0.7, 1.0 ) ) ) * 4.0 ) * 0.15 * lamp;
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
        return;
    }

    float hue = ( hueP > 0.01 ? hueP : 0.0 );
    float swell = clamp( audioSwell, 0.0, 1.0 );
    float kick = clamp( audioKick, 0.0, 1.0 );
    // The lamp at 0.75 .. 1.25 with the swell (17.10.2026): from 0.45 the object stood dim on a dark floor in quiet
    // music.
    float lamp = 0.75 + 0.5 * swell;
    int   i = int( vInst + 0.5 );
    float band = clamp( audioSpectrum[( i * 2 + 3 ) % 32] * 1.5, 0.0, 1.0 );
    bool  arm = vArm > 0.5;

    vec4  base;
    float roughness = 0.5, metallic = 0.2;
    float expose;
    if ( arm )
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

    vec3 lamp_dir = normalize( vec3( 0.3, 0.7, -0.55 ) );
    vec3 col = alb * vec3( 1.0, 0.88, 0.7 ) * max( dot( n, lamp_dir ), 0.0 ) * 1.2 * lamp;
    if ( shadowMapP > 0.0 )
        col *= 1.0 - shadowMapP * ( 1.0 - smShadow( vPos, n ) ); // the lamp's shadow (patch_shadow3d.py)
    col += alb * vec3( 0.20, 0.18, 0.20 ) * ( 0.55 + 0.45 * n.y ) * 0.6;
    col += alb * 0.05;

    vec3  half_v = normalize( lamp_dir + view_dir );
    float spec = pow( max( dot( n, half_v ), 0.0 ), mix( 90.0, 8.0, roughness ) );
    col += mix( vec3( 1.0, 0.95, 0.85 ), base.rgb, metallic ) * spec * ( 0.3 + 0.7 * metallic ) * lamp;

    if ( arm )
    {
        // The weight (the sphere, now at the top): the kick's glint, and the
        // tick at the ends of the swing.
        float weight = smoothstep( 0.2, 0.55, -vLocal.y ); // the sphere is the model's bottom, flipped up
        float tick = pow( abs( vSwing ), 14.0 );
        col += vec3( 1.0, 0.9, 0.7 ) * weight * ( 0.6 * kick + 0.5 * tick );
    }
    else
    {
        // The scale plate (pale texels on the front) glows with the band.
        float luma = dot( base.rgb, vec3( 0.299, 0.587, 0.114 ) );
        float plate = smoothstep( 0.35, 0.6, luma );
        col += hsv2rgb( vec3( float( i ) / 12.0, 0.45, 1.0 ) ) * plate * band * 0.7;
    }

    float fres = pow( 1.0 - max( dot( n, view_dir ), 0.0 ), 4.0 );
    col += vec3( 1.0, 0.85, 0.65 ) * fres * 0.12 * lamp;

    if ( hue > 0.001 )
        col = hueRot( col, 0.06 * sin( hue ) );

    vec3 cat_tone = max( col, 0.0 );
    cat_tone /= 1.0 + 0.30 * max( cat_tone.r, max( cat_tone.g, cat_tone.b ) );
    fragColor = vec4( clamp( cat_tone, 0.0, 1.0 ), 1.0 );
}
