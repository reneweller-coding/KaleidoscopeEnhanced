#version 330 core
out vec4 fragColor;
/**
 * @file QuantumVortexField.frag
 * @brief QUANTUM VORTEX FIELD: a toroidal magnetosphere of filament streamlines -
 * thin ribbon fibres integrated through a poloidal/toroidal vector field
 * (tamed Lorenz perturbation), forming a feathered vortex ring.
 *   audioKick -> filament width + glow    audioSubBass -> ring radius
 *   audioSpectrum -> per-filament glow
 */

in vec4 vCol;
in vec3 vNormal;
in vec3 vWorld;

void main() {
    vec3 n = normalize(vNormal);
    vec3 lightDir = normalize(vec3(0.6, 0.8, -0.5));
    float diff = max(dot(n, lightDir), 0.0) * 0.4 + 0.6;

    // Specular highlight
    vec3 viewDir = normalize(-vWorld);
    vec3 refl = reflect(-lightDir, n);
    float spec = pow(max(dot(viewDir, refl), 0.0), 16.0);

    vec3 col = vCol.rgb * diff + spec * vec3(1.0, 1.0, 1.0);
    // Catalogue review: soft-knee exposure — hot audio compresses
    // instead of clipping the whole frame to white.
    vec3 _catTone = (col) * 0.55;
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    _catTone *= 3.20;   // measured-dark lift (visual pass)
    fragColor = vec4(_catTone, 1.0);
}
