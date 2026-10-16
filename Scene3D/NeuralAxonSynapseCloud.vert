#version 330 core
/**
 * @file NeuralAxonSynapseCloud.vert
 * @brief 60,000 particles (geom="points") simulating the human cerebral cortex connectome.
 * Action potentials race along axonal pathways, igniting synaptic neurotransmitter
 * flares in an interactive 3D neural cloud.
 *
 * Three quarters of the particles build the clusters; the remaining quarter
 * become the FAR CORTICAL HAZE, laid out in frustum coordinates so the
 * picture is filled at every depth instead of only where the compact ball of
 * clusters happens to be. audioSwell lifts that haze, and audioSpectrum bands
 * it the same way it bands the clusters.
 */

layout( location = 0 ) in vec4 attrA; ///< w = point ID [0..59999]
layout( location = 1 ) in vec4 attrB; ///< seeds

uniform mat4  projM;      ///< Projection matrix.
uniform float eyeOff;     ///< Stereo eye offset (0 in mono).
uniform float time;       ///< Seconds since the program started (never reset; see sceneTime).
uniform vec2  resolution; ///< Size of the render target in pixels.

uniform float audioPhase;        ///< Rotation phase driven by the music (integrated, never jumps).
uniform float audioAdvance;      ///< The music's advance: integrated tempo-weighted energy (never jumps, never runs
                                 ///< backwards).
uniform float audioSwell;        ///< Slow loudness envelope, 0..1 (seconds).
uniform float audioLevel;        ///< Overall loudness, 0..1.
uniform float audioKick;         ///< Kick-drum envelope, 0..1 (fast attack, short decay).
uniform float audioCentroid;     ///< Spectral centroid (brightness of the sound), 0..1.
uniform float audioValence;      ///< Mood valence: 0 dark .. 1 bright.
uniform float audioSubBass;      ///< Sub-bass band level, 0..1.
uniform float audioBass;         ///< Bass band level, 0..1.
uniform float audioMid;          ///< Mid band level, 0..1.
uniform float audioHigh;         ///< High band level, 0..1.
uniform float audioFlux;         ///< Spectral flux (how fast the spectrum changes), 0..1.
uniform float audioChromaHue;    ///< Hue of the dominant pitch class (radians, unwrapped: continuous).
uniform float audioSpectrum[32]; ///< Spectrum bands, 0..1.

uniform float neuralP;
uniform float pulseP;
uniform float speedP; ///< Speed knob, 0..1.
uniform float hueP;   ///< Hue knob (radians), usually the music's chroma hue plus a rolled offset.

out vec4  vColor;
out float vSize;

