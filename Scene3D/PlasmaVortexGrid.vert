#version 330 core
/**
 * @file PlasmaVortexGrid.vert
 * @brief Vertex stage companion to PlasmaVortexGrid.frag -- see that file's header for
 * this scene's description.
 */
// PlasmaVortexGrid.vert — 220x120 heightfield grid deformed into a swirling
// relativistic energy whirlpool with Bessel wave harmonics and glowing grid lines.
//   attrA.xy = u/v, attrA.w = cell index
//   attrB    = per-cell seeds
// True stereo: eyeOff shifts view; convergence re-centres after proj.

in vec4 attrA; ///< Vertex attribute A (meaning per geometry kind, see the stage's header; e.g. position or u/v and an
               ///< index).
in vec4 attrB; ///< Vertex attribute B (meaning per geometry kind; e.g. normal or per-element seeds).

uniform mat4  projM;  ///< Projection matrix.
uniform float eyeOff; ///< Stereo eye offset (0 in mono).
uniform float time;   ///< Seconds since the program started (never reset; see sceneTime).

uniform float audioAdvance;      ///< The music's advance: integrated tempo-weighted energy (never jumps, never runs
                                 ///< backwards).
uniform float audioKick;         ///< Kick-drum envelope, 0..1 (fast attack, short decay).
uniform float audioSubBass;      ///< Sub-bass band level, 0..1.
uniform float audioBass;         ///< Bass band level, 0..1.
uniform float audioHigh;         ///< High band level, 0..1.
uniform float audioSwell;        ///< Slow loudness envelope, 0..1 (seconds).
uniform float audioDrop;         ///< Drop envelope: high after a detected drop, decaying.
uniform float audioSpectrum[32]; ///< Spectrum bands, 0..1.

uniform float     depthP;         ///< Depth knob, 0..1.
uniform float     rippleP;        ///< Ripple knob, 0.5..2.2.
uniform float     glowP;          ///< Glow / afterglow knob, 0..1.
uniform float     hueP;           ///< Hue knob (radians), usually the music's chroma hue plus a rolled offset.
uniform sampler2D tex0;           ///< The current photo.
uniform sampler2D tex1;           ///< The next photo (cross-faded in by interpolation).
uniform float     interpolation;  ///< Cross-fade between the photos: 1 = tex0, 0 = tex1.
uniform float     audioChromaHue; ///< Hue of the dominant pitch class (radians, unwrapped: continuous).
uniform float     audioValence;   ///< Mood valence: 0 dark .. 1 bright.

out vec3 vWorld; ///< World position (from the vertex stage).
out vec2 vUV;    ///< Texture coordinate 0..1 over the screen (from the vertex stage).
out vec4 vCol;   ///< Colour (from the vertex stage).

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
    float u = attrA.x;
    float v = attrA.y;

    float dpth = ( depthP > 0.0 ) ? depthP : 1.0;
    float rpl = ( rippleP > 0.0 ) ? rippleP : 1.0;
    float glw = ( glowP > 0.0 ) ? glowP : 1.0;
    float hue = ( hueP > 0.0 ) ? hueP : 0.0;

    // Convert u,v to radial coordinates centered on grid
    float x = ( u - 0.5 ) * 80.0;
    float z = ( v - 0.5 ) * 80.0;
    float r = sqrt( x * x + z * z );
    float a = atan( z, x );

    // Vortex swirl as a TRAVELING SPIRAL WAVE: rigid base rotation plus a
    // bounded radial wave.  The old cumulative differential twist sheared
    // neighbouring grid rings apart without limit — after a few seconds the
    // mesh tore into the hard glitch shards the user reported.
    float T = time * 1.5 + audioAdvance * 2.0;
    float twisted_a = a + 0.35 * T
                      + 1.6 * sin( r * 0.22 - T * 0.30 ) * ( 4.0 / ( r * 0.3 + 3.0 ) );

    // Gravitational funnel depth
    float funnel = -( 18.0 * dpth ) / ( r * 0.25 + 1.2 ) - audioSubBass * 4.0;

    // Bessel wave ripples propagating outwards
    float ripple_phase = r * ( 0.6 * rpl ) - time * 4.0 - audioAdvance * 2.0;
    int   band = int( clamp( r / 40.0 * 31.0, 0.0, 31.0 ) );
    float wave_h = sin( ripple_phase ) * ( 1.5 + audioSpectrum[band] * 2.5 );

    // Shockwave tsunami from audioKick
    float shock = sin( r * 0.8 - fract( time * 2.0 ) * 20.0 ) * exp( -r * 0.08 ) * audioKick * 3.5;

    float final_h = funnel + wave_h + shock;

    // Swirled x, z coordinates
    float swirled_x = cos( twisted_a ) * r;
    float swirled_z = sin( twisted_a ) * r;

    vec3 world_p = vec3( swirled_x, final_h, swirled_z );

    // Camera banking around and looking into the funnel
    float cam_angle = time * 0.15 + audioAdvance * 0.05;
    float cam_dist = 32.0 - audioSwell * 6.0;
    vec3  cam_pos = vec3( sin( cam_angle ) * cam_dist, 18.0 + 4.0 * sin( time * 0.2 ), cos( cam_angle ) * cam_dist );
    vec3  look_target = vec3( 0.0, -6.0, 0.0 );

    vec3 ww = normalize( look_target - cam_pos );
    vec3 uu = normalize( cross( ww, vec3( 0.0, 1.0, 0.0 ) ) );
    vec3 vv = cross( uu, ww );

    vec3 rel_p = world_p - cam_pos;
    vec3 view_p = vec3( dot( rel_p, uu ), dot( rel_p, vv ), dot( rel_p, ww ) );

    view_p.x -= eyeOff;
    gl_Position = projM * vec4( view_p.x, view_p.y, -view_p.z, 1.0 );
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;

    vWorld = world_p;
    vUV = attrA.xy;

    // Color gradient from fiery center to electric violet rim
    vec3 vortex_col = imgPalette( 0.35 * clamp( r / 35.0, 0.0, 1.0 ) ) * 1.4;
    vortex_col = mix( vortex_col, vec3( 0.9, 0.1, 1.0 ), sin( twisted_a * 3.0 ) * 0.5 + 0.5 );

    if ( hue > 0.001 )
        vortex_col = hueRot( vortex_col, hue );

    vCol = vec4( vortex_col * glw, 1.0 );
}
