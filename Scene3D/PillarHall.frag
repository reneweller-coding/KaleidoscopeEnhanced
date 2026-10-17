#version 330 core
/*****************************************************************************\
 *                              PillarHall.frag
\*****************************************************************************/
/*! @file
 *
 *  @brief
 *  Shades the shadow-mapped pillar hall: a warm sun-and-sky lit tiled floor and fluted colonnade with a cool second
 *  shadow-casting rim/fill light, plus an emissive band climbing the pillars.
 *
 *  Both shadow terms are VISIBILITY MULTIPLIERS with a floor, not gates: the
 *  hall stays lit and legible even if a depth-map lookup returns nothing, and a
 *  working map still darkens what it occludes.
 *
 *  audioLevel brightens the sun term, audioHigh sharpens the specular
 *  highlight, audioKick drives the emissive band climbing the pillars,
 *  audioSubBass and audioBeat add a final overall pulse, audioAmbient lifts
 *  both the unshadowed sky term and the second light's strength, and
 *  audioChromaHue nudges the hue. The pillar and emissive-band hue is drawn
 *  from the house imgPalette (a rotating sample arc over the current
 *  slideshow photo, tex0/tex1 crossfaded by interpolation) driven by
 *  audioAdvance and audioValence; camHP sets the eye height and softP the
 *  shadow's softness (shared by both lights' maps).
 *
 *  @author René Weller
 */
out vec4 fragColor; ///< The pixel's colour (output).
// PillarHall.frag — the shading half of the shadow-map contract.
// -----------------------------------------------------------------------
// texShadow is declared with sampler2DShadow, not sampler2D.  That is the
// whole trick behind soft edges here: with GL_TEXTURE_COMPARE_MODE set, the
// hardware compares each of the four texels a LINEAR filter would fetch and
// then averages the four BOOLEANS.  A plain sampler2D would average the depths
// first and compare once, which is not the same thing at all — it produces a
// hard edge with a halo, not a soft one.
//
// The other half of the contract: during the depth pass this shader must
// return immediately.  It would otherwise sample the very texture it is
// currently rendering into, which is undefined.

in vec3  vWorld;  ///< World position (from the vertex stage).
in vec3  vNormal; ///< Surface normal (from the vertex stage).
in float vKind;   ///< Element kind (from the vertex stage).
in float vTint;   ///< Tint (from the vertex stage).
in float vHeight; ///< Height (from the vertex stage).

uniform sampler2D       tex0;       ///< The current photo.
uniform sampler2DShadow texShadow;  ///< Shadow map of the key light (depth comparison).
uniform mat4            lightM;     ///< Light view-projection matrix (shadow map).
uniform vec3            lightDir;   ///< Direction to the key light (unit length).
uniform float           shadowPass; ///< 1 during the shadow map's depth-only pass.
// Second, independent shadow-casting light: a cool, lower rim/fill opposite
// the warm sun, its own map so it casts real (not painted-on) shadows too.
uniform sampler2DShadow texShadow2;    ///< Shadow map of the second light.
uniform mat4            lightM2;       ///< View-projection matrix of the second light's shadow map.
uniform vec3            lightDir2;     ///< Direction to the second light (unit length).
uniform float           shadowPass2;   ///< 1 during the second light's depth-only shadow pass.
uniform float           shadowTexel;   ///< Size of a shadow-map texel in world units.
uniform float           interpolation; ///< Cross-fade between the photos: 1 = tex0, 0 = tex1.
uniform float           time;          ///< Seconds since this activation, plus a rolled start (see sceneTime).

uniform float audioLevel;     ///< Overall loudness, 0..1.
uniform float audioBeat;      ///< Beat envelope, 0..1.
uniform float audioKick;      ///< Kick-drum envelope, 0..1 (fast attack, short decay).
uniform float audioHigh;      ///< High band level, 0..1.
uniform float audioSubBass;   ///< Sub-bass band level, 0..1.
uniform float audioChromaHue; ///< Hue of the dominant pitch class (radians, unwrapped: continuous).
uniform float audioAmbient;   ///< How ambient (sustained, beatless) the music is, 0..1.

