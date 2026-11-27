#version 330 core
/*****************************************************************************\
 *                              BloomSculpt.frag
\*****************************************************************************/
/*! @file
 *
 *  @brief
 *  Lights a tessellated, lobed sculptural bloom shape with restrained shading built to read its silhouette: a
 *  shadow-mapped key light, a cooler fill light, an equirect environment-mirror reflection of the slideshow photo,
 *  a rim light, and a hue derived from surface radius (via the photo-arc imgPalette()).
 *
 *  audioChromaHue drives imgPalette()'s rotating photo-arc sample point and a
 *  small hue-cycle offset over the surface radius; audioValence shapes that
 *  palette's saturation and audioAdvance slowly drifts it; audioHigh
 *  brightens the specular highlight, audioLevel the rim light, audioKick the
 *  glow along the most-displaced ridges (gated by vSwell against the bloomP
 *  preset), and audioBeat/audioAmbient add a final overall brightness lift.
 *  glossP scales specular sharpness and the environment-reflection strength.
 *  A percentage-closer-filtered shadow map (texShadow/lightM) darkens the
 *  deep folds between lobes so a convoluted surface stays legible.
 *
 *  @author René Weller
 */
out vec4 fragColor; ///< The pixel's colour (output).
// BloomSculpt.frag — a polished shell, lit so the silhouette reads.
// The whole point of the tessellation is the SHAPE, so the shading stays
// restrained: one key light, a broad fill, a hard rim to separate the lobes
// from the background, and the slideshow photo as the environment it mirrors.

in vec3  vObj;    ///< Object-space position (from the vertex stage).
in vec3  vNormal; ///< Surface normal (from the vertex stage).
in vec3  vView;   ///< View vector (from the vertex stage).
in vec3  vWorld;  ///< World position (from the vertex stage).
in float vSwell;  ///< Swell (from the vertex stage).
in vec2  vSurfUV; ///< Surf UV (from the vertex stage).

uniform sampler2D       tex0;          ///< The current photo.
uniform sampler2DShadow texShadow;     ///< Shadow map of the key light (depth comparison).
uniform mat4            lightM;        ///< Light view-projection matrix (shadow map).
uniform vec3            lightDir;      ///< Direction to the key light (unit length).
uniform float           shadowPass;    ///< 1 during the shadow map's depth-only pass.
uniform float           shadowTexel;   ///< Size of a shadow-map texel in world units.
uniform float           shadowExtent;  ///< Half size of the area the shadow map covers (world units).
uniform float           interpolation; ///< Cross-fade between the photos: 1 = tex0, 0 = tex1.
uniform float           time;          ///< Seconds since this activation, plus a rolled start (see sceneTime).

uniform float audioLevel;     ///< Overall loudness, 0..1.
uniform float audioBeat;      ///< Beat envelope, 0..1.
uniform float audioHigh;      ///< High band level, 0..1.
uniform float audioKick;      ///< Kick-drum envelope, 0..1 (fast attack, short decay).
uniform float audioChromaHue; ///< Hue of the dominant pitch class (radians, unwrapped: continuous).
uniform float audioAmbient;   ///< How ambient (sustained, beatless) the music is, 0..1.

uniform float     glossP;       ///< Gloss knob, 0.35..0.85.
uniform float     bloomP;       ///< Bloom knob, 0.35..0.75.
uniform sampler2D tex1;         ///< The next photo (cross-faded in by interpolation).
uniform float     audioAdvance; ///< The music's advance: integrated tempo-weighted energy (never jumps, never runs
                                ///< backwards).
uniform float audioValence;     ///< Mood valence: 0 dark .. 1 bright.

// ---- photo environment light (Tools/scenegen/patch_env3d.py) ----
// The photo stands behind the viewer and lights the scene: the normal finds diffuse light in a very coarse mip, the
// reflected ray a reflection in a mip chosen by roughness.  At envP = 0 none of it runs and the scene renders as
// before.
uniform float envP; ///< Photo environment light: 0 = off (the old look) .. 1 = full; rolled per activation.

/**  Where a direction looks in the photo environment.
 *
 * @param d  The direction (any length): x screen right, y screen up; the sign of z does not matter. (in)
 *
 * @return
 *   The coordinate in the photo.
 *
 * The photo stands behind the viewer, its centre straight back toward the eye, and the far half of the sphere of
 * directions is the near half mirrored at the plane z = 0 -- so the map is continuous over the whole sphere (no seam,
 * no pole) and folds only where a direction turns from toward the viewer to away from it.  Past the photo's edge the
 * texture's mirrored repeat continues it.
 **/
vec2 envUV( vec3 d )
{
    return 0.5 + 0.6 * normalize( d ).xy;
}

