#version 330 core
/**
 * @file LaserSpireArray.geom
 * @brief Geometry stage companion to LaserSpireArray.frag -- see that file's header for
 * this scene's description.
 *
 * Audio Reactivity:
 *   audioSpectrum -> per-spire height (each spire reads its own FFT band)
 *   audioKick     -> height punch on a subset of spires + gold tint
 *   audioAdvance  -> ring rotation + camera orbit (pre-integrated, jump-free)
 *   audioBuildUp  -> rising EDM tension stretches the sky beams upward, the
 *                    classic riser, and they fall back after the drop
 *   audioTrebRel  -> mix-independent treble punch thickens the laser columns
 *   audioUpperMid -> (fragment stage) metallic chrome glint on the facets
 */
// LaserSpireArray.geom — Extrude point seeds into 3D hexagonal crystalline spires
// with skyward laser beams and pulsating energy rings.
layout( points ) in;
/// Layout qualifiers of this stage (work-group size, or the primitive in or out).
layout( triangle_strip, max_vertices = 24 ) out;

in vec3  vObjPos[];
in vec4  vSeeds[];
in float vSpireIndex[];

out vec3  gNormal;
out vec3  gWorld;
out vec4  gCol;
out float gBeam;

uniform mat4  projM;  ///< Projection matrix.
uniform float eyeOff; ///< Stereo eye offset (0 in mono).
uniform float time;   ///< Seconds since the program started (never reset; see sceneTime).

uniform float audioAdvance;      ///< The music's advance: integrated tempo-weighted energy (never jumps, never runs
                                 ///< backwards).
uniform float audioKick;         ///< Kick-drum envelope, 0..1 (fast attack, short decay).
uniform float audioSubBass;      ///< Sub-bass band level, 0..1.
uniform float audioHigh;         ///< High band level, 0..1.
uniform float audioSpectrum[32]; ///< Spectrum bands, 0..1.
uniform float audioBuildUp;      ///< EDM tension rising toward the drop
uniform float audioTrebRel;      ///< 0..2.5, treble "as loud as usual right now"

uniform float heightP; ///< Height knob, 0..1.
uniform float beamP;
uniform float camDistP; ///< Camera distance knob, 0..1.
uniform float hueP;     ///< Hue knob (radians), usually the music's chroma hue plus a rolled offset.

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

/**  Emits one vertex: the world position in the eye's clip space, with its varyings.
 *
 * @param worldPos  World position. (in)
 * @param norm      Normal. (in)
 * @param col       Colour. (in)
 * @param isBeam    1 for a beam vertex, 0 for the structure. (in)
 * @param camPos    Camera position. (in)
 * @param uu        Camera right axis. (in)
 * @param vv        Camera up axis. (in)
 * @param ww        Camera forward axis. (in)
 **/
void emitVert( vec3 worldPos, vec3 norm, vec3 col, float isBeam, vec3 camPos, vec3 uu, vec3 vv, vec3 ww )
{
    vec3 rel_p = worldPos - camPos;
    vec3 view_p = vec3( dot( rel_p, uu ), dot( rel_p, vv ), dot( rel_p, ww ) );
    view_p.x -= eyeOff;

    gl_Position = projM * vec4( view_p.x, view_p.y, -view_p.z, 1.0 );
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;

    gNormal = norm;
    gWorld = worldPos;
    gCol = vec4( col, 1.0 );
    gBeam = isBeam;
    EmitVertex();
}

