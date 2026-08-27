#version 330 core
out vec4 fragColor;

/**
 * @file Dissolve.frag
 * @brief The object as a cloud of its own surface: every triangle is a splat
 * (the placement is in the geometry stage), drifting out on a curl field and
 * drawn back in. The silhouette survives as density, not as shape.
 *
 * Each splat keeps the colour its triangle had, so the cloud is not a uniform
 * dust -- it carries the object's own markings, and a hull's panels or a
 * statue's shadows stay faintly readable in the drift. That is what keeps the
 * object identifiable while it is scattered, and it is the reason to build the
 * particles from the mesh rather than from a random distribution.
 *
 *   audioSwell -> how far the cloud opens
 *   audioDrop  -> it blows out
 *   audioKick  -> a pulse through the cloud
 *   audioAdvance -> the curl field turns
 *
 * Per-instance: sizeP, looseP (travel), grainP (splat size), tintP.
 * Per-activation variety: hueP float palette offset (0..6.28).
 */

uniform sampler2DArray texMeshMaterial;
uniform int texMeshMaterialLayers;

uniform float time;
uniform float audioKick;
uniform float audioSwell;
uniform float audioAdvance;

uniform float hueP;
uniform float tintP;

in vec2  vUV;
in vec2  vQuad;
in vec3  vNormal;
in vec3  vPos;
in float vBg;
in float vLoose;

vec3 hueRot(vec3 c, float a)
{
    const vec3 k = vec3(0.57735);
    float ca = cos(a);
    return c * ca + cross(k, c) * sin(a) + k * dot(k, c) * (1.0 - ca);
}

float hash11(float n) { return fract(sin(n * 12.9898) * 43758.5453); }

float starsField(vec3 dir, float density)
{
    vec3 g = floor(dir * 200.0);
    float h = hash11(dot(g, vec3(1.0, 57.0, 113.0)));
    return step(1.0 - density, h) * (0.35 + 0.65 * hash11(h * 31.7));
}

float materialExposure(sampler2DArray tex)
{
    vec3 avg = textureLod(tex, vec3(0.5, 0.5, 0.0), 20.0).rgb;
    float l = dot(avg, vec3(0.299, 0.587, 0.114));
    return clamp(0.20 / max(l, 0.02), 0.30, 2.0);
}

vec3 renderSky(vec3 dir, vec3 tint)
{
    float h = clamp(dir.y * 0.5 + 0.5, 0.0, 1.0);
    vec3 col = mix(vec3(0.012, 0.014, 0.020), vec3(0.026, 0.024, 0.036), h);
    col += tint * 0.05 * pow(max(dot(dir, normalize(vec3(-0.3, 0.6, 0.74))), 0.0), 6.0);
    col += vec3(1.0) * starsField(dir, 0.0014);
    return col;
}

void main()
{
    float hue = (hueP > 0.01 ? hueP : 0.0);
    vec3 tint = hueRot(vec3(0.55, 0.80, 1.0), tintP);

    if( vBg > 0.5 )
    {
        fragColor = vec4(renderSky(normalize(vPos), tint), 1.0);
        return;
    }

    // Round the splat off. Without this every particle is a hard square and a
    // hundred thousand of them read as a mosaic rather than as dust.
    float r2 = dot(vQuad, vQuad);
    if( r2 > 1.0 ) discard;
    float fall = 1.0 - r2;
    fall *= fall;

    vec3 base = vec3(0.55);
    if( texMeshMaterialLayers > 0 )
        base = texture(texMeshMaterial, vec3(vUV, 0.0)).rgb * materialExposure(texMeshMaterial);

    vec3 n = normalize(vNormal);
    float lam = max(dot(n, normalize(vec3(-0.4, 0.7, -0.58))), 0.0);
    vec3 col = base * (0.30 + 1.10 * lam);

    // Loose particles glow and lose their shading: a speck of dust in the air
    // is lit from every side, so a hard light/dark split on it looks wrong.
    float loose = clamp(vLoose, 0.0, 1.0);
    col = mix(col, base * 0.85 + tint * 0.55, loose * 0.65);
    col += tint * loose * (0.30 + 0.85 * audioSwell);
    col += tint * audioKick * loose * 0.55;

    // The dither is not needed here -- the splats already overlap and the round
    // falloff does the blending -- but the EDGES have to fade or the cloud gets
    // a visible grid of quad boundaries where splats meet.
    col *= fall;

    if( hue > 0.001 ) col = hueRot(col, 0.12 * sin(hue));

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