/**  The photo as the environment sees it: tex0 and tex1 cross-faded with interpolation like img(), at a mip level,
 * colour only (the alpha channel carries the photo's depth).
 *
 * @param uv   Coordinate in the photo. (in)
 * @param lod  Mip level: 0 = full size, 7 = 8 x 8 texels of a 1024 photo. (in)
 *
 * @return
 *   The photo's colour (RGB).
 **/
vec3 envPhoto( vec2 uv, float lod )
{
    return interpolation * textureLod( tex0, uv, lod ).rgb + ( 1.0 - interpolation ) * textureLod( tex1, uv, lod ).rgb;
}

/**  Diffuse light from the photo: its very coarse mip in the normal's direction stands in for the light gathered over
 * the half sphere around the normal.
 *
 * @param n  The surface normal (frame as for envUV()). (in)
 *
 * @return
 *   The diffuse light (RGB), 0..1.
 **/
vec3 envDiffuse( vec3 n )
{
    return envPhoto( envUV( n ), 7.0 );
}

/**  The photo reflected along a ray, in a mip chosen by the roughness and never finer than the pixel's footprint in
 * the photo -- a small or strongly curved mirror does not shimmer.
 *
 * @param r      The reflected ray (frame as for envUV()). (in)
 * @param rough  Roughness: 0 = mirror .. 1 = matt (the diffuse mip). (in)
 *
 * @return
 *   The reflected light (RGB), 0..1.
 *
 * The footprint comes from screen-space derivatives: call it outside pixel-dependent branches.
 **/
vec3 envReflect( vec3 r, float rough )
{
    vec2  uv = envUV( r );
    vec2  ts = vec2( textureSize( tex0, 0 ) );
    vec2  dx = dFdx( uv ) * ts, dy = dFdy( uv ) * ts;
    float px = 0.5 * log2( max( max( dot( dx, dx ), dot( dy, dy ) ), 1.0 ) );
    return envPhoto( uv, max( px, 1.0 + 6.0 * clamp( rough, 0.0, 1.0 ) ) );
}

/**  How much light a surface reflects at this angle (Schlick's approximation of Fresnel's equations).
 *
 * @param n   The surface normal (unit length). (in)
 * @param v   The direction toward the eye (unit length). (in)
 * @param f0  The reflectance looking straight on. (in)
 *
 * @return
 *   The reflectance, f0..1.
 **/
float envFresnel( vec3 n, vec3 v, float f0 )
{
    return f0 + ( 1.0 - f0 ) * pow( 1.0 - clamp( dot( n, v ), 0.0, 1.0 ), 5.0 );
}
// ---- end of the photo environment light ----

/**  The photo at a coordinate: the cross-fade of tex0 and tex1.
 *
 * @param uv  Coordinate in the photo, 0..1. (in)
 *
 * @return
 *   The cross-faded photo colour (RGB).
 **/
vec3 img( vec2 uv )
{
    return ( interpolation * texture( tex0, uv ) + ( 1.0 - interpolation ) * texture( tex1, uv ) ).rgb;
}


/**  IMG-PALETTE (house standard): colours come from a rotating arc in the CURRENT slideshow image, so every
 * activation inherits a fresh palette from the photos; the arc follows the musical key (audioChromaHue is circular-
 * slewed = jump-free) with a slow advance drift, valence shapes saturation.
 *
 * @param t  Position on the palette arc, 0..1 for one turn. (in)
 *
 * @return
 *   The palette colour (RGB).
 **/
vec3 imgPalette( float t )
{
    float ang = audioChromaHue + audioAdvance * 0.04 + t * 6.2831853;
    float rad = 0.16 + 0.08 * sin( audioAdvance * 0.013 );
    vec3  pc = img( clamp( vec2( 0.5 ) + rad * vec2( cos( ang ), sin( ang ) ), 0.0, 1.0 ) );
    float pg = dot( pc, vec3( 0.333 ) );
    return mix( vec3( pg ), pc, 0.55 + 0.45 * audioValence );
}

/**  A hue as a colour (the house palette).
 *
 * @param h  The hue, 0..1. (in)
 *
 * @return
 *   The colour (RGB).
 **/
vec3 hue2rgb( float h )
{
    return imgPalette( h ) * 1.35; // photo-arc palette (house standard), was HSV rainbow
}

/**  Shadow factor from the shadow map at a world position.
 *
 * @param world  The world position. (in)
 * @param n      Its normal (lifts the lookup off the surface). (in)
 * @param ndl    N dot L there (scales the bias). (in)
 *
 * @return
 *   1 for lit, 0 for shadowed (filtered in between).
 **/
