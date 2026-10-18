#version 330 core
/*****************************************************************************\
 *                              RydbergAtomQuantumSimulatorArray.vert
\*****************************************************************************/
/*! @file
 *
 *  @brief
 *  Vertex stage companion to RydbergAtomQuantumSimulatorArray.frag -- see that file's header for this scene's
 *  description.
 *
 *  SCREEN FILL: the tweezer array used to be a tiny cube -- 39^3 sites at a
 *  0.015..0.04 pitch, i.e. barely +-0.6..1.7 world units, seen from 4.5 units
 *  away -- so 60000 atoms all piled into one small central disc and 83% of the
 *  frame was black (occ 0.17) while that disc stacked ~20 sprites deep.  It is
 *  now a WIDE SLAB of tweezer planes, +-5.6 across but only +-1.6 deep, which
 *  overflows both frame edges at every depth it occupies; the fragment stage
 *  carries the matching exposure rebalance.
 *
 *  @author René Weller
 */

in vec4 attrA; ///< xyz = position seed, w = pointID
in vec4 attrB; ///< 4 seeds in [0,1)

out vec3  vCol;       ///< Colour (from the vertex stage).
out float vBlockade;  ///< Blockade (from the vertex stage).
out float vPointSize; ///< Point size (from the vertex stage).

uniform mat4  projM;  ///< Projection matrix.
uniform float eyeOff; ///< Stereo eye offset (0 in mono).
uniform float time;   ///< Seconds since this activation, plus a rolled start (see sceneTime).

uniform float audioPhase;     ///< Rotation phase driven by the music (integrated, never jumps).
uniform float audioAdvance;   ///< The music's advance: integrated tempo-weighted energy (never jumps, never runs
                              ///< backwards).
uniform float audioKick;      ///< Kick-drum envelope, 0..1 (fast attack, short decay).
uniform float audioSwell;     ///< Slow loudness envelope, 0..1 (seconds).
uniform float audioCentroid;  ///< Spectral centroid (brightness of the sound), 0..1.
uniform float audioValence;   ///< Mood valence: 0 dark .. 1 bright.
uniform float audioChromaHue; ///< Hue of the dominant pitch class (radians, unwrapped: continuous).

uniform sampler2D tex0;          ///< The current photo.
uniform sampler2D tex1;          ///< The next photo (cross-faded in by interpolation).
uniform float     interpolation; ///< Cross-fade between the photos: 1 = tex0, 0 = tex1.

uniform float arrayPitchP;  ///< Array pitch knob, 0.015..0.04.
uniform float pointSizeP;   ///< Point size knob, 8..16.
uniform float blockadeRadP; ///< Blockade rad knob, 0.2..0.8.
uniform vec2  resolution;   ///< Size of the render target in pixels (point sprites scale with it).

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