/** Entry point of this shader stage (the file description says what it draws). */
void main()
{
    float neu = ( neuralP > 0.0 ) ? neuralP : 1.0;
    float pls = ( pulseP > 0.0 ) ? pulseP : 1.0;
    float spd = ( speedP > 0.0 ) ? speedP : 1.0;

    float id = attrA.w;
    vec3  seed = attrB.xyz;

    float t = time * 0.4 * spd + audioAdvance * 0.2;

    // The scene projection: 55 deg vertical FOV (see Scene3DShader::draw).
    const float TanY = 0.5206;
    float       aspect = ( resolution.y > 0.5 ) ? resolution.x / resolution.y : 1.7778;

    // ---- FAR CORTICAL HAZE --------------------------------------------
    // A quarter of the particles are pulled out of the clusters and laid out
    // in FRUSTUM coordinates -- x and y scaled by their own depth -- across a
    // wide range of distances.  The connectome itself is a compact ball
    // however big it is made, so on its own it left the frame's corners
    // black; this is the diffuse tissue it is embedded in.
    if ( attrB.w < 0.25 )
    {
        float hx = seed.x, hy = seed.y, hz = seed.z;
        float dz = 11.0 + hz * 82.0;
        float ph = hx * 6.2831853 + time * 0.06 + audioAdvance * 0.05;
        float open = 2.3; // 2.0 fits the frustum exactly; 2.3 covers the rig's roll
        vec3  hp = vec3( ( hx - 0.5 ) * open * dz * TanY * aspect + 1.5 * cos( ph ),
                         ( hy - 0.5 ) * open * dz * TanY + 1.5 * sin( ph * 0.79 ),
                         dz );

        vec3 hcol = mix( vec3( 0.0, 0.85, 1.0 ), vec3( 0.7, 0.15, 1.0 ), hy );
        hcol *= ( 0.55 + 0.95 * hx ) * ( 0.75 + 0.5 * audioSwell )
                * ( 1.0 + 0.5 * audioSpectrum[int( clamp( hy * 31.0, 0.0, 31.0 ) )] )
                * clamp( 1.0 - dz / 120.0, 0.0, 1.0 );
        vColor = vec4( min( hcol, vec3( 1.4 ) ), 1.0 );

        vec3 hv = hp;
        hv.x -= eyeOff;
        gl_Position = projM * vec4( hv.x, hv.y, -hv.z, 1.0 );
        gl_Position.x += eyeOff * 0.045 * gl_Position.w;
        if ( hv.z < 0.4 )
            gl_Position = vec4( 0.0, 0.0, -3.0, 1.0 );

        // A speck must stay legible at any distance -- below about 2.5 px an
        // additive sprite averages away to nothing and the far field reads
        // black again.
        gl_PointSize = clamp( 133.3 * ( 0.5 + 1.0 * hz ) / max( hv.z, 1.0 ), 2.6, 27.4 ); // sprite sweep 2026-08-22:
                                                                                          // measured luma 0.048, area
                                                                                          // x2.9
        vSize = gl_PointSize;
        return;
    }

    // Connectome cortical column coordinates.  Widened: at 2.2 units the ring
    // of clusters filled barely half the frame's width.
    float cluster_id = floor( id / 3000.0 ); // 20 cortical clusters
    float cluster_angle = cluster_id * ( 6.2831853 / 20.0 );
    vec3  cluster_center = vec3( cos( cluster_angle ), sin( cluster_angle ), sin( cluster_id * 1.5 ) ) * ( 3.1 * neu );

    // Dendritic branching within cluster
    float in_cluster_id = mod( id, 3000.0 );
    float branch_angle = in_cluster_id * 0.15 + t * 0.2;
    float branch_r = sqrt( in_cluster_id / 3000.0 ) * 2.1;

    vec3 local_pos = vec3(
        cos( branch_angle ) * branch_r,
        sin( branch_angle ) * branch_r,
        sin( in_cluster_id * 0.3 ) * 0.8 );

    // Axon action potential travel
    float action_prog = fract( t * 1.5 + in_cluster_id * 0.005 );
    float is_synapse = exp( -abs( action_prog - 0.5 ) * 20.0 );

    // Spectrum excitation per cluster
    int   spec_idx = int( clamp( cluster_id * 1.5, 0.0, 31.0 ) );
    float cluster_energy = audioSpectrum[spec_idx];

    // Global cognitive wave surge on kick
    float cognitive_surge = exp( -length( local_pos ) * 2.0 ) * audioKick * 1.5 * pls;

    vec3 pos = cluster_center + local_pos * ( 1.0 + 0.3 * audioBass );

    // 3D rotation of connectome
    float rot_y = t * 0.3 + audioPhase * 0.1;
    float cy = cos( rot_y ), sy = sin( rot_y );
    pos.xz = vec2( pos.x * cy - pos.z * sy, pos.x * sy + pos.z * cy );

    // Synapse neurotransmitter colors: Cyan (GABA), Violet (Glutamate), Golden-Amber (Dopamine)
    vec3 gaba_cyan = vec3( 0.0, 0.85, 1.0 );
    vec3 glu_violet = vec3( 0.7, 0.15, 1.0 );
    vec3 dopa_gold = vec3( 1.0, 0.85, 0.2 );

    vec3 syn_col = mix( gaba_cyan, glu_violet, sin( id * 0.1 ) * 0.5 + 0.5 );
    syn_col = mix( syn_col, dopa_gold, is_synapse );

    // Redesign after the white-out diagnosis: gain cuts alone can never fix
    // this scene — 60k sprites at up to 64 px meant >100x additive overdraw,
    // so the fix is AREA (quadratic) plus dim resting neurons, not brightness.
    // The resting floor was cut so far, though (0.10, on a 3 px sprite) that
    // five sixths of the connectome contributed essentially nothing and the
    // cloud measured near-black between its flashes.  Raised, with a hard cap
    // on the peak so a kick still cannot take the whole cloud to white.
    // Resting floor and firing peak BOTH raised, and the gap between them
    // widened: the previous pass balanced the exposure but left the whole cloud
    // inside a narrow band (measured luma 0.024, contrast 0.044). Contrast here
    // is the distance between a resting neuron and a firing one, so the peak is
    // lifted more than the floor. The hard cap still stops a kick taking the
    // whole connectome to white.
    float brightness = min( 0.30 + 1.35 * is_synapse + 0.55 * cluster_energy
                                + 1.0 * cognitive_surge,
                            3.0 );
    // Cap the TINTED colour, not the scalar that fed it.
    vColor = vec4( min( syn_col * brightness, vec3( 2.2 ) ), 1.0 );

    // Stereo 3D camera projection
    vec3 vp = pos;
    vp.z += 6.5;
    vp.x -= eyeOff;
    gl_Position = projM * vec4( vp.x, vp.y, -vp.z, 1.0 );
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;

    // Perspective point size — small on purpose: sprite AREA is what the
    // additive sum integrates, so radius is the real exposure control here.
    float base_size = ( 5.5 + 7.0 * is_synapse + 8.0 * cognitive_surge );
    gl_PointSize = clamp( base_size * ( 6.5 / max( vp.z, 1.0 ) ), 2.2, 22.0 );
    vSize = gl_PointSize;
}
