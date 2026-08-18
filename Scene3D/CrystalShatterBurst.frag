#version 330 core
out vec4 fragColor;

in vec3  gNormal;
in vec3  gWorld;
in vec4  gCol;
in vec3  gBary;

/**
 * @file CrystalShatterBurst.frag
 * @brief Lighting for the exploding gem geode's tetrahedral shards: a
 * directional diffuse plus specular highlight per facet, with a bright
 * wireframe line traced along each triangle's edges via barycentric
 * coordinates.
 *
 * All of this scene's audio reactivity happens further upstream in
 * CrystalShatterBurst.geom, which fractures the incoming cube mesh into
 * shards and flings them outward on audioKick and audioSubBass, tumbles
 * them with audioAdvance, and tints them toward gold on audioKick; this
 * fragment stage only shades the already-audio-driven shard geometry it
 * receives via gNormal/gWorld/gCol/gBary.
 */

void main() {
    vec3 n = normalize(gNormal);
    vec3 lightDir = normalize(vec3(0.6, 0.9, -0.4));
    float diff = max(dot(n, lightDir), 0.0) * 0.7 + 0.3;

    // Specular highlight
    vec3 viewDir = normalize(-gWorld);
    vec3 refl = reflect(-lightDir, n);
    float spec = pow(max(dot(viewDir, refl), 0.0), 32.0);

    // Shard faceted wireframe edge line
    float minBary = min(min(gBary.x, gBary.y), gBary.z);
    float edgeGlow = smoothstep(0.08, 0.0, minBary);

    vec3 col = gCol.rgb * diff + spec * vec3(1.0, 1.0, 1.0);
    col += edgeGlow * gCol.rgb * 2.0;

    fragColor = vec4(col, 1.0);
}
