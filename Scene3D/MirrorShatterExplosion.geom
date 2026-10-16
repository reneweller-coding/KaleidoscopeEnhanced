#version 330 core
/**
 * @file MirrorShatterExplosion.geom
 * @brief Extrudes each of ~2,500 scatter seed points into a small triangular mirror shard, placed
 * with the same wedge-mirror kaleidoscope construction as ParticleTunnelFlight/WormholeMirrorWeave
 * (index-picked wedge, alternating copies mirrored -- real symmetry, not a fragment fold), and
 * blasts every shard outward from the centre right on the beat before settling back in, all from a
 * single stateless envelope driven by audioBeatPhase (no persistent state needed: audioBeatPhase
 * already re-triggers itself every beat on its own). Where MirrorShardKaleidoscope (geom="cubes")
 * is a static disc of tilting mirrors, this is a genuine explosion the geometry shader rebuilds
 * from scratch every single frame -- the shard triangles themselves don't exist as a mesh at all
 * until this stage emits them.
 *   audioBeatPhase -> the stateless explode/settle envelope (1 right on the beat, 0 just before the next)
 *   audioKick       -> extra outward kick + a bright white flash
 *   audioPhase      -> whole shatter slowly spins (integrated, jump-free)
 */

/// Layout qualifiers of this stage (work-group size, or the primitive in or out).
layout( points ) in;
/// Layout qualifiers of this stage (work-group size, or the primitive in or out).
layout( triangle_strip, max_vertices = 3 ) out;

in vec3  vObjPos[];
in vec4  vSeeds[];
in float vIndex[];

out vec3 gNormal;
out vec3 gWorld;
out vec3 gCol;

uniform mat4  projM;  ///< Projection matrix.
uniform float eyeOff; ///< Stereo eye offset (0 in mono).
uniform float time;   ///< Seconds since the program started (never reset; see sceneTime).

uniform float audioAdvance;   ///< The music's advance: integrated tempo-weighted energy (never jumps, never runs
                              ///< backwards).
uniform float audioPhase;     ///< Rotation phase driven by the music (integrated, never jumps).
uniform float audioBeatPhase; ///< Position within the current beat, 0..1.
uniform float audioKick;      ///< Kick-drum envelope, 0..1 (fast attack, short decay).
uniform float audioChromaHue; ///< Hue of the dominant pitch class (radians, unwrapped: continuous).
uniform float audioValence;   ///< Mood valence: 0 dark .. 1 bright.

uniform int       sidesP;        ///< kaleidoscope wedge count (0 -> 6; 4..9)
uniform float     explodeP;      ///< outward blast distance (0 -> 3.2; 2.2..4.5)
uniform float     shardP;        ///< shard size (0 -> 1.0; 0.6..1.5)
uniform float     camDistP;      ///< Camera distance knob, 0..1.
uniform float     hueP;          ///< Hue knob (radians), usually the music's chroma hue plus a rolled offset.
uniform sampler2D tex0;          ///< The current photo.
uniform sampler2D tex1;          ///< The next photo (cross-faded in by interpolation).
uniform float     interpolation; ///< Cross-fade between the photos: 1 = tex0, 0 = tex1.

const float NumPoints = 2500.0;

/// @brief The photo at a coordinate: the cross-fade of tex0 and tex1.
vec3 img( vec2 uv )
{
    return ( interpolation * texture( tex0, uv ) + ( 1.0 - interpolation ) * texture( tex1, uv ) ).rgb;
}

/// @brief The house palette: a colour of the photo on an arc that turns with the music's hue.
vec3 imgPalette( float t )
{
    float ang = audioChromaHue + audioAdvance * 0.04 + t * 6.2831853;
    float rad = 0.16 + 0.08 * sin( audioAdvance * 0.013 );
    vec3  pc = img( clamp( vec2( 0.5 ) + rad * vec2( cos( ang ), sin( ang ) ), 0.0, 1.0 ) );
    float pg = dot( pc, vec3( 0.333 ) );
    return mix( vec3( pg ), pc, 0.55 + 0.45 * audioValence );
}

/// @brief Rotates a colour's hue by an angle (about the grey axis).
vec3 hueRot( vec3 c, float a )
{
    vec3  k = vec3( 0.57735026919 );
    float cs = cos( a ), sn = sin( a );
    return c * cs + cross( k, c ) * sn + k * dot( k, c ) * ( 1.0 - cs );
}

