#version 330 core
out vec4 fragColor; ///< The pixel's colour (output).
/**
 * @file QuantumVortexField.frag
 * @brief QUANTUM VORTEX FIELD: a toroidal magnetosphere of filament streamlines -
 * thin ribbon fibres integrated through a poloidal/toroidal vector field
 * (tamed Lorenz perturbation), forming a feathered vortex ring.
 *   audioKick -> filament width + glow    audioSubBass -> ring radius
 *   audioSpectrum -> per-filament glow
 */

in vec4 vCol;    ///< Colour (from the vertex stage).
in vec3 vNormal; ///< Surface normal (from the vertex stage).
in vec3 vWorld;  ///< World position (from the vertex stage).

/** Entry point of this shader stage (the file description says what it draws). */
void main()
{
    vec3  n = normalize( vNormal );
    vec3  light_dir = normalize( vec3( 0.6, 0.8, -0.5 ) );
    float diff = max( dot( n, light_dir ), 0.0 ) * 0.4 + 0.6;

    // Specular highlight
    vec3  view_dir = normalize( -vWorld );
    vec3  refl = reflect( -light_dir, n );
    float spec = pow( max( dot( view_dir, refl ), 0.0 ), 16.0 );

    vec3 col = vCol.rgb * diff + spec * vec3( 1.0, 1.0, 1.0 );
    // Catalogue review: soft-knee exposure — hot audio compresses
    // instead of clipping the whole frame to white.
    vec3 cat_tone = ( col ) * 0.55;
    cat_tone /= 1.0 + 0.35 * max( cat_tone.r, max( cat_tone.g, cat_tone.b ) );
    cat_tone *= 3.20; // measured-dark lift (visual pass)
    fragColor = vec4( cat_tone, 1.0 );
}
