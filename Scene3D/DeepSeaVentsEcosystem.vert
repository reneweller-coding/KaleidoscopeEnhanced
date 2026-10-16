#version 330 core
/*****************************************************************************\
 *                              DeepSeaVentsEcosystem.vert
\*****************************************************************************/
/*! @file
 *
 *  @brief
 *  Vertex stage companion to DeepSeaVentsEcosystem.frag -- see that file's header for this scene's description.
 *
 *  Audio Reactivity:
 *    audioKick      -> plume lift + organism brightness (also in the generator)
 *    audioAdvance   -> plume convection phase (pre-integrated, in the generator)
 *    audioPhase     -> carrier for the turbulent shimmer below (pre-integrated)
 *    audioLowMid    -> the vent's HEAT: 150-500 Hz warmth swells the smoker
 *                      column outward, a thin mix draws it back to a thread
 *    audioRoughness -> dissonance shakes the plume into turbulent eddies;
 *                      consonant harmony lets it rise in laminar ribbons
 *    audioMode      -> (fragment stage) abyssal-cold vs sulfur-warm water
 *    audioChromaHue / audioValence -> (fragment stage) photo palette + saturation
 *
 *  @author René Weller
 */
// attrA.xyz = world pos (baked by the compute generator), attrA.w = species
// attrB.w   = bioGlow (Scene3DShader.cpp GEOM_INDIRECT, 8-float vertex layout)
in vec4 attrA; ///< Vertex attribute A (meaning per geometry kind, see the stage's header; e.g. position or u/v and an
               ///< index).
in vec4 attrB; ///< Vertex attribute B (meaning per geometry kind; e.g. normal or per-element seeds).

uniform mat4  projM;          ///< Projection matrix.
uniform float eyeOff;         ///< Stereo eye offset (0 in mono).
uniform float time;           ///< Seconds since the program started (never reset; see sceneTime).
uniform float audioKick;      ///< Kick-drum envelope, 0..1 (fast attack, short decay).
uniform float audioPhase;     ///< pre-integrated motion accumulator
uniform float audioLowMid;    ///< 150-500 Hz harmonic warmth = vent heat
uniform float audioRoughness; ///< sensory dissonance = plume turbulence

out vec3  vPos;     ///< Position (from the vertex stage).
out float vSpecies; ///< Species (from the vertex stage).
out float vBioGlow; ///< Bio glow (from the vertex stage).

/** Entry point of this shader stage (the file description says what it draws). */
void main()
{
    vec3 world_p = attrA.xyz;

    // The vent's HEAT: harmonic warmth in the low mids drives the convection,
    // billowing the smoker column outward; a thin, hollow mix lets it collapse
    // back toward a narrow thread rising off the chimney.
    world_p.xz *= 1.0 + 0.35 * clamp( audioLowMid, 0.0, 1.0 );

    // Sensory dissonance shakes the plume into turbulent eddies -- consonant
    // harmony lets the streamers rise in smooth laminar ribbons.  The shimmer
    // rides audioPhase (pre-integrated), never `time` scaled by audio.
    // (The noise is seeded from the UNMODULATED generator position, so the
    // heat bloom above cannot drag the eddy pattern around underneath it.)
    vec3  seed_p = attrA.xyz;
    float turb = clamp( audioRoughness, 0.0, 1.0 ) * 0.25;
    world_p += vec3( sin( audioPhase * 2.3 + seed_p.y * 3.1 + seed_p.x * 1.7 ),
                     sin( audioPhase * 1.7 + seed_p.z * 2.6 ),
                     cos( audioPhase * 2.0 + seed_p.y * 2.4 + seed_p.z * 1.3 ) )
               * turb;

    vPos = world_p;
    vSpecies = attrA.w;
    vBioGlow = attrB.w;

    // Stereoscopic 3D camera projection
    vec3 vp = world_p;
    vp.z += 5.2;
    vp.x -= eyeOff;

    gl_Position = projM * vec4( vp.x, vp.y, -vp.z, 1.0 );
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;
}
