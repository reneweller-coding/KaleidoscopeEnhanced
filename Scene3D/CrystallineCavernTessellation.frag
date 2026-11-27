#version 430 core
/*****************************************************************************\
 *                              CrystallineCavernTessellation.frag
\*****************************************************************************/
/*! @file
 *
 *  @brief
 *  Lighting for a tessellated amethyst/quartz cavern: a point light at the cavern's centre lights the rock, a
 *  projected photo textures the stone substrate, and a per-vertex crystal mask (teCrystal) blooms into emissive,
 *  specular-highlighted facets.
 *
 *  Audio Reactivity:
 *   - audioKick      -> brightness of the crystal facet emission
 *   - audioChromaHue -> MUSICAL KEY: rotates the final colour, and sets the arc
 *                       imgPalette() reads the gem hue from in the photo
 *   - audioAdvance   -> slow drift of that palette arc (integrated, never jumps)
 *   - audioValence   -> GEM SATURATION: a bleak mix gives near-grey stone, a
 *                       bright one lets the photo's full colour into the crystal
 *
 *  Distance from the eye fades everything into cavern fog. This shader
 *  follows a tessellation control/evaluation pair
 *  (CrystallineCavernTessellation.tesc, CrystallineCavernTessellation.tese)
 *  that subdivides the cavern mesh before this stage shades it.
 *
 *  @author René Weller
 */
out vec4 fragColor; ///< The pixel's colour (output).

in vec3  tePos;     ///< Pos (from the tessellation evaluation stage).
in vec3  teNormal;  ///< Normal (from the tessellation evaluation stage).
in vec2  teUV;      ///< UV (from the tessellation evaluation stage).
in float teCrystal; ///< Crystal (from the tessellation evaluation stage).

uniform float     time;          ///< Seconds since this activation, plus a rolled start (see sceneTime).
uniform sampler2D tex0;          ///< The current photo.
uniform sampler2D tex1;          ///< The next photo (cross-faded in by interpolation).
uniform float     interpolation; ///< Cross-fade between the photos: 1 = tex0, 0 = tex1.

uniform float audioKick;      ///< Kick-drum envelope, 0..1 (fast attack, short decay).
uniform float audioChromaHue; ///< Hue of the dominant pitch class (radians, unwrapped: continuous).
uniform float audioSwell;     ///< Slow loudness envelope, 0..1 (seconds).
uniform float audioAdvance;   ///< The music's advance: integrated tempo-weighted energy (never jumps, never runs
                              ///< backwards).
uniform float audioValence;   ///< Mood valence: 0 dark .. 1 bright.

uniform float glowP;    ///< Glow / afterglow knob, 0..1.
uniform float crystalP; ///< Crystal knob, 0.5..2.2.
uniform float hueP;     ///< Hue knob (radians), usually the music's chroma hue plus a rolled offset.

// ---- photo relief (Tools/scenegen/patch_relief3d.py) ----
// The photo's depth map (its alpha channel) is a height on the surfaces the photo covers: its slope tilts the normal,
// and the scene lights the tilted normal as before.  At reliefP = 0 none of it runs and the scene renders as before.
uniform float reliefP;       ///< Photo relief: 0 = off (the old look) .. 1 = full depth; rolled per activation.
uniform vec2  photoDepthAmt; ///< 1 where the photo slot carries a depth map (x: tex0, y: tex1), else 0.

/** The screen-space derivatives a relief needs at one pixel (Mikkelsen's sigma_x and sigma_y, and the photo's). */
struct ReliefFrame
{
    vec3 sx; ///< Shaded point per pixel to the right.
    vec3 sy; ///< Shaded point per pixel up.
    vec2 ux; ///< Photo coordinate per pixel to the right.
    vec2 uy; ///< Photo coordinate per pixel up.
};

/**  The derivatives a relief needs at this pixel.
 *
 * @param p   The shaded point, in the frame of the normal later given to reliefNormal(). (in)
 * @param uv  The photo coordinate, continuous: before a fract() that tiles it (the tiles' seams are steps). (in)
 *
 * @return
 *   The pixel's derivatives.
 *
 * Screen-space derivatives: call it where all four pixels of a 2 x 2 quad run the same code -- outside branches that
 * depend on the pixel (a branch on a value constant per primitive is fine: a quad belongs to one primitive).
 **/
ReliefFrame reliefFrame( vec3 p, vec2 uv )
{
    ReliefFrame f;
    f.sx = dFdx( p );
    f.sy = dFdy( p );
    f.ux = dFdx( uv );
    f.uy = dFdy( uv );
    return f;
}

/**  The photo's depth at a coordinate: both slots cross-faded with interpolation like img(), each only where it
 * carries a depth map.
 *
 * @param uv   Coordinate in the photo. (in)
 * @param lod  Mip level: 0 = full size, 2 = 256 x 256 texels of a 1024 photo. (in)
 *
 * @return
 *   The depth, 0 = far (or no map) .. 1 = near.
 **/
float reliefDepth( vec2 uv, float lod )
{
    return interpolation * photoDepthAmt.x * textureLod( tex0, uv, lod ).a
           + ( 1.0 - interpolation ) * photoDepthAmt.y * textureLod( tex1, uv, lod ).a;
}

