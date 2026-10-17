#version 330 core
/*****************************************************************************\
 *                              IndustrialStation.frag
\*****************************************************************************/
/*! @file
 *
 *  @brief
 *  GEOM="MESH" STATION FAMILY: mining/refinery/salvage hulls (asteroid refineries, mining cores, fuel depots, ice
 *  processors, scrap yards), shown drifting through a real asteroid field painted onto the sky shell
 *  Scene3DShader::buildGeometry() appends after the loaded mesh (see IndustrialStation.vert) -- vBg selects shell
 *  vs. hull.
 *
 *  Dim, grimy ambient light plus a warm furnace/vent glow that flickers with the beat, standing in for open
 *  smelting/venting machinery; no photo-tinting on the hull itself -- the field carries the color.
 *
 *    audioKick    -> furnace-glow flare
 *    audioSwell   -> ambient light level (never fully bright -- this is a
 *                    working yard, not a showroom)
 *    audioAdvance -> tumble speed (vertex stage)
 *
 *  Per-instance: sizeP (relative scale), glowP (furnace-glow intensity).
 *  Per-activation variety: hueP float palette offset (0..6.28).
 *
 *  @author René Weller
 */
out vec4 fragColor; ///< The pixel's colour (output).

uniform sampler2DArray texMeshMaterial;       ///< The mesh's material textures (albedo, roughness, normal ...).
uniform int            texMeshMaterialLayers; ///< Number of layers in texMeshMaterial.

uniform float time;         ///< Seconds since this activation, plus a rolled start (see sceneTime).
uniform float audioAdvance; ///< The music's advance: integrated tempo-weighted energy (never jumps, never runs
                            ///< backwards).
uniform float audioBass;    ///< Bass band level, 0..1.
uniform float audioKick;    ///< Kick-drum envelope, 0..1 (fast attack, short decay).
uniform float audioSwell;   ///< Slow loudness envelope, 0..1 (seconds).

uniform float hueP;  ///< Hue knob (radians), usually the music's chroma hue plus a rolled offset.
uniform float glowP; ///< Glow / afterglow knob, 0..1.

in vec2  vUV;     ///< Texture coordinate 0..1 over the screen (from the vertex stage).
in vec3  vNormal; ///< Surface normal (from the vertex stage).
in vec3  vPos;    ///< Position (from the vertex stage).
in float vBg;     ///< Background flag (from the vertex stage).

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

// ---- Sky shell: shared hash/noise/fbm + a scattered rock field ----
/**  Pseudo-random number 0..1 from a 3D point.
 *
 * @param p  The point. (in)
 *
 * @return
 *   A pseudo-random number 0..1.
 **/
float hash13( vec3 p )
{
    p = fract( p * 0.3183099 + vec3( 0.71, 0.113, 0.419 ) );
    p *= 17.0;
    return fract( p.x * p.y * p.z * ( p.x + p.y + p.z ) );
}
/**  Smooth 3D value noise, 0..1.
 *
 * @param x  The point. (in)
 *
 * @return
 *   The noise value, 0..1.
 **/
float noise3( vec3 x )
{
    vec3 i = floor( x ), f = fract( x );
    f = f * f * ( 3.0 - 2.0 * f );
    float n000 = hash13( i + vec3( 0.0, 0.0, 0.0 ) ), n100 = hash13( i + vec3( 1.0, 0.0, 0.0 ) );
    float n010 = hash13( i + vec3( 0.0, 1.0, 0.0 ) ), n110 = hash13( i + vec3( 1.0, 1.0, 0.0 ) );
    float n001 = hash13( i + vec3( 0.0, 0.0, 1.0 ) ), n101 = hash13( i + vec3( 1.0, 0.0, 1.0 ) );
    float n011 = hash13( i + vec3( 0.0, 1.0, 1.0 ) ), n111 = hash13( i + vec3( 1.0, 1.0, 1.0 ) );
    return mix( mix( mix( n000, n100, f.x ), mix( n010, n110, f.x ), f.y ),
                mix( mix( n001, n101, f.x ), mix( n011, n111, f.x ), f.y ), f.z );
}
/**  Fractal noise: octaves of value noise.
 *
 * @param p  The point. (in)
 *
 * @return
 *   The fractal noise value, about 0..1.
 **/