/** Entry point of this shader stage (the file description says what it draws). */
void main()
{
    float idx = vSpireIndex[0];
    vec4  seeds = vSeeds[0];

    // Select a subset of the 60,000 points (e.g. 1,200 spires) to keep high performance & sharp detail
    if ( idx > 1200.0 )
        return;

    float hgt = ( heightP > 0.0 ) ? heightP : 1.0;
    float bm = ( beamP > 0.0 ) ? beamP : 1.0;
    float c_dst = ( camDistP > 0.0 ) ? camDistP : 1.0;
    float hue = ( hueP > 0.0 ) ? hueP : 0.0;

    // Spire grid placement in concentric rings
    float r = 2.0 + seeds.x * 26.0;
    float a = seeds.y * 6.2831853 + time * ( 0.05 + seeds.z * 0.05 ) + audioAdvance * 0.05;
    vec3  base_pos = vec3( cos( a ) * r, -4.0, sin( a ) * r );

    // Spectrum height modulation
    int   band = int( clamp( seeds.x * 31.0, 0.0, 31.0 ) );
    float spire_h = ( 3.0 + 8.0 * pow( seeds.w, 1.5 ) + audioSpectrum[band] * 12.0 ) * hgt;
    spire_h += audioKick * 3.0 * step( 0.7, seeds.z );

    float spire_radius = 0.35 * ( 0.7 + 0.3 * seeds.z );

    // Camera
    float cam_angle = time * 0.15 + audioAdvance * 0.05;
    float cam_dist = ( 30.0 * c_dst );
    vec3  camPos = vec3( sin( cam_angle ) * cam_dist, 12.0 + 4.0 * sin( time * 0.2 ), cos( cam_angle ) * cam_dist );
    vec3  look_target = vec3( 0.0, 2.0, 0.0 );

    vec3 ww = normalize( look_target - camPos );
    vec3 uu = normalize( cross( ww, vec3( 0.0, 1.0, 0.0 ) ) );
    vec3 vv = cross( uu, ww );

    // Base color
    vec3 spire_col = mix( vec3( 0.0, 0.9, 1.0 ), vec3( 1.0, 0.1, 0.7 ), seeds.x );
    spire_col = mix( spire_col, vec3( 1.0, 0.9, 0.3 ), audioKick * 0.8 );
    if ( hue > 0.001 )
        spire_col = hueRot( spire_col, hue );

    // Generate 4-sided spire pillar triangle strip (8 vertices)
    const int Sides = 4;
    for ( int s = 0; s <= Sides; ++s )
    {
        float angle = float( s ) * ( 6.2831853 / float( Sides ) );
        vec3  offset = vec3( cos( angle ), 0.0, sin( angle ) ) * spire_radius;
        vec3  norm = normalize( vec3( cos( angle ), 0.1, sin( angle ) ) );

        vec3 b_vert = base_pos + offset;
        vec3 t_vert = base_pos + offset * 0.4 + vec3( 0.0, spire_h, 0.0 );

        emitVert( b_vert, norm, spire_col * 0.6, 0.0, camPos, uu, vv, ww );
        emitVert( t_vert, norm, spire_col * 1.5, 0.0, camPos, uu, vv, ww );
    }
    EndPrimitive();

    // Laser sky beam extending from apex.  An EDM build-up is the RISER: the
    // beams stretch further and further into the sky as the tension climbs,
    // then settle back once the drop releases it.  (The beam fades to black
    // along its length, so the extra reach stays dim -- no exposure blow-out.)
    if ( seeds.z > 0.5 )
    {
        float riser = 1.0 + 0.40 * clamp( audioBuildUp, 0.0, 1.0 );

        // Treble punch relative to this mix's own average thickens the columns
        // — a hi-hat-heavy bar fattens the lasers regardless of master level.
        float treb_punch = clamp( audioTrebRel - 1.0, -0.8, 1.0 );
        float beam_w = 0.12 * ( 1.0 + 0.45 * treb_punch );

        vec3 tip_pos = base_pos + vec3( 0.0, spire_h, 0.0 );
        vec3 beam_end = tip_pos + vec3( 0.0, 35.0 * bm * riser, 0.0 );
        vec3 beam_col = mix( vec3( 0.2, 1.0, 0.8 ), vec3( 1.0, 0.3, 0.9 ), seeds.w );

        vec3 b_off1 = vec3( beam_w, 0.0, 0.0 );
        vec3 b_off2 = vec3( -beam_w, 0.0, 0.0 );

        emitVert( tip_pos + b_off1, vec3( 0.0, 1.0, 0.0 ), beam_col * 2.5, 1.0, camPos, uu, vv, ww );
        emitVert( tip_pos + b_off2, vec3( 0.0, 1.0, 0.0 ), beam_col * 2.5, 1.0, camPos, uu, vv, ww );
        emitVert( beam_end + b_off1, vec3( 0.0, 1.0, 0.0 ), beam_col * 0.0, 1.0, camPos, uu, vv, ww );
        emitVert( beam_end + b_off2, vec3( 0.0, 1.0, 0.0 ), beam_col * 0.0, 1.0, camPos, uu, vv, ww );
        EndPrimitive();
    }
}