/**  The slope of the photo's depth: four taps on the diagonals, one texel of the level out (each a bilinear mean of
 * four texels: together a 3 x 3 Sobel-like kernel of that level).
 *
 * @param uv   Coordinate in the photo. (in)
 * @param lod  Mip level. (in)
 *
 * @return
 *   d depth / d uv.
 **/
vec2 reliefSlope( vec2 uv, float lod )
{
    vec2  e = exp2( lod ) / vec2( textureSize( tex0, 0 ) ); // one texel of that level
    float a = reliefDepth( uv + vec2( -e.x, -e.y ), lod );
    float b = reliefDepth( uv + vec2( e.x, -e.y ), lod );
    float c = reliefDepth( uv + vec2( -e.x, e.y ), lod );
    float d = reliefDepth( uv + vec2( e.x, e.y ), lod );
    return vec2( ( b + d ) - ( a + c ), ( c + d ) - ( a + b ) ) / ( 4.0 * e );
}

/**  The surface normal tilted by the photo's relief (Mikkelsen 2010, "Bump Mapping Unparametrized Surfaces on the
 * GPU").
 *
 * @param n    The surface normal: unit length, pointing out of the surface (the relief rises along it), in the
 *             frame of the point given to reliefFrame(). (in)
 * @param f    The pixel's derivatives (reliefFrame()). (in)
 * @param uv   The photo coordinate as the scene samples the colour (tiled or not). (in)
 * @param amt  Depth of the relief: 1 = 15 % of the photo's width on the surface (less on the map's steep edges).
 *             (in)
 *
 * @return
 *   The tilted normal (unit length); n itself where the photo has no map, where the photo is minified so far that a
 *   relief would only shimmer (or at a seam of its tiling), and where the derivatives degenerate.
 *
 * The depth's slope in the photo comes from taps of coarse mips (reliefSlope()), not from the screen derivative of
 * the depth: the 8-bit map is flat between its steps, a derivative of it would draw terraces.  Two scales, averaged:
 * level 2 (256 texels of the 1024 photo, coarser as the photo shrinks on the screen) for the detail, two levels
 * coarser for the shapes -- with the fine one alone the relief was the photo's depth edges as thin lines and little
 * else.  The chain rule takes the slope to the screen (dh/dx = grad h . duv/dx), Mikkelsen's surface gradient onto
 * the surface:
 *   grad_s h = ( h_x ( sy x n ) + h_y ( n x sx ) ) / ( sx . ( sy x n ) ),   n' = normalize( n - A grad_s h ),
 * with the relief's depth A a share of the photo's extent on the surface (world length per unit of uv), so the tilt
 * does not depend on the scene's scale.  The map's edges are steps (an object in front of another): their slope is
 * compressed (g / (1 + |g| / 8)) and the tilt softly limited below about 45 degrees -- uncompressed, the edges
 * saturated at any depth and drew dark cracks.  Only textureLod() here: it may run inside pixel-dependent branches
 * (reliefFrame() may not).
 **/
vec3 reliefNormal( vec3 n, ReliefFrame f, vec2 uv, float amt )
{
    vec2  ts = vec2( textureSize( tex0, 0 ) );
    vec2  ax = f.ux * ts, ay = f.uy * ts;
    float fp = sqrt( max( dot( ax, ax ), dot( ay, ay ) ) ); // the pixel's footprint in texels of the full photo
    float fade = 1.0 - smoothstep( 24.0, 64.0, fp );
    vec3  r1 = cross( f.sy, n ), r2 = cross( n, f.sx );
    float det = dot( f.sx, r1 );
    float uvl = dot( f.ux, f.ux ) + dot( f.uy, f.uy );
    float has = interpolation * photoDepthAmt.x + ( 1.0 - interpolation ) * photoDepthAmt.y;
    if ( !( has > 0.0 ) || !( fade > 0.0 ) || !( abs( det ) > 1e-20 ) || !( uvl > 1e-16 ) || !( amt > 0.0 ) )
        return n;
    float lod = clamp( log2( max( fp, 1.0 ) ) + 1.0, 2.0, 6.0 );
    vec2  g = 0.5 * ( reliefSlope( uv, lod ) + reliefSlope( uv, lod + 2.0 ) ); // depth per unit of uv
    g /= 1.0 + length( g ) * 0.125; // a step of the map is an occlusion edge, not a cliff: steep slopes compressed
    float wl = sqrt( ( dot( f.sx, f.sx ) + dot( f.sy, f.sy ) ) / uvl );        // world length per unit of uv
    vec3  sg = ( dot( g, f.ux ) * r1 + dot( g, f.uy ) * r2 ) / det;            // the surface gradient of the depth
    vec3  t = sg * ( 0.15 * amt * wl * fade );
    t /= sqrt( 1.0 + dot( t, t ) * 1.23 ); // soft limit: |t| < 0.9
    return normalize( n - t );
}
// ---- end of the photo relief ----

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