uniform float     camHP;        ///< Camera height knob, 0..1.
uniform float     softP;        ///< Soft knob, 0.3..1.
uniform float     hueP;         ///< Hue knob (radians), usually the music's chroma hue plus a rolled offset.
uniform sampler2D tex1;         ///< The next photo (cross-faded in by interpolation).
uniform float     audioAdvance; ///< The music's advance: integrated tempo-weighted energy (never jumps, never runs
                                ///< backwards).
uniform float audioValence;     ///< Mood valence: 0 dark .. 1 bright.

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

uniform float shadowExtent; ///< Half size of the area the shadow map covers (world units).
/// One shadow texel, in world units.  Derived rather than hardcoded, because
/// the light's box is sized per scene now — a constant here would silently
/// under- or over-bias every scene whose scale differs from this one's.
#define SHADOW_WORLD_TEXEL ( 2.0 * shadowExtent * shadowTexel )

/**  Generalised over WHICH light's map/matrix to sample -- lights 1 and 2 are otherwise shaded identically, just from
 * different directions and maps.
 *
 * @param world      The world position. (in)
 * @param n          Its normal (lifts the lookup off the surface). (in)
 * @param ndl        N dot L there (scales the bias). (in)
 * @param shadowTex  The light's shadow map. (in)
 * @param lm         The light's matrix. (in)
 *
 * @return
 *   1 for lit, 0 for shadowed (filtered in between).
 *
 * Passing a sampler2DShadow by value is fine in GLSL (opaque handle, not the texture data itself), so this stays one
 * function instead of two copies.
 **/
float shadowAt( vec3 world, vec3 n, float ndl, sampler2DShadow shadowTex, mat4 lm )
{
    // Normal offset.  A shadow texel covers a patch of surface, and the depth
    // recorded for that patch is one single value — so a surface almost always
    // ties with its own record and shadows itself in stripes.  Lifting the
    // lookup off the surface along its normal moves the query clear of the
    // patch entirely, and unlike a depth bias it works the same on every
    // orientation and needs no knowledge of the geometry's winding.
    float lift = SHADOW_WORLD_TEXEL * 2.2 / max( ndl, 0.15 );
    vec4  lp = lm * vec4( world + n * lift, 1.0 );
    vec3  proj = lp.xyz / lp.w * 0.5 + 0.5; // clip space -> texture space
    if ( proj.z > 1.0 )
        return 1.0; // beyond the light's far plane

    // OUTSIDE the light's box, nothing is KNOWN to occlude, so the answer must
    // be "lit".  Without this the sampler clamps to the map's edge texel and
    // compares against a depth recorded somewhere else entirely -- and since
    // the floor slab is four times wider than the 120-unit box, roughly half
    // of it was coming back spuriously shadowed.  That, not the palette, is
    // what made the hall read as almost black.
    if ( any( lessThan( proj.xy, vec2( 0.0 ) ) ) || any( greaterThan( proj.xy, vec2( 1.0 ) ) ) )
        return 1.0;

    // A small slope-scaled depth bias on top, for the grazing angles where even
    // the normal offset leaves a sliver.
    float bias = 0.0006 + 0.0030 * ( 1.0 - ndl );

    // 3x3 taps on top of the hardware's own 2x2 comparison filter.
    float s = 0.0;
    float r = shadowTexel * ( 0.8 + 2.6 * softP );
    for ( int y = -1; y <= 1; ++y )
        for ( int x = -1; x <= 1; ++x )
            s += texture( shadowTex,
                          vec3( proj.xy + vec2( float( x ), float( y ) ) * r,
                                proj.z - bias ) );
    return s / 9.0;
}

