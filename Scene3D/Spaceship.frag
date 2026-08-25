#version 330 core
out vec4 fragColor;
/**
 * @file Spaceship.frag
 * @brief GEOM="MESH" SHOWCASE: a real loaded 3D model (config attribute
 * model=, see Source/MeshImport.h) tumbling in space, lit from its own
 * baked material and dressed with engine-glow/shield-flicker accents pulled
 * from the current background image's palette (the same imgPalette() trick
 * classic Scene3D scenes like DysonSphereCore use, so a loaded mesh reads as
 * part of the same visual family instead of a foreign inserted object).
 *   audioAdvance -> tumble speed
 *   audioKick    -> vertical bob (vertex stage) + shield-flicker flashes
 *   audioSwell   -> key light / rim glow intensity
 *   audioChromaHue-> palette follows the musical key
 *
 * Per-activation variety:
 *   hueP float palette offset (0..6.28)
 */

uniform sampler2DArray texMeshMaterial;   // layer 0 = baseColor+opacity, layer 1 = (unused,roughness,metallic)
uniform int texMeshMaterialLayers;        // 1 = base color only, 2 = + metallic-roughness

uniform float time;
uniform float audioAdvance;
uniform float audioKick;
uniform float audioSwell;
uniform float audioChromaHue;

uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float hueP;

in vec2 vUV;
in vec3 vNormal;
in vec3 vPos;

vec3 img(vec2 uv) {
    return (interpolation * texture(tex0, uv) + (1.0 - interpolation) * texture(tex1, uv)).rgb;
}

vec3 imgPalette(float t)
{
    float ang = audioChromaHue + audioAdvance * 0.04 + t * 6.2831853;
    float rad = 0.16 + 0.08 * sin(audioAdvance * 0.013);
    return img(clamp(vec2(0.5) + rad * vec2(cos(ang), sin(ang)), 0.0, 1.0));
}

vec3 hueRot(vec3 c, float a) {
    vec3 k = vec3(0.57735026919);
    float cs = cos(a), sn = sin(a);
    return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
}

void main()
{
    float hue = (hueP > 0.01 ? hueP : 0.0);

    vec4 base = texture(texMeshMaterial, vec3(vUV, 0.0));
    // This pass draws opaque/depth-tested (see Scene3DShader::draw()'s
    // GEOM_MESH branch) with GL_BLEND off, so a partial alpha can't fade --
    // treat the opacity map as a cutout mask instead (hull grating, thin
    // antenna mesh) rather than silently ignoring it.
    if (base.a < 0.1) discard;
    float roughness = 0.6, metallic = 0.1;
    if (texMeshMaterialLayers >= 2)
    {
        vec4 mr = texture(texMeshMaterial, vec3(vUV, 1.0));
        roughness = mr.g;
        metallic  = mr.b;
    }

    vec3 n = normalize(vNormal);
    vec3 viewDir = normalize(-vPos);

    // A single distant key light plus a soft fill, standing in for the
    // system's star -- there is no scene-wide light rig to hook into here,
    // every Scene3D scene fakes its own.
    vec3 lightDir = normalize(vec3(0.4, 0.6, -0.5));
    float diff = max(dot(n, lightDir), 0.0);
    float fill = 0.5 + 0.5 * dot(n, vec3(0.0, 1.0, 0.0));

    vec3 halfV = normalize(lightDir + viewDir);
    float spec = pow(max(dot(n, halfV), 0.0), mix(64.0, 4.0, roughness));
    vec3 specColor = mix(vec3(1.0), base.rgb, metallic);

    // The hull's own albedo is a very dark "gunmetal" (near-black by
    // design, see this ship's spec) -- measured directly against the
    // decoded texture, its lit contribution alone stays under ~0.15 even at
    // full diffuse. A generous ambient/fill floor is what makes the shape
    // and panel-line detail actually read as a ship instead of a silhouette;
    // an earlier, dimmer version of this line combined with a much stronger
    // rim term (below) let that rim term visually swallow the whole hull in
    // a flat tint, since there was almost nothing underneath it to compete
    // with.
    vec3 col = base.rgb * (0.55 + diff * (1.4 + 0.6 * audioSwell) + fill * 0.35);
    col += specColor * spec * (0.6 + 0.8 * (1.0 - roughness));

    // Rim glow + shield-flicker: a fresnel term dressed in the current
    // image's palette instead of a fixed color, tying the ship into
    // whatever mood the rest of the show is in. Kept deliberately modest --
    // an edge accent, not a wash across the whole hull.
    float fresnel = pow(1.0 - max(dot(n, viewDir), 0.0), 4.0);
    vec3 rimColor = imgPalette(0.75 + 0.1 * audioKick);
    col += rimColor * fresnel * (0.15 + 0.35 * audioSwell + 0.5 * audioKick);

    if (hue > 0.001) col = hueRot(col, 0.2 * sin(hue));

    // Fade into the black of space with distance from the camera.
    float dist = length(vPos);
    float fogAmt = clamp((dist - 90.0) / 140.0, 0.0, 1.0);
    col = mix(col, vec3(0.0), fogAmt);

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
