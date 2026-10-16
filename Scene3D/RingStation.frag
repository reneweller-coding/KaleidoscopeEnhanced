#version 330 core
out vec4 fragColor; ///< The pixel's colour (output).
/**
 * @file RingStation.frag
 * @brief GEOM="MESH" STATION FAMILY: wheel/ring/torus-shaped stations (spin-
 * gravity habitats, research rings, jump-gate anchors, megastructure hubs),
 * shown against a real backdrop instead of flat black: a fake planet with
 * animated cloud cover plus a starfield, painted directly onto the sky
 * shell Scene3DShader::buildGeometry() appends after the loaded mesh (see
 * RingStation.vert) -- vBg selects which of the two this fragment belongs
 * to. The station itself keeps a plain cool starlight + warm window-glow
 * treatment (no photo-tinting): the "cool" part of this family now lives in
 * the environment, not in recoloring the hull.
 *   audioAdvance -> spin speed (vertex stage)
 *   audioSwell   -> key-light strength, window-glow brightness
 *   audioKick    -> window-glow flicker
 *
 * Per-instance (config attributes, all optional, sane defaults):
 *   sizeP   relative scale
 *   spinP   relative spin speed
 *   windowP window-glow intensity
 * Per-activation variety:
 *   hueP float palette offset (0..6.28)
 */

uniform sampler2DArray texMeshMaterial;       ///< The mesh's material textures (albedo, roughness, normal ...).
uniform int            texMeshMaterialLayers; ///< Number of layers in texMeshMaterial.

uniform float time;         ///< Seconds since the program started (never reset; see sceneTime).
uniform float audioAdvance; ///< The music's advance: integrated tempo-weighted energy (never jumps, never runs
                            ///< backwards).
uniform float audioKick;    ///< Kick-drum envelope, 0..1 (fast attack, short decay).
uniform float audioSwell;   ///< Slow loudness envelope, 0..1 (seconds).

uniform float hueP;    ///< Hue knob (radians), usually the music's chroma hue plus a rolled offset.
uniform float windowP; ///< Window knob, 0.5..1.2.

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

