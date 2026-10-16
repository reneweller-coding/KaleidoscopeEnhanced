#version 330 core
/*****************************************************************************\
 *                              Tornado.vert
\*****************************************************************************/
/*! @file
 *
 *  @brief
 *  Vertex stage companion to Tornado.frag -- see that file's header for this scene's description.
 *
 *  @author René Weller
 */
// Tornado.vert — a debris vortex under a storm sky: 60k particles spiral in
// a funnel whose spin rate follows the music's energy; kicks cinch the
// funnel tight, snares crackle lightning-white debris.

in vec4 attrA; ///< Vertex attribute A (meaning per geometry kind, see the stage's header; e.g. position or u/v and an
               ///< index).
in vec4 attrB; ///< Vertex attribute B (meaning per geometry kind; e.g. normal or per-element seeds).

uniform mat4  projM;      ///< Projection matrix.
uniform float eyeOff;     ///< Stereo eye offset (0 in mono).
uniform float time;       ///< Seconds since the program started (never reset; see sceneTime).
uniform vec2  resolution; ///< Size of the render target in pixels.

uniform float audioAdvance;       ///< The music's advance: integrated tempo-weighted energy (never jumps, never runs
                                  ///< backwards).
uniform float     audioSwell;     ///< slow envelope, the calm replacement for the fast one (V7d)
uniform float     audioLevel;     ///< Overall loudness, 0..1.
uniform float     audioKick;      ///< Kick-drum envelope, 0..1 (fast attack, short decay).
uniform float     audioSnare;     ///< Snare envelope, 0..1.
uniform float     audioChromaHue; ///< Hue of the dominant pitch class (radians, unwrapped: continuous).
uniform float     audioDrop;      ///< Drop envelope: high after a detected drop, decaying.
uniform sampler2D tex0;           ///< The current photo.
uniform sampler2D tex1;           ///< The next photo (cross-faded in by interpolation).
uniform float     interpolation;  ///< Cross-fade between the photos: 1 = tex0, 0 = tex1.
uniform float     audioValence;   ///< Mood valence: 0 dark .. 1 bright.

out vec4 vCol; ///< Colour (from the vertex stage).

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


/**  House tint: bend a colour toward the photo palette while keeping its luminance -- the identity look survives,
 * only the hue follows the photos.
 *
 * @param c  The colour. (in)
 * @param t  Position on the palette, 0..1. (in)
 * @param k  Strength of the tint, 0..1. (in)
 *
 * @return
 *   The tinted colour.
 **/
