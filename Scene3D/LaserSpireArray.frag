#version 330 core
out vec4 fragColor;

/**
 * @file LaserSpireArray.frag
 * @brief Shades the crystalline laser-spire array extruded by
 * LaserSpireArray.geom: lit hexagonal pillar facets, or (where gBeam
 * marks a beam quad) a pure emissive skyward laser column.
 *
 * All colour, including the audioSpectrum-driven per-spire height/hue
 * and the audioKick pulse baked into gCol by the geometry stage, arrives
 * pre-computed; this fragment stage only adds a fixed-direction diffuse
 * and specular term to the pillar facets and adds a height-based energy
 * glow (brighter with world-space Y) on top, while beam quads are
 * written out unlit.
 */

in vec3  gNormal;
in vec3  gWorld;
in vec4  gCol;
in float gBeam;

void main() {
    if (gBeam > 0.5) {
        // Laser beam emission
        fragColor = gCol;
        return;
    }

    vec3 n = normalize(gNormal);
    vec3 lightDir = normalize(vec3(0.5, 0.8, -0.6));
    float diff = max(dot(n, lightDir), 0.0) * 0.7 + 0.3;

    // Specular highlight
    vec3 viewDir = normalize(-gWorld);
    vec3 refl = reflect(-lightDir, n);
    float spec = pow(max(dot(viewDir, refl), 0.0), 16.0);

    vec3 col = gCol.rgb * diff + spec * vec3(1.0, 1.0, 1.0);

    // Height energy glow
    col += gCol.rgb * smoothstep(-4.0, 15.0, gWorld.y) * 0.8;

    fragColor = vec4(col, 1.0);
}