float fbm( vec3 p )
{
    float v = 0.0, a = 0.5;
    for ( int i = 0; i < 5; ++i )
    {
        v += a * noise3( p );
        p = p * 2.03 + 7.1;
        a *= 0.5;
    }
    return v;
}
/**  Star field brightness for a direction.
 *
 * @param dir      The view direction. (in)
 * @param density  Share of grid cells with a star, 0..1. (in)
 *
 * @return
 *   The star brightness, 0..1.
 **/
float starsField( vec3 dir, float density )
{
    float h = hash13( floor( dir * 500.0 ) );
    return smoothstep( 1.0 - density, 1.0, h );
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
    // Loose rocks drifting over a faint dust haze, plus stars showing through the gaps.
    float haze = fbm( dir * 1.6 );
    // The beat lives HERE now. The hulls hold still (their kick hops and
    // the camera's swell-dolly are gone), so the backgrounds carry the
    // music: a kick pulse on the dominant glow, sized to read clearly
    // without breaking the temporal budget's full-frame brightness cap.
    vec3 col = vec3( 0.026, 0.024, 0.022 )
               + vec3( 0.13, 0.115, 0.10 ) * haze * ( 0.80 + 0.25 * audioBass + 0.20 * audioKick );
    // The rocks (17.10.2026): round, lit bodies in two layers -- a hard threshold of an fbm drew flat tan blobs with
    // the outline of camouflage, which read as stains on the sky, not as an asteroid field.  Each rock sits in one
    // cell of a grid over the direction (small enough to stay inside it, so no neighbour search), with a ragged
    // edge, a lit side toward the scene's sun and a dark side.
    vec3  sun = normalize( vec3( 0.55, 0.35, -0.75 ) );
    float rocks = 0.0;
    for ( int L = 0; L < 2; ++L )
    {
        float K = ( L == 0 ) ? 11.0 : 23.0;
        vec3  g = dir * K;
        vec3  gi = floor( g );
        float h = hash13( gi + float( L ) * 17.0 );
        if ( h > 0.16 )
            continue;
        vec3 c = gi + 0.5 + ( vec3( hash13( gi + 3.1 ), hash13( gi + 5.7 ), hash13( gi + 8.3 ) ) - 0.5 ) * 0.3;
        vec3 d = g - c;
        d -= dir * dot( d, dir ); // across the line of sight
        float r = ( 0.14 + 0.18 * hash13( gi + 11.9 ) ) * ( 0.85 + 0.3 * noise3( d * 7.0 + gi ) );
        float cov = smoothstep( r, r * 0.82, length( d ) );
        if ( cov <= 0.0 )
            continue;
        // A sphere's shading from the offset: the side toward the sun bright, the far side dark.
        vec3  sp = sun - dir * dot( sun, dir );
        float nz = sqrt( max( 1.0 - dot( d, d ) / ( r * r ), 0.0 ) );
        float lit = clamp( dot( d / r, sp ) * 0.9 + 0.45 * nz, 0.0, 1.0 );
        vec3  rock = vec3( 0.30, 0.26, 0.22 ) * ( 0.10 + 1.4 * lit ) * ( 0.75 + 0.5 * noise3( d * 16.0 + gi ) )
                     * ( L == 0 ? 1.0 : 0.7 );
        col = mix( col, rock, cov );
        rocks = max( rocks, cov );
    }
    col += vec3( 1.0 ) * starsField( dir, 0.0012 ) * ( 1.0 - rocks );
    return col;
}

