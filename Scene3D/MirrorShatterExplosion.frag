#version 330 core
out vec4 fragColor;

in vec3 gNormal;
in vec3 gWorld;
in vec3 gCol;

/**
 * @file MirrorShatterExplosion.frag
 * @brief Shades one triangular mirror shard from MirrorShatterExplosion.geom: a lit glinting
 * facet (fixed-direction diffuse + tight specular) with a Fresnel rim so shards read as sharp
 * glass/mirror fragments rather than flat matte confetti. All placement, colour and the beat-
 * synced explosion are computed in the geometry stage and arrive pre-baked in gCol.
 */

void main() {
    vec3 n = normalize(gNormal);
    vec3 viewDir = normalize(-gWorld);
    if (dot(n, viewDir) < 0.0) n = -n;

    vec3 lightDir = normalize(vec3(0.5, 0.8, -0.5));
    float diff = max(dot(n, lightDir), 0.0) * 0.6 + 0.4;

    vec3 refl = reflect(-lightDir, n);
    float spec = pow(max(dot(viewDir, refl), 0.0), 40.0);

    float fres = pow(1.0 - clamp(dot(n, viewDir), 0.0, 1.0), 3.0);

    vec3 col = gCol * diff;
    col += gCol * spec * 1.1;
    col += gCol * fres * 0.8;

    vec3 _catTone = clamp(col, 0.0, 1.0) * 0.9;
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(_catTone, 1.0);
}