/**  The house palette: a colour of the photo on an arc that turns with the music's hue.
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
    vec3  col = img( clamp( vec2( 0.5 ) + rad * vec2( cos( ang ), sin( ang ) ), 0.0, 1.0 ) );
    float g = dot( col, vec3( 0.333 ) );
    return mix( vec3( g ), col, 0.55 + 0.45 * audioValence );
}

float PointScale = 1.0; ///< The render height over 1080 (set first thing in main()).

/** Entry point of this shader stage (the file description says what it draws). */
void main()
{
    // Sized for 1080p and scaled to the render size (17.10.2026): in pixels alone, the sprites covered 2.25 times
    // the picture at 720p -- where the adaptive resolution goes when the GPU is busy -- and ran into a flat sheet.
    PointScale = resolution.y > 0.0 ? resolution.y / 1080.0 : 1.0;
    float p_id = attrA.w;
    vec4  seeds = attrB;

    float t = time * 0.35 + audioAdvance * 0.3;

    // Optical tweezer 3D Rydberg atom array (simple cubic grid with quantum fluctuations)
    float pitch = ( arrayPitchP > 0.01 ? arrayPitchP : 0.028 );

    const float n_side = 39.0; // 39^3 = 59319 of the 60000 points
    if ( p_id >= n_side * n_side * n_side )
    {
        // Leftover points of the host's fixed 60000-point buffer: park them
        // outside the clip volume rather than letting mod() stack duplicates
        // on top of the first tweezer plane.
        vCol = vec3( 0.0 );
        vBlockade = 0.0;
        vPointSize = 1.0;
        gl_PointSize = ( 1.0 ) * PointScale;
        gl_Position = vec4( 0.0, 0.0, -3.0, 1.0 );
        return;
    }

    float ix = mod( p_id, n_side );
    float iy = mod( floor( p_id / n_side ), n_side );
    float iz = floor( p_id / ( n_side * n_side ) );

    // arrayPitchP still sets the tweezer spacing, but as a RELATIVE scale of a
    // slab that always overflows the frame: even the tightest pitch keeps the
    // half-width at 4.6 against a 4.17 frame half-width.  The DEPTH extent is
    // deliberately not scaled -- a deeper slab would push its near plane of
    // tweezers through the projection's 0.5 near plane.
    float p_scale = 0.82 + 0.50 * clamp( ( pitch - 0.015 ) / 0.025, 0.0, 1.0 );
    vec3  ext = vec3( 5.6 * p_scale, 5.6 * p_scale, 1.6 );

    vec3 unit = ( vec3( ix, iy, iz ) + 0.5 ) / n_side - 0.5; // [-0.5, +0.5]^3
    vec3 grid_pos = unit * 2.0 * ext;

    // Quantum zero-point motion in optical tweezers (scaled with the array)
    vec3 jitter = ( seeds.xyz - 0.5 ) * 0.11;
    vec3 world_pos = grid_pos + jitter;

    // Rydberg blockade radius (R_b): collective excitation wave propagating through atom array
    float r = length( grid_pos );
    float r_blockade = ( blockadeRadP > 0.01 ? blockadeRadP : 0.4 );
    // Full audioPhase made the excitation wave RACE across the lattice at
    // music tempo -- the white front repainting the whole grid was the real
    // source of the measured 0.33 hue flicker (two frag-side fixes later).
    // Quarter coupling keeps the wave musical at a watchable pace.
    float blockade_phase = sin( r * ( 1.6 + 3.2 * r_blockade ) - t * 2.5 + audioPhase * 0.25 );
    float is_rydberg_excited = smoothstep( 0.3, 0.9, blockade_phase );
    vBlockade = is_rydberg_excited;

    // Point size: after six rounds of gain surgery the scene still read as a
    // faint dark texture -- the atoms were simply too small to carry light at
    // this lattice density. Area is the honest lever: 18-34px instead of
    // 8-16px triples the lit area per atom; the per-point cap and knee in the
    // frag keep additive stacking from burning.
    float ps_max = ( pointSizeP > 0.01 ? pointSizeP : 26.0 );
    gl_PointSize = ( clamp( ps_max * ( 0.8 + 0.4 * is_rydberg_excited ), 18.0, 34.0 ) ) * PointScale;
    vPointSize = gl_PointSize;

    // Same raw-centroid hue-flicker trap as SuperconductingVortex: the
    // slewed chromaHue carries the harmony instead.
    vCol = imgPalette( fract( r * 0.14 + p_id * 0.0001 + audioChromaHue * 0.5 ) );

    // Camera Transform (V3)
    vec3 vp = world_pos;

    // In-plane roll: keeps the wide slab of tweezer planes facing the camera at
    // all times.  The old yaw about the vertical would have swung this slab
    // edge-on twice a turn and emptied the frame again.
    float ra = t * 0.15;
    float cr = cos( ra ), sr = sin( ra );
    vp = vec3( vp.x * cr - vp.y * sr, vp.x * sr + vp.y * cr, vp.z );

    // A shallow yaw wobble restores the 3D read without ever swinging the near
    // face of the slab through the near plane.
    float ya = 0.16 * sin( t * 0.11 );
    float cy = cos( ya ), sy = sin( ya );
    vp = vec3( vp.x * cy - vp.z * sy, vp.y, vp.x * sy + vp.z * cy );

    vp.z += 4.5;
    vp.x -= eyeOff;

    gl_Position = projM * vec4( vp.x, vp.y, -vp.z, 1.0 );
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;
}
