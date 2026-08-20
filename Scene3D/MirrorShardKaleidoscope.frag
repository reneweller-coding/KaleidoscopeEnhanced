#version 330 core
out vec4 fragColor;

in vec3  vNormal;
in vec3  vWorldPos;
in vec3  vTint;
in float vFlash;

/**
 * @file MirrorShardKaleidoscope.frag
 * @brief Lights each mirror shard from MirrorShardKaleidoscope.vert as a real reflective facet:
 * the view ray from the (near-origin) camera to the shard is reflected off its tilted normal and
 * used to sample the current slideshow photo as a wrapped equirectangular environment -- the
 * shard genuinely shows a different sliver of the picture depending on its current tilt, the same
 * trick as Scene3D/ChromeFlow.frag's chrome reflections. A Fresnel term brightens the mirror at
 * grazing angles, a cool metallic base tint keeps facets readable even when the reflection swings
 * away from the photo, and a kick-driven flash briefly overexposes toward white.
 */

uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

vec3 img(vec2 uv) {
    return (interpolation * texture(tex0, uv) + (1.0 - interpolation) * texture(tex1, uv)).rgb;
}

void main() {
    vec3 n  = normalize(vNormal);
    vec3 rd = normalize(vWorldPos);   // camera sits near the world origin

    vec3 R = reflect(rd, n);
    vec2 envUV = vec2(atan(R.x, R.z) / 6.2831853 + 0.5,
                       clamp(0.5 - R.y * 0.5, 0.02, 0.98));
    vec3 envPhoto = img(envUV);

    float fres = pow(1.0 - clamp(dot(-rd, n), 0.0, 1.0), 3.0);

    vec3 lightDir = normalize(vec3(0.5, 0.8, -0.3));
    float diff = max(dot(n, lightDir), 0.0) * 0.5 + 0.5;
    vec3 refl = reflect(-lightDir, n);
    float spec = pow(max(dot(-rd, refl), 0.0), 40.0);

    vec3 metal = mix(vec3(0.22, 0.25, 0.32), vTint * 0.9, 0.5);
    vec3 col = metal * diff;
    col = mix(col, envPhoto * 1.7, 0.6 + 0.35 * fres);
    col += spec * vec3(1.0, 1.0, 1.0) * 1.1;
    col += vTint * fres * 0.6;

    col = mix(col, vec3(1.0, 0.96, 0.85), vFlash * 0.7);

    vec3 _catTone = clamp(col, 0.0, 1.0) * 1.05;
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(_catTone, 1.0);
}