/**  IMG-PALETTE (house standard): the gem hue comes from a rotating arc in the CURRENT slideshow photo, so every
 * activation inherits its colour from the pictures instead of from two hard-coded candy tones.
 *
 * @param t  Position on the palette arc, 0..1 for one turn. (in)
 *
 * @return
 *   The palette colour (RGB).
 *
 * The arc follows the musical key (audioChromaHue is circular-slewed, so it never jumps), drifts with audioAdvance, and
 * valence shapes how saturated it comes out.
 **/
vec3 imgPalette( float t )
{
    float ang = audioChromaHue + audioAdvance * 0.04 + t * 6.2831853;
    float rad = 0.16 + 0.08 * sin( audioAdvance * 0.013 );
    vec3  pc = img( clamp( vec2( 0.5 ) + rad * vec2( cos( ang ), sin( ang ) ), 0.0, 1.0 ) );
    float pg = dot( pc, vec3( 0.333 ) );
    return mix( vec3( pg ), pc, 0.55 + 0.45 * audioValence );
}

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

/** Entry point of this shader stage (the file description says what it draws). */
void main()
{
    float glw = ( glowP > 0.0 ) ? glowP : 1.0;
    float cry = ( crystalP > 0.0 ) ? crystalP : 1.0;
    float hue = ( hueP > 0.0 ) ? hueP : 0.0;

    vec3 n = normalize( teNormal );
    if ( reliefP > 0.0 ) // the photo's relief in the rock, not on the crystals (patch_relief3d.py)
        n = reliefNormal( n, reliefFrame( tePos, teUV * 3.0 ), fract( teUV * 3.0 ),
                          reliefP * ( 1.0 - smoothstep( 0.2, 0.8, teCrystal ) ) );
    vec3 light_pos = vec3( 0.0, 0.0, 0.0 ); // Lantern in cavern center

    // WHERE THE EYE ACTUALLY IS.  The .tese projects with vp = pos + (0,0,6.5),
    // so the camera sits at object-space z = -6.5, not +6.5. Both the view
    // vector and the fog distance below were built against +6.5 -- the far END
    // of the tunnel -- which put the specular response on the wrong side of
    // every facet and, worse, INVERTED the fog: the nearest, most detailed
    // stretch of cavern was the most heavily washed out while the far end came
    // through clear. That is what flattened the picture (contrast 0.053).
    const vec3 Eye = vec3( 0.0, 0.0, -6.5 );

    vec3 l = normalize( light_pos - tePos );
    vec3 view_dir = normalize( Eye - tePos );

    float diff = max( dot( n, l ), 0.0 );
    vec3  ref = reflect( -l, n );
    float spec = pow( max( dot( ref, view_dir ), 0.0 ), 32.0 );

    // Amethyst / quartz crystal colouring, pulled onto the house model.  The
    // two gems were vec3(0.6,0.2,0.9) and vec3(0.1,0.8,0.95) -- 0.78 and 0.89
    // saturated -- and the tunnel swept the WHOLE distance between them, so
    // close to a fifth of the picture came back as hard candy-coloured pixels
    // (measured satHi 0.188). The two gems now sit a single step apart around
    // the cavern's own amethyst, and the hue itself is carried by the photo
    // with the musical key rotating the arc: the same stone, catalogue palette.
    vec3  gem_a = vec3( 0.46, 0.28, 0.62 ); // amethyst
    vec3  gem_b = vec3( 0.30, 0.46, 0.62 ); // pale quartz, one neighbour away
    float band = sin( tePos.z * 0.5 + time * 0.6 ) * 0.5 + 0.5;
    vec3  crystal_base = mix( mix( gem_a, gem_b, band ),
                              imgPalette( band * 0.4 + 0.1 ) * 1.15, 0.45 );

    // Rock substrate photo texturing
    vec3 rock_photo = img( fract( teUV * 3.0 ) );
    // The substrate was 0.08 x photo, i.e. essentially black, so everything that
    // was not a crystal facet contributed nothing at all to the picture.
    vec3 rock_base = vec3( 0.20, 0.16, 0.24 ) * ( 0.35 + 0.95 * rock_photo );

    // Faceted crystal emission & subsurface scattering
    float crystal_mask = smoothstep( 0.2, 0.8, teCrystal );
    vec3  emission = crystal_base * crystal_mask * ( 1.2 + 2.0 * audioKick ) * cry * glw;

    // Specular reflections on crystalline facets
    vec3 col = mix( rock_base, crystal_base * 0.5, crystal_mask ) * ( diff * 0.9 + 0.16 );
    col += vec3( 1.0 ) * min( spec * ( 0.5 + crystal_mask * 1.5 ), 1.2 );
    col += emission;

    // Distance depth fog, measured from the eye (see Eye above).
    float dist = length( tePos - Eye );
    col = mix( col, vec3( 0.03, 0.02, 0.06 ), min( 1.0 - exp( -dist * 0.075 ), 0.72 ) );

    col = hueRot( col, audioChromaHue + hue );
    col = min( col, vec3( 1.4 ) );
    col /= 1.0 + 0.30 * max( col.r, max( col.g, col.b ) );
    fragColor = vec4( clamp( col, 0.0, 1.0 ), 1.0 );
}
