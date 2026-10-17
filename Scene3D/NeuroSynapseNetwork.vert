#version 330 core
/*****************************************************************************\
 *                              NeuroSynapseNetwork.vert
\*****************************************************************************/
/*! @file
 *
 *  @brief
 *  Vertex stage companion to NeuroSynapseNetwork.frag -- see that file's header for this scene's description.
 *
 *  @author René Weller
 */
// NeuroSynapseNetwork.vert — 60,000 synaptic nodes forming a 3D neural connectome.
// Action potential electrical spikes race across axonal pathways on beat transients.
//   attrA.w = point index, attrB = random seeds (4 channels)
// True stereo: eyeOff shifts view; convergence re-centres after proj.

in vec4 attrA; ///< Vertex attribute A (meaning per geometry kind, see the stage's header; e.g. position or u/v and an
               ///< index).
in vec4 attrB; ///< Vertex attribute B (meaning per geometry kind; e.g. normal or per-element seeds).

uniform mat4  projM;  ///< Projection matrix.
uniform float eyeOff; ///< Stereo eye offset (0 in mono).
uniform float time;   ///< Seconds since this activation, plus a rolled start (see sceneTime).

uniform float audioAdvance;      ///< The music's advance: integrated tempo-weighted energy (never jumps, never runs
                                 ///< backwards).
uniform float audioPhase;        ///< Rotation phase driven by the music (integrated, never jumps).
uniform float audioKick;         ///< Kick-drum envelope, 0..1 (fast attack, short decay).
uniform float audioSubBass;      ///< Sub-bass band level, 0..1.
uniform float audioBass;         ///< Bass band level, 0..1.
uniform float audioHigh;         ///< High band level, 0..1.
uniform float audioSwell;        ///< Slow loudness envelope, 0..1 (seconds).
uniform float audioSpectrum[32]; ///< Spectrum bands, 0..1.

uniform float     densityP;       ///< Density knob, 0..1.
uniform float     sparkP;         ///< Spark knob, 0.5..2.2.
uniform float     camDistP;       ///< Camera distance knob, 0..1.
uniform float     hueP;           ///< Hue knob (radians), usually the music's chroma hue plus a rolled offset.
uniform sampler2D tex0;           ///< The current photo.
uniform sampler2D tex1;           ///< The next photo (cross-faded in by interpolation).
uniform float     interpolation;  ///< Cross-fade between the photos: 1 = tex0, 0 = tex1.
uniform float     audioChromaHue; ///< Hue of the dominant pitch class (radians, unwrapped: continuous).
uniform float     audioValence;   ///< Mood valence: 0 dark .. 1 bright.
uniform vec2 resolution; ///< Size of the render target in pixels (point sprites scale with it).

out vec4  vCol;  ///< Colour (from the vertex stage).
out float vLife; ///< Life (from the vertex stage).

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

float PointScale = 1.0; ///< The render height over 1080 (set first thing in main()).

/** Entry point of this shader stage (the file description says what it draws). */
void main()
{
    // Sized for 1080p and scaled to the render size (17.10.2026): in pixels alone, the sprites covered 2.25 times
    // the picture at 720p -- where the adaptive resolution goes when the GPU is busy -- and ran into a flat sheet.
    PointScale = resolution.y > 0.0 ? resolution.y / 1080.0 : 1.0;
    float idx = attrA.w;
    vec4  seeds = attrB;

    float dens = ( densityP > 0.0 ) ? densityP : 1.0;
    float sprk = ( sparkP > 0.0 ) ? sparkP : 1.0;
    float c_dst = ( camDistP > 0.0 ) ? camDistP : 1.0;
    float hue = ( hueP > 0.0 ) ? hueP : 0.0;

    // Connectome structure: 2 Brain Hemispheres + Neural Axon Traces
    float hemisphere = ( seeds.x > 0.5 ) ? 1.0 : -1.0;

    // Ellipsoidal brain lobe coordinate
    float phi = seeds.y * 6.2831853;
    float theta = ( seeds.z - 0.5 ) * 3.14159;
    float r_lobe = 6.5 * pow( seeds.w, 0.45 ) * dens;

    vec3 lobe_pos = vec3(
        cos( theta ) * cos( phi ) * 4.5 * hemisphere + hemisphere * 2.5,
        sin( theta ) * 5.0,
        cos( theta ) * sin( phi ) * 7.0 );

    // Axonal pathway filament tracing (Fibonacci spiral nerve bundles)
    float axon_phase = fract( seeds.x * 20.0 + time * 0.15 + audioAdvance * 0.1 );
    vec3  axon_pos = mix( lobe_pos, lobe_pos * 0.2, axon_phase );

    // Dynamic neural wave propagation (depolarization waves)
    float brain_dist = length( lobe_pos );
    float brain_wave = sin( brain_dist * 1.5 - time * 4.0 - audioPhase * 6.0 );

    // Action potential electrical discharge
    float action_potential = pow( sin( seeds.x * 100.0 - time * 8.0 - audioKick * 6.0 ) * 0.5 + 0.5, 12.0 ) * sprk;

    vec3 final_pos = mix( lobe_pos, axon_pos, 0.5 );
    final_pos += vec3( 0.0, sin( time + seeds.y * 6.28 ) * 0.3, 0.0 );
    final_pos += ( seeds.xyz - 0.5 ) * audioSubBass * 1.5;

    // Orbiting 3D camera
    float cam_angle = time * 0.12 + audioAdvance * 0.04;
    float cam_dist = ( 16.0 * c_dst ) - audioSwell * 3.0;
    vec3  cam_pos = vec3( sin( cam_angle ) * cam_dist, 4.0 + 3.0 * sin( time * 0.15 ), cos( cam_angle ) * cam_dist );
    vec3  look_target = vec3( 0.0, 0.0, 0.0 );

    vec3 ww = normalize( look_target - cam_pos );
    vec3 uu = normalize( cross( ww, vec3( 0.0, 1.0, 0.0 ) ) );
    vec3 vv = cross( uu, ww );

    vec3 rel_p = final_pos - cam_pos;
    vec3 view_p = vec3( dot( rel_p, uu ), dot( rel_p, vv ), dot( rel_p, ww ) );

    view_p.x -= eyeOff;
    gl_Position = projM * vec4( view_p.x, view_p.y, -view_p.z, 1.0 );
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;

    // Point sprite size by depth and action potential — capped low: the
    // additive network integrates sprite AREA, the old 64 px cap was the
    // real reason the palette washed to white.
    float p_size = ( 2.0 + action_potential * 9.0 + audioHigh * 2.0 ) * ( 25.0 / max( view_p.z, 1.0 ) ); // sprite sweep
    gl_PointSize = ( clamp( p_size, 1.0, 26.0 ) ) * PointScale;

    // Synaptic colour from the photo arc (house standard); action potentials
    // still flash the classic gold so spikes read as events.
    vec3 base_col = imgPalette( 0.30 * ( brain_wave * 0.5 + 0.5 ) ) * 1.35;
    base_col = mix( base_col, vec3( 1.0, 0.95, 0.4 ), action_potential );

    if ( hue > 0.001 )
        base_col = hueRot( base_col, hue );

    vCol = vec4( base_col, 1.0 );
    vLife = action_potential;
}