void emitVert( vec3 worldPos, vec3 norm, vec3 col, vec3 camPos, vec3 uu, vec3 vv, vec3 ww )
{
    vec3 rel_p = worldPos - camPos;
    vec3 view_p = vec3( dot( rel_p, uu ), dot( rel_p, vv ), dot( rel_p, ww ) );
    view_p.x -= eyeOff;
    gl_Position = projM * vec4( view_p.x, view_p.y, -view_p.z, 1.0 );
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;
    gNormal = norm;
    gWorld = worldPos;
    gCol = col;
    EmitVertex();
}

/// @brief Entry point of this shader stage (the file description says what it draws).
void main()
{
    float idx = vIndex[0];
    if ( idx > NumPoints )
        return;

    vec4  seeds = vSeeds[0];
    float sides_v = ( sidesP < 4 ) ? 6.0 : float( sidesP );
    float explode_v = ( explodeP <= 0.01 ) ? 3.2 : explodeP;
    float shard_v = ( shardP <= 0.01 ) ? 1.0 : shardP;
    float c_dst = ( camDistP > 0.0 ) ? camDistP : 1.0;

    // Mirror-kaleidoscope wedge placement: same construction as
    // ParticleTunnelFlight.vert -- index picks the wedge copy (even
    // population), alternating copies mirrored for true symmetry.
    float per_wedge = NumPoints / sides_v;
    float wedge = 6.2831853 / sides_v;
    float copy = mod( floor( idx / per_wedge ), sides_v );
    float frac = mod( idx, per_wedge ) / per_wedge;
    float base_ang = frac * wedge * 0.5;
    float mirrored = ( mod( copy, 2.0 ) < 0.5 ) ? base_ang : ( wedge * 0.5 - base_ang );
    float spin = audioPhase * 0.4 + time * 0.015;
    float ang = mirrored + copy * wedge + spin;

    // Elevation so the shatter reads as a volumetric burst, not a flat disc.
    float elev = ( seeds.z - 0.5 ) * 1.6;

    // Stateless explode/settle envelope: audioBeatPhase already re-triggers
    // itself every beat, so no persistent "time since last beat" is needed.
    float burst = pow( clamp( 1.0 - audioBeatPhase, 0.0, 1.0 ), 2.2 );
    float shell_r = 1.05 + 1.05 * seeds.x;
    // Settled (burst=0) still reads as a real shattered mass, not a
    // near-invisible dot waiting for the next beat -- only the ADDED
    // travel between beats is scaled by explode_v.
    float rad = shell_r * ( 1.0 + 0.45 * explode_v * burst ) + audioKick * 0.4 * burst;

    vec3 dir_flat = normalize( vec3( cos( ang ), 0.0, sin( ang ) ) );
    vec3 base_pos = dir_flat * rad + vec3( 0.0, elev * ( 0.3 + 0.7 * burst ), 0.0 );

    // Small triangular shard, loosely facing outward with a per-shard tilt.
    float size = ( 0.10 + 0.10 * seeds.w ) * shard_v;
    vec3  outward = normalize( base_pos + vec3( 0.0, 0.001, 0.0 ) );
    vec3  tilt_axis = normalize( vec3( seeds.y - 0.5, seeds.z - 0.5, seeds.x - 0.5 ) + 1e-4 );
    vec3  side1 = normalize( cross( outward, tilt_axis ) + 1e-4 );
    vec3  side2 = cross( outward, side1 );

    vec3 p0 = base_pos + outward * size * 0.5;
    vec3 p1 = base_pos - side1 * size * 0.5 - outward * size * 0.2;
    vec3 p2 = base_pos + side1 * size * 0.5 - outward * size * 0.2;
    vec3 norm = normalize( cross( p1 - p0, p2 - p0 ) );

    // Camera: fixed-ish, gently orbiting, looking at the burst centre.
    float cam_angle = time * 0.06 + audioAdvance * 0.02;
    float cam_dist = 4.4 * c_dst;
    vec3  camPos = vec3( sin( cam_angle ) * cam_dist, 0.6 * sin( time * 0.1 ), cos( cam_angle ) * cam_dist );
    vec3  look_target = vec3( 0.0 );
    vec3  ww = normalize( look_target - camPos );
    vec3  uu = normalize( cross( ww, vec3( 0.0, 1.0, 0.0 ) ) );
    vec3  vv = cross( uu, ww );

    vec3 col = imgPalette( 0.5 + 0.5 * sin( ang * sides_v * 0.5 + elev ) ) * 1.6;
    col = mix( col, vec3( 1.0, 0.97, 0.85 ), clamp( audioKick * burst * 0.5, 0.0, 0.55 ) );
    if ( hueP > 0.001 )
        col = hueRot( col, hueP );

    emitVert( p0, norm, col, camPos, uu, vv, ww );
    emitVert( p1, norm, col, camPos, uu, vv, ww );
    emitVert( p2, norm, col, camPos, uu, vv, ww );
    EndPrimitive();
}
