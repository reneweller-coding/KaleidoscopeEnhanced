#version 330 core
/**
 * @file MirrorShardKaleidoscope.vert
 * @brief 4,900 thin mirror-facet plates arranged as a real 3D kaleidoscope disc -- concentric
 * rings, each split into sidesP wedges with alternating copies mirrored (true 3D mirror symmetry,
 * not a fragment-shader fold), gently domed so outer rings recede from the camera. Each shard
 * tilts individually to the beat, so which facets catch the photo's reflection changes moment to
 * moment -- genuine parallax and specular response, unlike the flat 2D kaleidoscope folds already
 * in the catalogue.
 *   audioBeatPhase -> per-shard tilt oscillation (phase-offset per shard via its own seed)
 *   audioKick      -> tilt amplitude flare + brief metallic flash
 *   audioPhase     -> whole-disc spin (integrated, jump-free)
 *   audioSwell     -> camera distance breathes
 */

in vec4 attrA; ///< .xyz = unit-cube corner (-0.5..0.5), .w = cube index
in vec4 attrB; ///< 4 random seeds in [0,1)

uniform mat4  projM;  ///< Projection matrix.
uniform float eyeOff; ///< Stereo eye offset (0 in mono).
uniform float time;   ///< Seconds since the program started (never reset; see sceneTime).
uniform float cubeBudget;

uniform float audioAdvance;   ///< The music's advance: integrated tempo-weighted energy (never jumps, never runs
                              ///< backwards).
uniform float audioPhase;     ///< Rotation phase driven by the music (integrated, never jumps).
uniform float audioBeatPhase; ///< Position within the current beat, 0..1.
uniform float audioKick;      ///< Kick-drum envelope, 0..1 (fast attack, short decay).
uniform float audioSwell;     ///< Slow loudness envelope, 0..1 (seconds).
uniform float audioChromaHue; ///< Hue of the dominant pitch class (radians, unwrapped: continuous).
uniform float audioValence;   ///< Mood valence: 0 dark .. 1 bright.

uniform int       sidesP;        ///< kaleidoscope wedge count (0 -> 6; 4..9)
uniform float     tiltP;         ///< per-shard tilt amplitude (0 -> 1.0; 0.6..1.6)
uniform float     shardP;        ///< shard size (0 -> 1.0; 0.7..1.3)
uniform float     hueP;          ///< Hue knob (radians), usually the music's chroma hue plus a rolled offset.
uniform sampler2D tex0;          ///< The current photo.
uniform sampler2D tex1;          ///< The next photo (cross-faded in by interpolation).
uniform float     interpolation; ///< Cross-fade between the photos: 1 = tex0, 0 = tex1.

out vec3  vNormal;   ///< Surface normal (from the vertex stage).
out vec3  vWorldPos; ///< World position (from the vertex stage).
out vec3  vTint;
out float vFlash;

const float NumCubes = 4900.0;
const float NumRings = 8.0;
const float PerRing = NumCubes / NumRings;

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

/**  IMG-PALETTE (house standard): see Tools/SHADER_AUTHORING.md V8b.
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
    float i = attrA.w;

    if ( cubeBudget < 0.75 && mod( i, 2.0 ) > 0.5 )
    {
        gl_Position = vec4( 0.0, 0.0, -3.0, 1.0 );
        vNormal = vec3( 0.0, 0.0, 1.0 );
        vTint = vec3( 0.0 );
        vFlash = 0.0;
        return;
    }

    float sides_v = ( sidesP < 4 ) ? 6.0 : float( sidesP );
    float tilt_v = ( tiltP <= 0.01 ) ? 1.0 : tiltP;
    float shard_v = ( shardP <= 0.01 ) ? 1.0 : shardP;

    float ring = floor( i / PerRing );
    float idx_in_ring = mod( i, PerRing );
    float ring_r = 1.1 + ring * 0.78;

    // Mirror-kaleidoscope wedge placement (same construction as the fold used
    // in ParticleTunnelFlight.vert): index picks the wedge copy so population
    // is even, alternating copies mirrored for true kaleidoscope symmetry.
    float per_wedge = PerRing / sides_v;
    float wedge = 6.2831853 / sides_v;
    float copy = mod( floor( idx_in_ring / per_wedge ), sides_v );
    float frac = mod( idx_in_ring, per_wedge ) / per_wedge;
    float base_ang = frac * wedge * 0.5;
    float mirrored = ( mod( copy, 2.0 ) < 0.5 ) ? base_ang : ( wedge * 0.5 - base_ang );
    float spin = audioPhase * 0.35 + time * 0.015;
    float ang = mirrored + copy * wedge + spin;

    vec4 seeds = attrB;

    // Gentle dome: outer rings recede in depth, so the disc reads as a shallow
    // bowl rather than a flat wallpaper of mirrors.
    float dome_curve = ring * ring * 0.05;

    vec2 xy = vec2( cos( ang ), sin( ang ) ) * ring_r;

    // Per-shard tilt: phase-offset by the shard's own seed so the disc
    // shimmers rather than tilting in unison; kick briefly widens the swing
    // and adds a metallic flash.
    float tilt_phase = seeds.x * 6.2831853 + time * 0.4; // no beat-locked wobble (V7d)
    float kick_boost = 1.0 + audioKick * 0.8;
    float tilt_amt_x = sin( tilt_phase ) * ( 0.30 + 0.20 * seeds.y ) * tilt_v * kick_boost;
    float tilt_amt_y = cos( tilt_phase * 1.31 + seeds.z * 6.2831853 ) * ( 0.30 + 0.20 * seeds.w ) * tilt_v * kick_boost;

    mat3 rot_x = mat3( 1.0, 0.0, 0.0,
                       0.0, cos( tilt_amt_x ), -sin( tilt_amt_x ),
                       0.0, sin( tilt_amt_x ), cos( tilt_amt_x ) );
    mat3 rot_y = mat3( cos( tilt_amt_y ), 0.0, sin( tilt_amt_y ),
                       0.0, 1.0, 0.0,
                       -sin( tilt_amt_y ), 0.0, cos( tilt_amt_y ) );
    mat3 tilt_r = rot_y * rot_x;

    // Thin plate facing back toward the camera (camera sits near the world
    // origin looking down +Z; the disc is ahead of it, so the resting facet
    // normal points toward -Z).
    vec3 plate_size = vec3( 0.34, 0.34, 0.045 ) * shard_v;
    vec3 local_corner = tilt_r * ( attrA.xyz * plate_size );

    vec3 world_p = vec3( xy, 6.4 + ring * 0.55 + dome_curve );
    vec3 final_world = world_p + local_corner;

    vec3 vp = final_world;
    vp.x -= eyeOff;
    gl_Position = projM * vec4( vp.x, vp.y, -vp.z, 1.0 );
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;

    vec3 raw_normal = tilt_r * vec3( 0.0, 0.0, -1.0 );
    vNormal = raw_normal;
    vWorldPos = final_world;

    float flash = clamp( audioKick * ( 0.5 + 0.5 * seeds.x ) - 0.3, 0.0, 1.0 );
    vFlash = flash;

    vec3 tint = imgPalette( 0.5 + 0.5 * sin( ang * 2.0 + ring * 0.4 ) ) * 1.25;
    if ( hueP > 0.001 )
        tint = hueRot( tint, hueP );
    vTint = tint;
}