// ---- Sky shell: shared hash/noise/fbm + a fake lit planet -- see
// Scene3DShader.cpp's buildGeometry() note on why the backdrop is real
// geometry (a huge enclosing shell) rather than a 2D overlay. ----
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
    // A foreign world sits at a fixed point in this sky -- fixed, not
    // orbiting itself, so it reads as a real distant body the CAMERA passes
    // rather than something spinning in place.
    vec3  planet_dir = normalize( vec3( 0.35, -0.12, 1.0 ) );
    float d = dot( dir, planet_dir );
    // The disc used to span about 6 degrees -- a distant dot, when the brief
    // was a station ORBITING a foreign world. At 0.80 it spans about 37 and
    // reads as something you are actually in orbit around.
    float disc = smoothstep( 0.800, 0.815, d );

    vec3 col = vec3( 0.022, 0.026, 0.042 ) + vec3( 1.0 ) * starsField( dir, 0.0016 );
    // Atmospheric limb: the glow a lit world throws past its own edge.
    // The beat lives HERE now. The hulls hold still (their kick hops and
    // the camera's swell-dolly are gone), so the backgrounds carry the
    // music: a kick pulse on the dominant glow, sized to read clearly
    // without breaking the temporal budget's full-frame brightness cap.
    col += vec3( 0.10, 0.16, 0.26 ) * pow( smoothstep( 0.72, 0.815, d ), 2.0 )
           * ( 0.75 + 0.45 * audioKick );

    if ( disc > 0.0005 )
    {
        vec3 up = ( abs( planet_dir.y ) < 0.99 ) ? vec3( 0.0, 1.0, 0.0 ) : vec3( 1.0, 0.0, 0.0 );
        vec3 right_v = normalize( cross( up, planet_dir ) );
        vec3 up_v = cross( planet_dir, right_v );
        // Scaled WITH the disc. This was 90.0 when the planet spanned six
        // degrees; at 37 the same figure puts six times as many features
        // across it and the surface reads as static rather than terrain.
        vec2  uv = vec2( dot( dir, right_v ), dot( dir, up_v ) ) * 15.0;
        float terrain = fbm( vec3( uv * 0.6, 1.3 ) );
        float clouds = fbm( vec3( uv * 0.9 + vec2( time * 0.02, 0.0 ), 5.1 ) );
        vec3  surface = mix( vec3( 0.10, 0.22, 0.34 ), vec3( 0.5, 0.42, 0.28 ), terrain );
        surface = mix( surface, vec3( 0.92, 0.94, 0.96 ), smoothstep( 0.55, 0.72, clouds ) );
        // dir doubles as the sphere's own outward normal here -- a cheap
        // stand-in that only breaks down near the disc's own limb, where a
        // decorative background planet does not need to be exact.
        // Aimed so the terminator crosses the VISIBLE disc. The old direction
        // had a negative z against a planet sitting at +z, which put the whole
        // face we can see on its night side -- invisible while the disc was
        // six degrees across, an unlit grey wall once it filled the frame.
        float ndotl = max( dot( dir, normalize( vec3( -0.55, 0.40, 0.60 ) ) ), 0.0 );
        col = mix( col, surface * ( 0.30 + 1.05 * ndotl ), disc );
    }
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
    float wp = ( windowP > 0.01 ? windowP : 1.0 );

    vec4 base = texture( texMeshMaterial, vec3( vUV, 0.0 ) );
    // This pass draws opaque/depth-tested with GL_BLEND off (see
    // Scene3DShader::draw()'s GEOM_MESH branch) -- a partial alpha can't
    // fade, so treat the opacity map as a cutout mask (docking grates,
    // antenna lattices) instead of silently ignoring it.
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
    // Relief from the material's normal map, where the asset has one.
    n = perturbNormal( texMeshMaterial, texMeshMaterialLayers, vUV, n, vPos, 1.0 );
    vec3 view_dir = normalize( -vPos );

    // A cold, distant star -- these hulls read as far-out infrastructure,
    // not something basking in a nearby sun.
    vec3  light_dir = normalize( vec3( 0.3, 0.5, -0.6 ) );
    float diff = max( dot( n, light_dir ), 0.0 );
    float fill = 0.5 + 0.5 * dot( n, vec3( 0.0, 1.0, 0.0 ) );

    vec3  half_v = normalize( light_dir + view_dir );
    float spec = pow( max( dot( n, half_v ), 0.0 ), mix( 48.0, 6.0, roughness ) );
    vec3  spec_color = mix( vec3( 0.9, 0.95, 1.0 ), base.rgb, metallic );

    // Same balance lesson learned building the first mesh scene (Spaceship):
    // this hull's baked albedo is dark by design, so the ambient/diffuse
    // floor has to be generous or every additive accent below reads as if
    // it's the whole surface's color instead of a highlight on top of it.
    vec3 col = base.rgb * ( 0.5 + diff * ( 1.3 + 0.5 * audioSwell ) + fill * 0.3 );
    col += spec_color * spec * ( 0.5 + 0.6 * ( 1.0 - roughness ) );

    // Faux window glow: the brightest patches of the baked albedo (window
    // strips, hazard markings) are treated as self-lit rather than merely
    // well-illuminated -- there is no separate emissive map to sample.
    // These hulls' baked albedo runs uniformly dark (measured directly on
    // this batch of station textures), so the highlight threshold sits well
    // below what a normal-brightness texture would need.
    float luma = dot( base.rgb, vec3( 0.299, 0.587, 0.114 ) );
    float window_mask = smoothstep( 0.25, 0.55, luma );
    // A fixed warm color -- the environment carries the "cool" palette
    // variety now (see renderSky() above), not a photo-tinted hull.
    col += vec3( 1.0, 0.85, 0.55 ) * window_mask * wp * ( 0.4 + 0.4 * audioSwell ) * ( 0.85 + 0.3 * audioKick );

    // A soft cool starlight rim, kept modest -- an edge accent, not a wash.
    float fresnel = pow( 1.0 - max( dot( n, view_dir ), 0.0 ), 4.0 );
    col += vec3( 0.7, 0.85, 1.0 ) * fresnel * ( 0.1 + 0.2 * audioSwell );

    if ( hue > 0.001 )
        col = hueRot( col, 0.2 * sin( hue ) );

    vec3 cat_tone = max( col, 0.0 );
    cat_tone /= 1.0 + 0.35 * max( cat_tone.r, max( cat_tone.g, cat_tone.b ) );
    fragColor = vec4( clamp( cat_tone, 0.0, 1.0 ), 1.0 );
}
