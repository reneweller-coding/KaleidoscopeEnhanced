#version 330 core
out vec4 fragColor;

/**
 * @file MeshTerrain.frag
 * @brief Flying low across a landscape that is really a 3D model blown up two
 * orders of magnitude (the transform is in the vertex stage). Grazing light and
 * distance haze do the rest: at that scale, folds become ridges and the eye
 * stops asking what the object used to be.
 *
 * Two things make this read as terrain rather than as a big object:
 *
 *  - The light is LOW. A raking sun turns every fold into a lit face and a
 *    dark one, which is how relief is read from the air. Overhead light
 *    flattens the same geometry into a texture.
 *  - Distance HAZE. Aerial perspective is the strongest depth cue there is for
 *    a landscape, and it costs one mix() against the sky colour.
 *
 *   audioAdvance -> flight speed (vertex stage)
 *   audioSwell   -> sun strength, haze density
 *   audioKick    -> a pulse of light along the ridges
 *
 * Per-instance: sizeP, speedP, heightP (relief), tintP (light hue).
 * Per-activation variety: hueP float palette offset (0..6.28).
 */

uniform sampler2DArray texMeshMaterial;
uniform int texMeshMaterialLayers;

uniform float time;
uniform float audioAdvance;
uniform float audioKick;
uniform float audioSwell;

uniform float hueP;
uniform float tintP;

in vec2  vUV;
in vec3  vNormal;
in vec3  vPos;
in float vDist;
in float vBg;

vec3 hueRot(vec3 c, float a)
{
    const vec3 k = vec3(0.57735);
    float ca = cos(a);
    return c * ca + cross(k, c) * sin(a) + k * dot(k, c) * (1.0 - ca);
}

float hash11(float n) { return fract(sin(n * 12.9898) * 43758.5453); }

float noise2(vec2 p)
{
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float n = i.x + i.y * 57.0;
    return mix(mix(hash11(n), hash11(n + 1.0), f.x),
               mix(hash11(n + 57.0), hash11(n + 58.0), f.x), f.y);
}

float fbm2(vec2 p)
{
    float v = 0.0, a = 0.5;
    for( int i = 0; i < 4; ++i ) { v += a * noise2(p); p *= 2.03; a *= 0.5; }
    return v;
}

float materialExposure(sampler2DArray tex)
{
    vec3 avg = textureLod(tex, vec3(0.5, 0.5, 0.0), 20.0).rgb;
    float l = dot(avg, vec3(0.299, 0.587, 0.114));
    return clamp(0.20 / max(l, 0.02), 0.30, 2.0);
}

// The sun sits just above the horizon, which is both the light and the reason
// the haze glows brightest toward it.
const vec3 kSunDir = vec3(-0.36, 0.11, 0.93);

vec3 skyColour(vec3 dir, vec3 tint)
{
    float h = clamp(dir.y * 0.5 + 0.5, 0.0, 1.0);
    vec3 col = mix(vec3(0.30, 0.22, 0.20) * 0.55, vec3(0.05, 0.07, 0.14), smoothstep(0.45, 0.95, h));
    vec3 s = normalize(kSunDir);
    float d = max(dot(dir, s), 0.0);
    col += tint * pow(d, 22.0) * 0.40 * (0.6 + 0.6 * audioSwell);
    col += vec3(1.0, 0.86, 0.68) * pow(d, 2200.0) * 5.0;
    // High cloud, moving with the flight so the sky is not a static backdrop.
    float cl = fbm2(dir.xz * 3.0 + vec2(time * 0.01 + audioAdvance * 0.006, 0.0));
    col = mix(col, col + vec3(0.10, 0.09, 0.10), smoothstep(0.55, 0.85, cl) * smoothstep(0.05, 0.4, dir.y));
    return col;
}

void main()
{
    float hue = (hueP > 0.01 ? hueP : 0.0);
    vec3 tint = hueRot(vec3(1.0, 0.62, 0.34), tintP);
    vec3 dir = normalize(vPos);

    if( vBg > 0.5 )
    {
        fragColor = vec4(skyColour(dir, tint), 1.0);
        return;
    }

    vec3 n = normalize(vNormal);
    vec3 s = normalize(kSunDir);

    vec3 base = vec3(0.42, 0.38, 0.34);
    if( texMeshMaterialLayers > 0 )
        base = texture(texMeshMaterial, vec3(vUV, 0.0)).rgb * materialExposure(texMeshMaterial);

    // Raking light. The wrap term keeps the shadowed faces from going to pure
    // black -- on real terrain they are filled by the sky, and without it the
    // dark side reads as a hole cut in the world.
    float lam = dot(n, s);
    float lit = max(lam, 0.0);
    float skyFill = 0.5 + 0.5 * n.y;
    vec3 col = base * (0.20 * skyFill + 1.55 * lit) * (0.85 + 0.4 * audioSwell);

    // Ridge lines: faces turning sharply away from the sun catch a rim, which
    // is what picks out a skyline from the air.
    float ridge = pow(clamp(1.0 - abs(lam), 0.0, 1.0), 6.0) * max(n.y, 0.0);
    col += tint * ridge * (0.35 + 1.1 * audioKick);

    // Aerial perspective. Everything far away tends toward the sky it is seen
    // against; this single term is what makes the scale read as kilometres.
    float fog = 1.0 - exp(-max(vDist - 55.0, 0.0) * 0.0082);
    fog = clamp(fog, 0.0, 1.0) * (0.9 + 0.1 * audioSwell);
    col = mix(col, skyColour(dir, tint), fog);

    if( hue > 0.001 ) col = hueRot(col, 0.10 * sin(hue));

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.30 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
