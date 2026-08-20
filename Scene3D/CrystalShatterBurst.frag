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
 * fragment stage shades the already-audio-driven shard geometry it
 * receives via gNormal/gWorld/gCol/gBary, and cuts the facet highlight and
 * wireframe to the timbre's own edge with audioSharpness.
 *
 * Audio Reactivity:
 *   audioSharpness -> facet specular tightness + wireframe edge crispness
 *                     (dull material = soft broad sheen and fat gem edges,
 *                     cymbal-bright = hard glint on a hairline wireframe)
 *   (audioKick / audioSubBass / audioAdvance / audioSnare / audioBuildUp all
 *    act upstream in CrystalShatterBurst.geom -- see that file.)
 */

uniform float audioSharpness;   // Zwicker HF loudness: 0 = dull, 1 = harsh-bright

void main() {
    vec3 n = normalize(gNormal);
    vec3 lightDir = normalize(vec3(0.6, 0.9, -0.4));
    float diff = max(dot(n, lightDir), 0.0) * 0.7 + 0.3;

    // Specular highlight — sharpness decides whether the gem answers with a
    // broad dull sheen or a hard cut-glass glint (energy stays balanced: the
    // wider highlight is dimmed by the same amount it spreads).
    float shrp = clamp(audioSharpness, 0.0, 1.0);
    vec3 viewDir = normalize(-gWorld);
    vec3 refl = reflect(-lightDir, n);
    float spec = pow(max(dot(viewDir, refl), 0.0), mix(12.0, 64.0, shrp))
               * mix(0.55, 1.0, shrp);

    // Shard faceted wireframe edge line — bright timbres draw it down to a
    // hairline, dull ones leave the facet borders soft.  Never wider than the
    // original 0.08, so the wireframe cannot flood the frame.
    float minBary = min(min(gBary.x, gBary.y), gBary.z);
    float edgeGlow = smoothstep(mix(0.08, 0.03, shrp), 0.0, minBary);

    vec3 col = gCol.rgb * diff + spec * vec3(1.0, 1.0, 1.0);
    col += edgeGlow * gCol.rgb * 2.0;

    fragColor = vec4(col, 1.0);
}
