#version 330 core
/*****************************************************************************\
 *                              Ocean.frag
\*****************************************************************************/
/*! @file
 *
 *  @brief
 *  Shades the tessellated ocean surface: a Fresnel mix between the water body colour and a reflected sky built from
 *  the current slideshow photo.
 *
 *  audioLevel lifts the water body's brightness, audioHigh sharpens the sun
 *  glitter's specular lobe, audioKick pumps the foam on breaking crests,
 *  audioSubBass drives a subsurface glow in the wave backs, audioBeat adds
 *  a final overall pulse, and audioChromaHue nudges the water's hue within
 *  a bounded range so a full turn of the musical key cannot push the sea
 *  into purple. audioAmbient lifts the water body colour independently of
 *  the Fresnel term, and camHP sets the eye height used to build the view
 *  vector.
 *
 *  @author René Weller
 */
out vec4 fragColor; ///< The pixel's colour (output).
// Ocean.frag — water shading for the tessellated surface.
// Fresnel decides the mix: looking down you see into the water, looking
// toward the horizon it turns into a mirror.  That single term is what makes
// a water shader read as water rather than as blue plastic.

in vec3  vWorld;  ///< World position (from the vertex stage).
in vec2  vSurfUV; ///< Surf UV (from the vertex stage).
in float vFoam;   ///< Foam (from the vertex stage).
in vec3  vNormal; ///< Surface normal (from the vertex stage).
in float vDist;   ///< Distance (from the vertex stage).

uniform sampler2D tex0;          ///< the slideshow photo = the sky this sea reflects
uniform float     interpolation; ///< Cross-fade between the photos: 1 = tex0, 0 = tex1.
uniform float     time;          ///< Seconds since this activation, plus a rolled start (see sceneTime).

uniform float audioLevel;     ///< Overall loudness, 0..1.
uniform float audioBeat;      ///< Beat envelope, 0..1.
uniform float audioKick;      ///< Kick-drum envelope, 0..1 (fast attack, short decay).
uniform float audioHigh;      ///< High band level, 0..1.
uniform float audioSubBass;   ///< Sub-bass band level, 0..1.
uniform float audioChromaHue; ///< Hue of the dominant pitch class (radians, unwrapped: continuous).
uniform float audioAmbient;   ///< How ambient (sustained, beatless) the music is, 0..1.

uniform float camHP;    ///< Camera height knob, 0..1.
uniform float foamP;    ///< Foam knob, 0.4..0.9.
uniform float glitterP; ///< Glitter knob, 0.35..0.85.

// ---- photo environment light (Tools/scenegen/patch_env3d.py) ----
uniform sampler2D tex1; ///< The next photo (cross-faded in by interpolation).
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

/** Entry point of this shader stage (the file description says what it draws). */
void main()
{
    vec3 n = normalize( vNormal );
    vec3 V = normalize( vec3( 0.0, camHP, 0.0 ) - vWorld );

    // Sun low over the horizon — that is where the glitter path comes from.
    vec3 L = normalize( vec3( 0.35 * sin( time * 0.03 ), 0.22, 1.0 ) );

    // Capped below 1: at full reflectance the water loses its own colour
    // entirely at grazing angles and reads as sheet metal.
    float fres = pow( 1.0 - clamp( dot( n, V ), 0.0, 1.0 ), 5.0 );
    fres = mix( 0.02, 0.72, fres );

    // Sky reflection: the photo, sampled along the reflected ray.  Deliberately
    // low-contrast so the sea keeps its own colour.
    vec3 R = reflect( -V, n );
    vec2 sky_uv = vec2( atan( R.x, R.z ) / 6.2831853 + 0.5,
                        clamp( R.y, 0.0, 1.0 ) );
    vec3 sky = texture( tex0, fract( sky_uv ) ).rgb;
    if ( envP > 0.0 )
        sky = envReflect( R, 0.12 ); // the photo environment (patch_env3d.py): no seam, both photos
    sky = mix( vec3( dot( sky, vec3( 0.33 ) ) ), sky, 0.55 ) * 0.75 + 0.03;

    // Water body colour: deep teal, shallower and greener on the crests.
    vec3  deep = vec3( 0.010, 0.055, 0.105 );
    vec3  shallow = vec3( 0.03, 0.34, 0.42 );
    float lift = clamp( vWorld.y * 0.35 + 0.5, 0.0, 1.0 );
    vec3  body;
    body = mix( deep, shallow, lift ) * ( 1.15 + 0.5 * audioAmbient );

    vec3 col = mix( body, sky, fres );

    // Specular sun glitter — the treble sharpens it into sparkles.
    vec3  H = normalize( L + V );
    float spec = pow( max( dot( n, H ), 0.0 ), 120.0 + 420.0 * glitterP );
    col += vec3( 1.1, 1.0, 0.9 ) * spec * ( 1.4 + 3.0 * audioHigh );

    // Foam on the breaking crests.
    float foam = vFoam * ( 0.5 + 0.9 * foamP ) * ( 1.0 + 0.7 * audioKick );
    col = mix( col, vec3( 0.92, 0.96, 1.0 ), clamp( foam, 0.0, 0.9 ) );

    // Subsurface glow in the wave backs, pumped by the sub-bass swell.
    col += shallow * max( vWorld.y, 0.0 ) * 0.09 * ( 1.0 + 1.6 * audioSubBass );

    // Bounded hue nudge so a full-turn chromaHue cannot turn the sea purple.
    float hr = 0.10 * sin( audioChromaHue );
    col.rb = mat2( cos( hr ), -sin( hr ), sin( hr ), cos( hr ) ) * col.rb;

    // Distance haze toward the horizon.
    float haze = clamp( vDist / 220.0, 0.0, 1.0 );
    vec3  haze_col = sky * 0.55 + vec3( 0.04, 0.06, 0.09 );
    col = mix( col, haze_col, haze * haze * 0.85 );

    col *= 1.0 + 0.18 * audioBeat;
    col = col / ( 1.0 + col * 0.30 );
    fragColor = vec4( col, interpolation );
}