vec3 palTint( vec3 c, float t, float k )
{
    vec3 tp = imgPalette( t );
    tp *= dot( c, vec3( 0.3333 ) ) / max( dot( tp, vec3( 0.3333 ) ), 1e-3 );
    return mix( c, tp, k );
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
    float r1 = attrB.x, r2 = attrB.y, r3 = attrB.z, r4 = attrB.w;

    // Height in the funnel (dense near the ground).  Taller than before
    // (was 42) - user feedback: the scene should fill more of the screen.
    float y = -18.0 + 50.0 * pow( r1, 1.5 );

    // Funnel radius grows with height; the kick cinches it, a DROP rips it
    // wide open for a beat.  Stronger growth in width (was 1.8/0.28) for a
    // bigger funnel overall that fills more of the picture.
    float r_base = ( 2.2 + ( y + 18.0 ) * 0.36 ) * ( 0.55 + 0.9 * r2 );
    float r = r_base * ( 1.0 + 0.15 * audioSwell );

    // FLUNG DEBRIS: ~6 % of the particles get hurled out of the funnel on
    // hard kicks — they arc outward and sink back as the envelope decays.
    if ( r4 > 0.94 )
    {
        float fling = audioKick * ( 0.5 + 0.5 * sin( r3 * 40.0 ) );
        r += fling * 22.0;
        y += fling * ( r2 - 0.3 ) * 14.0;
    }
    // FORKED LIGHTNING: on the snare, ~3 % of particles snap into a jagged
    // BOLT from the storm ceiling down into the funnel throat — a real
    // visible strike, not just a glow.
    bool is_bolt = ( r4 > 0.91 && r4 <= 0.94 );

    // Spin: fast at the bottom, music-driven (advance = integrated energy).
    float om = 2.6 / ( 0.35 + ( y + 18.0 ) * 0.05 );
    float ang = r3 * 6.2831853 + ( time * 0.55 + audioAdvance * 1.15 ) * om;

    // The funnel snakes.
    vec2 sway = vec2( sin( y * 0.09 + time * 0.5 ), cos( y * 0.07 + time * 0.4 ) )
                * ( 2.0 + 2.5 * audioLevel );

    vec3 world = vec3( cos( ang ) * r + sway.x, y, sin( ang ) * r + sway.y );

    // FORKED LIGHTNING shape: winding CONTINUOUSLY instead of being re-rolled
    // periodically.  The old version swapped the WHOLE shape for a new random
    // one every ~0.77 s via floor(time*1.3) - even with a cross-fade, a morph
    // between two UNRELATED zigzag shapes is no glide but a twitch (user
    // feedback: "thicker bars that jump around discontinuously").  Now there
    // is no floor() / random step at all: bx/zig are smooth functions of time,
    // and the arc writhes lively instead of teleporting.
    if ( is_bolt )
    {
        float t_b = r1; // 0 top .. 1 strike point
        float bx = sin( time * 0.85 + r3 * 3.1 ) * 20.0
                   + sin( time * 2.15 + r3 * 6.7 ) * 8.0;
        float zig = ( sin( time * 3.05 + t_b * 26.0 + r3 * 11.0 ) * 0.75
                      + sin( time * 5.6 + t_b * 41.0 + r3 * 4.0 ) * 0.25 )
                    * 7.0
                    * ( 1.0 - t_b * 0.5 );
        world = vec3( bx * ( 1.0 - t_b ) + zig
                          + cos( r3 * 6.2831853 ) * 0.3,
                      26.0 - t_b * 40.0,
                      sin( r3 * 6.2831853 ) * 0.3 );
    }

    // Camera circles the storm — and DIVES: the orbit distance and height
    // breathe over ~30 s, from a wary wide shot down into the debris rain.
    float ca = time * 0.055;
    float orb_r = 40.0 + 16.0 * sin( time * 0.033 + 1.0 );
    float orb_h = 6.0 + 9.0 * sin( time * 0.021 );
    vec3  cam = vec3( cos( ca ) * orb_r, orb_h, sin( ca ) * orb_r );
    vec3  fwd = normalize( vec3( 0.0, 2.0, 0.0 ) - cam );
    vec3  rgt = normalize( cross( fwd, vec3( 0.0, 1.0, 0.0 ) ) );
    vec3  up = cross( rgt, fwd );
    vec3  rel = world - cam;
    vec3  vp = vec3( dot( rel, rgt ), dot( rel, up ), dot( rel, fwd ) );

    vp.x -= eyeOff;
    gl_Position = projM * vec4( vp.x, vp.y, -vp.z, 1.0 );
    gl_Position.x += eyeOff * 0.05 * gl_Position.w;
    // A soft fade-out instead of a hard teleport: the old line "if (vp.z<0.4)
    // gl_Position = far away" made particles that pass close by during the
    // camera's dive vanish and reappear INSTANTLY - one of the discontinuities
    // the user reported.  near_fade fades the COLOUR out long before the pure
    // safety cut-off (for numerically degenerate projections very close to or
    // behind the camera) takes effect at all.
    float near_fade = smoothstep( 0.15, 0.65, vp.z );
    if ( vp.z < 0.05 )
        gl_Position = vec4( 0.0, 0.0, -3.0, 1.0 );

    float px = resolution.y / 1080.0;
    float dist = max( vp.z, 0.5 );
    gl_PointSize = clamp( 194.8 * ( 0.4 + 0.8 * r4 ) * px / dist, 1.5, 28.0 * px ); // sprite sweep 2026-08-22: measured
                                                                                    // luma 0.033, area x4.2

    // Dust and debris; a few crackle white on the snare.  LIGHTNING: the
    // snare also fires a flash INSIDE the funnel at a wandering height —
    // the whole storm glows from within for an instant.  A slight colour drift
    // with height (cool below, warm above) for more visual depth and interest.
    vec3 col = palTint( mix( vec3( 0.45, 0.38, 0.33 ), vec3( 0.60, 0.58, 0.62 ), r2 ), 0.30 * r2, 0.15 );
    col = mix( col, col * vec3( 1.05, 0.95, 1.20 ), clamp( ( y + 18.0 ) / 48.0, 0.0, 1.0 ) );
    col = col;
    // Also wandering continuously instead of jumping via floor() (the same
    // reason as for the lightning arc above).
    float flash_y = 7.0 + 25.0 * sin( time * 1.15 + 2.1 );
    float inner = exp( -abs( y - flash_y ) * 0.10 ) * audioSnare;
    col += vec3( 0.75, 0.80, 1.0 ) * inner * 2.4;
    if ( is_bolt )
        col = vec3( 0.9, 0.95, 1.2 ) * ( audioSnare * 6.0 + audioDrop * 2.0 );
    else if ( r4 > 0.94 )
        col += vec3( 0.8, 0.85, 1.0 ) * ( audioSnare * 2.2 + audioDrop * 1.5 );
    // A higher resting share (was 0.5): in quiet passages the funnel looked
    // too thin/empty - now it stays clearly visible even without a strong
    // level, without the music's reaction (the 0.9/0.8 terms) losing its bite.
    col *= ( 0.62 + 0.9 * audioLevel + 0.8 * audioDrop )
           * ( 0.45 + 0.55 * pow( 1.0 - r1, 0.7 ) )
           * clamp( 1.0 - vp.z / 110.0, 0.0, 1.0 )
           * near_fade;
    vCol = vec4( col * 3.0, 1.0 );
}