// ---- normal mapping ------------------------------------------------------
/**  Layer 2 of the material array is a tangent-space normal map, present on the assets whose generator run produced a
 * usable one (about a fifth of them).
 *
 * @param N   The surface normal. (in)
 * @param p   The position (world). (in)
 * @param uv  The texture coordinate. (in)
 *
 * @return
 *   The tangent frame (tangent, bitangent, normal) as the columns of a matrix.
 *
 * There are no tangents in the vertex format -- it is a fixed 8 floats shared
 * by every geom kind -- so the frame is rebuilt per fragment from screen-space
 * derivatives of position and UV. That is the standard cotangent-frame trick,
 * and it costs nothing in the vertex stage and no change to the buffer layout.
 * A model WITHOUT a normal map has materialLayers < 3 and this returns the
 * interpolated normal untouched, so every scene works either way.
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
    // A degenerate tap (an all-black texel from a failed decode) would
    // normalize to garbage and pit the whole surface.
    if ( dot( m, m ) < 1e-4 )
        return n;
    m.xy *= strength;
    return normalize( cotangentFrame( n, wpos, uv ) * normalize( m ) );
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
    float gp = ( glowP > 0.01 ? glowP : 1.0 );

    vec4 base = texture( texMeshMaterial, vec3( vUV, 0.0 ) );
    if ( base.a < 0.1 )
        discard;
    float roughness = 0.75, metallic = 0.5;
    if ( texMeshMaterialLayers >= 2 )
    {
        vec4 mr = texture( texMeshMaterial, vec3( vUV, 1.0 ) );
        roughness = mr.g;
        metallic = mr.b;
    }

    vec3 n = normalize( vNormal );
    // Relief from the material's normal map, where the asset has one.
    n = perturbNormal( texMeshMaterial, texMeshMaterialLayers, vUV, n, vPos, 1.0 );
    vec3 view_dir = normalize( -vPos );

    // A dim, cold ambient wash -- this yard runs on its own furnace glow,
    // not daylight.
    vec3  light_dir = normalize( vec3( 0.3, 0.55, -0.5 ) );
    float diff = max( dot( n, light_dir ), 0.0 );
    float fill = 0.4 + 0.4 * dot( n, vec3( 0.0, 1.0, 0.0 ) );

    vec3  half_v = normalize( light_dir + view_dir );
    float spec = pow( max( dot( n, half_v ), 0.0 ), mix( 30.0, 6.0, roughness ) );
    vec3  spec_color = mix( vec3( 0.9 ), base.rgb, metallic );

    vec3 col = base.rgb * ( 0.32 + diff * ( 1.1 + 0.35 * audioSwell ) + fill * 0.22 );
    col += spec_color * spec * ( 0.45 + 0.5 * ( 1.0 - roughness ) );

    // Furnace/vent glow: dark patches of the baked albedo (vents, exposed
    // machinery, shadowed gaps) flare orange on the beat -- an open
    // smelting process reacting to the music, not a lit window.
    // These industrial hulls' baked albedo runs uniformly dark (measured on
    // AsteroidRefinery's own texture: 90% of its pixels fall under luma
    // 0.19) -- a threshold tuned for a normal-brightness texture would treat
    // nearly the WHOLE surface as "vent", not just the genuinely darkest
    // gaps, and the flare below would read as an all-over glow instead of a
    // handful of hot spots.
    float luma = dot( base.rgb, vec3( 0.299, 0.587, 0.114 ) );
    float vent_mask = 1.0 - smoothstep( 0.03, 0.12, luma );
    float flare = 0.15 + 0.25 * sin( time * 3.0 ) + 0.7 * audioKick;
    col += vec3( 1.0, 0.42, 0.08 ) * vent_mask * max( flare, 0.0 ) * gp * ( 0.4 + 0.3 * audioSwell );

    // A cool fixed rim so the hull still separates from pure black -- kept
    // modest, this is an accent, not a wash. The field outside now carries
    // the color variety, not a photo-tinted hull.
    float fresnel = pow( 1.0 - max( dot( n, view_dir ), 0.0 ), 4.0 );
    col += vec3( 0.6, 0.7, 0.8 ) * fresnel * ( 0.08 + 0.15 * audioSwell );

    if ( hue > 0.001 )
        col = hueRot( col, 0.15 * sin( hue ) );

    vec3 cat_tone = max( col, 0.0 );
    cat_tone /= 1.0 + 0.35 * max( cat_tone.r, max( cat_tone.g, cat_tone.b ) );
    fragColor = vec4( clamp( cat_tone, 0.0, 1.0 ), 1.0 );
}