float shadowAt( vec3 world, vec3 n, float ndl )
{
    float lift = ( 2.0 * shadowExtent * shadowTexel ) * 2.2 / max( ndl, 0.15 );
    vec4  lp = lightM * vec4( world + n * lift, 1.0 );
    vec3  proj = lp.xyz / lp.w * 0.5 + 0.5;
    if ( proj.z > 1.0 )
        return 1.0;
    float bias = 0.0006 + 0.0030 * ( 1.0 - ndl );
    float s = 0.0;
    float r = shadowTexel * 1.6;
    for ( int y = -1; y <= 1; ++y )
        for ( int x = -1; x <= 1; ++x )
            s += texture( texShadow,
                          vec3( proj.xy + vec2( float( x ), float( y ) ) * r, proj.z - bias ) );
    return s / 9.0;
}

/** Entry point of this shader stage (the file description says what it draws). */
void main()
{
    if ( shadowPass > 0.5 )
    {
        fragColor = vec4( 0.0 );
        return;
    }

    vec3 n = normalize( vNormal );
    vec3 V = normalize( vView );
    if ( dot( n, V ) < 0.0 )
        n = -n; // shade the backfaces of deep folds too

    vec3 L = normalize( lightDir );

    // Body colour follows the surface's own radius: the deep valleys between
    // lobes stay dark and saturated, the crests bleach toward the light.
    float rad = length( vObj );
    float hue = fract( 0.52 + 0.30 * rad + 0.09 * sin( audioChromaHue ) );
    vec3  base = mix( vec3( 0.10, 0.11, 0.17 ), hue2rgb( hue ), 0.72 );

    float diff = max( dot( n, L ), 0.0 );
    float wrap = 0.5 + 0.5 * dot( n, L ); // wrapped fill, keeps the shadow side readable

    // A convoluted body is exactly where shadowing earns its keep: the deep
    // folds between petals now go dark because a neighbouring lobe is in the
    // way, not merely because they face away from the light.
    float shadow = shadowAt( vWorld, n, diff );

    vec3 col = base * ( 0.20 + 0.95 * diff * shadow + 0.55 * wrap * wrap );

    // Second, cooler light from the opposite side.  One light on a shape this
    // convoluted leaves half the lobes as unreadable black.
    vec3 L2 = normalize( vec3( -0.7, -0.25, -0.6 ) );
    col += base * vec3( 0.55, 0.7, 1.0 ) * max( dot( n, L2 ), 0.0 ) * 0.45;

    // Environment mirror — equirect lookup along the reflected ray.
    vec3 R = reflect( -V, n );
    vec2 env_uv = vec2( atan( R.x, R.z ) / 6.2831853 + 0.5, clamp( R.y * 0.5 + 0.5, 0.0, 1.0 ) );
    // Both photos, cross-faded like img(): tex0 alone jumped at the end of every photo fade (27.11.2026).
    vec3 env = envPhoto( fract( env_uv ), 0.0 );
    if ( envP > 0.0 )
    {
        // The photo environment (patch_env3d.py): no seam, both photos, the mip by gloss; and its diffuse light.
        env = envReflect( R, 0.5 - 0.45 * glossP );
        col += base * envDiffuse( n ) * ( 0.6 * envP );
    }
    env = mix( vec3( dot( env, vec3( 0.333 ) ) ), env, 0.7 );

    float fres = pow( 1.0 - clamp( dot( n, V ), 0.0, 1.0 ), 4.0 );
    col = mix( col, env * ( 0.6 + 0.8 * glossP ), fres * ( 0.35 + 0.45 * glossP ) );

    vec3  H = normalize( L + V );
    float spec = pow( max( dot( n, H ), 0.0 ), 40.0 + 260.0 * glossP );
    col += vec3( 1.0, 0.96, 0.88 ) * spec * shadow * ( 0.9 + 2.2 * audioHigh );

    // Rim: without it the dark side of a lobe merges with the background and
    // the whole silhouette — the thing tessellation bought us — disappears.
    col += hue2rgb( fract( hue + 0.5 ) ) * pow( fres, 1.6 ) * ( 0.35 + 0.9 * audioLevel );

    // The deepest-displaced ridges glow, so a loud chord literally lights up
    // the modes it grew.
    float seam = clamp( vSwell / max( bloomP * 1.6, 0.05 ) - 0.35, 0.0, 1.0 );
    col += hue2rgb( fract( hue + 0.12 ) ) * pow( seam, 2.0 ) * ( 0.5 + 1.8 * audioKick );

    col *= 1.0 + 0.20 * audioBeat + 0.25 * audioAmbient;
    col = col / ( 1.0 + col * 0.28 );
    fragColor = vec4( col, interpolation );
}