/** Entry point of this shader stage (the file description says what it draws). */
void main()
{
    // Depth pass (either light): write nothing but depth.
    if ( shadowPass > 0.5 || shadowPass2 > 0.5 )
    {
        fragColor = vec4( 0.0 );
        return;
    }

    vec3 n = normalize( vNormal );
    // Must match the eye height PillarHall.vert actually uses.
    vec3 V = normalize( vec3( 0.0, 1.6 + camHP * 0.22, 0.0 ) - vWorld );
    vec3 L = normalize( lightDir );
    vec3 L2 = normalize( lightDir2 );

    float ndl = max( dot( n, L ), 0.0 );
    float shadow = shadowAt( vWorld, n, ndl, texShadow, lightM );
    // Light 2's own diffuse term + its own shadow lookup -- real occlusion,
    // not a flat rim tint painted on regardless of what's in the way.
    float ndl2 = max( dot( n, L2 ), 0.0 );
    float shadow2 = shadowAt( vWorld, n, ndl2, texShadow2, lightM2 );

    float hue = fract( 0.58 + 0.22 * hueP + 0.10 * vTint + 0.05 * sin( audioChromaHue ) );
    // The floor is deliberately the brightest surface in the scene: it is what
    // the shadows are drawn ON, and a dark floor hides the very thing the
    // second render pass exists to produce.  The colonnade was mixed so far
    // toward the photo arc that it came out BRIGHTER than the floor it stands
    // on (0.37 against 0.30 with a warm photo), which cost the hall its
    // ground-versus-column separation; the pillars are held down now.
    vec3 base = ( vKind < 0.5 )
                    ? vec3( 0.34, 0.35, 0.38 ) // floor
                    : mix( vec3( 0.09, 0.095, 0.11 ), hue2rgb( hue ), 0.20 + 0.16 * hueP );

    // ---- SURFACE RELIEF ------------------------------------------------
    // A pillar face two metres from the eye covers a third of the frame, and a
    // flat box face under one directional light is ONE value across all of it:
    // measured, the left and right thirds of this scene carried no content at
    // all.  Flutes and courses are what a real colonnade uses to break exactly
    // that surface up, and they are cut fine enough (0.26 world units, about
    // 1/8 of the frame height at eye distance) to still read after the
    // catalogue's downscale.  Static in world space, so no time term at all.
    float across = ( abs( n.x ) > 0.5 ) ? vWorld.z : vWorld.x;
    float flute = 0.5 + 0.5 * cos( across * 24.1661 );   // 2*pi / 0.26
    flute *= flute;                                      // deep groove, wide land
    float course = 0.5 + 0.5 * cos( vWorld.y * 5.7120 ); // 2*pi / 1.1
    float relief = 1.0 - 0.85 * ( 0.72 * flute + 0.28 * course );
    // Only the vertical faces are fluted; the tops keep their plain finish.
    relief = mix( 1.0, relief, step( abs( n.y ), 0.5 ) );

    // The floor is one 500 x 620-unit slab and reads as a flat card for the same
    // reason, so it gets a masonry grid: dark joints plus alternating slabs.
    vec2  gm = abs( mod( vWorld.xz, 1.7 ) - 0.85 );
    float joint = clamp( 1.0 - min( gm.x, gm.y ) / 0.16, 0.0, 1.0 );
    float slab = 0.5 + 0.5 * sign( sin( vWorld.x * 1.8480 ) * sin( vWorld.z * 1.8480 ) );
    float floor_relief = 1.0 - 0.6 * ( 0.55 * joint + 0.30 * ( 1.0 - slab ) );

    float rel = ( vKind < 0.5 ) ? floor_relief : relief;

    // THE SUN NO LONGER DEPENDS ON THE SHADOW LOOKUP SURVIVING.
    // Measured: this scene renders at luma 0.024 / contrast 0.031, and a
    // ray-cast of its own geometry reproduces exactly those numbers when, and
    // only when, both shadow terms come back 0 -- what is left is then the sky
    // ambient alone (base 0.30 * sky 0.09 = 0.027, i.e. the whole picture).
    // `shadow` was the sole gate on every warm pixel in the frame, so one
    // failed lookup took the entire scene with it.  A visibility FLOOR keeps
    // the hall lit and readable whatever the map returns, and still lets a
    // working map draw its shadows -- they just fall to 60% rather than to
    // nothing, which is what a shadow under a real sky does anyway.
    float sun_vis = 0.60 + 0.40 * shadow;
    float rim_vis = 0.60 + 0.40 * shadow2;

    // Wrapped diffuse on top: with a sun this high, a vertical pillar face at
    // 90 degrees to it gets ndl = 0 and no amount of relief can show on a
    // surface multiplied by zero.
    float ndl_lit = mix( ndl, pow( clamp( dot( n, L ) * 0.5 + 0.5, 0.0, 1.0 ), 1.6 ), 0.45 );

    // Sun: warm, and the thing the shadow term modulates.
    vec3 sun = vec3( 1.0, 0.90, 0.72 ) * ( 1.5 + 1.4 * audioLevel );
    vec3 col = base * sun * ( ndl_lit * sun_vis * rel );

    // Studio second light: a cool moonlit rim/fill, lower and from roughly the
    // opposite side (see updateLightMatrix2's angleOffset/tiltY) -- picks out
    // edges the warm sun leaves flat, and its own shadow term keeps it from
    // reading as a flat rim-light hack. Weaker than the sun so it reads as
    // fill, not a second competing key.
    vec3 rim = vec3( 0.45, 0.60, 0.85 ) * ( 0.55 + 0.55 * audioAmbient ) * 1.6;
    col += base * rim * ( ndl2 * rim_vis * rel );

    // Sky ambient from above, unshadowed — an occlusion term is what darkens
    // the shadowed areas, not the absence of any light at all.  Killing the
    // ambient too turns every shadow into a hole.
    vec3 sky = vec3( 0.30, 0.40, 0.62 ) * ( 0.30 + 0.35 * audioAmbient );
    col += base * sky * ( ( 0.50 + 0.50 * max( n.y, 0.0 ) ) * rel );

    // A bounce off the floor, so pillar sides facing down are not dead.
    col += base * vec3( 0.22, 0.20, 0.18 ) * max( -n.y, 0.0 ) * 0.5;

    // Emissive band climbing the pillars, a little brighter on the kick.  At ( 0.25 + 1.5 kick ) x 2.2 it went
    // from 0.55 to 3.85 on every beat: on the near pillars, which fill the frame's sides, hard bright blocks that
    // jumped with the drums (18.10.2026).
    if ( vKind > 0.5 )
    {
        float band = fract( vHeight * 1.2 - time * 0.30 );
        col += hue2rgb( fract( hue + 0.5 ) )
               * pow( max( 1.0 - abs( band - 0.5 ) * 7.0, 0.0 ), 3.0 )
               * ( 0.8 + 0.5 * audioKick ) * 0.9;
    }

    vec3 H = normalize( L + V );
    col += vec3( 1.0, 0.95, 0.85 ) * pow( max( dot( n, H ), 0.0 ), 60.0 )
           * sun_vis * rel * ( 0.5 + 0.6 * audioHigh ) * 1.4;

    // Distance haze so the hall recedes. Pushed out from 190 to 300 units and
    // darkened: at 190 the fog card owned the far half of the frame, became the
    // modal luma bucket and swallowed the colonnade behind it.
    float haze = clamp( vWorld.z / 300.0, 0.0, 1.0 );
    col = mix( col, vec3( 0.055, 0.075, 0.125 ) * ( 1.0 + 0.6 * audioAmbient ),
               pow( haze, 1.4 ) );

    col *= 1.0 + 0.16 * audioBeat + 0.12 * audioSubBass;
    col = col / ( 1.0 + col * 0.26 );
    fragColor = vec4( col, interpolation );
}
