#version 330 core
out vec4 fragColor;

/**
 * @file ModalVibration.frag
 * @brief A real object rung by the music: four spectral bands drive four spatial
 * standing waves across its surface (the displacement itself is in the vertex
 * stage). This stage paints where the surface is moving -- crests hot, nodes
 * dark -- so the vibration pattern is visible even when the displacement is too
 * small to see as motion.
 *
 * The nodal lines are what carry it. On a struck plate the still lines between
 * moving regions are the thing the eye locks onto, so they get drawn
 * explicitly: |amplitude| near zero is inked dark, which is the same figure
 * sand makes on a Chladni plate.
 *
 *   audioSubBass..audioHigh -> the four modes (vertex stage)
 *   audioKick    -> a strike that excites every mode at once
 *   audioSwell   -> glow on the crests
 *
 * Per-instance: sizeP, spinP, gainP (displacement scale), tintP (crest hue).
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
in vec3  vNormal;
in vec3  vPos;
in vec3  vLocalPos;
in float vAmp;
in float vBg;

vec3 hueRot(vec3 c, float a)
{
    const vec3 k = vec3(0.57735);
    float ca = cos(a);
    return c * ca + cross(k, c) * sin(a) + k * dot(k, c) * (1.0 - ca);
}

float hash11(float n) { return fract(sin(n * 12.9898) * 43758.5453); }

float starsField(vec3 dir, float density)
{
    vec3 g = floor(dir * 190.0);
    float h = hash11(dot(g, vec3(1.0, 57.0, 113.0)));
    return step(1.0 - density, h) * (0.35 + 0.65 * hash11(h * 31.7));
}

// AUTO-EXPOSURE against the material's own average (coarsest mip = average).
// Base-colour luma across this asset set runs 0.14..0.67; a fixed gain cannot
// serve both ends.
float materialExposure(sampler2DArray tex)
{
    vec3 avg = textureLod(tex, vec3(0.5, 0.5, 0.0), 20.0).rgb;
    float l = dot(avg, vec3(0.299, 0.587, 0.114));
    return clamp(0.20 / max(l, 0.02), 0.30, 2.0);
}

// A dark chamber with a faint standing-wave field on the walls -- the room the
// object is being sounded in, not a landscape.
vec3 renderSky(vec3 dir, vec3 tint)
{
    float band = 0.5 + 0.5 * sin(dir.y * 22.0 + time * 0.6 + audioAdvance * 0.3);
    band = pow(band, 6.0);
    vec3 col = vec3(0.020, 0.021, 0.028) + tint * band * 0.06 * (0.4 + 0.6 * audioSwell);
    col += vec3(1.0) * starsField(dir, 0.0010);
    return col;
}

void main()
{
    float hue = (hueP > 0.01 ? hueP : 0.0);
    vec3 tint = hueRot(vec3(1.0, 0.55, 0.18), tintP);

    if( vBg > 0.5 )
    {
        fragColor = vec4(renderSky(normalize(vPos), tint), 1.0);
        return;
    }

    vec3 n = normalize(vNormal);
    vec3 viewDir = normalize(-vPos);

    vec3 base = vec3(0.5);
    if( texMeshMaterialLayers > 0 )
        base = texture(texMeshMaterial, vec3(vUV, 0.0)).rgb * materialExposure(texMeshMaterial);

    float lam = max(dot(n, normalize(vec3(-0.35, 0.72, -0.6))), 0.0);
    vec3 col = base * (0.30 + 1.25 * lam);

    // Crests and troughs. Signed, so the two phases of the standing wave get
    // different colours and the wave is seen travelling rather than pulsing.
    float a = clamp(vAmp, -1.5, 1.5);
    vec3 hot  = tint;
    vec3 cold = hueRot(tint, 3.0);
    col += hot  * max( a, 0.0) * (0.55 + 0.9 * audioSwell);
    col += cold * max(-a, 0.0) * (0.35 + 0.6 * audioSwell);

    // Nodal lines: where the surface is NOT moving. Inking them is what turns a
    // wobble into a visible mode pattern -- it is the sand figure on a Chladni
    // plate, and the eye reads the geometry from the still lines, not the
    // moving ones. fwidth keeps them a constant width on screen.
    float w = max(fwidth(a) * 2.4, 1e-4);
    float node = 1.0 - smoothstep(0.0, w, abs(a));
    col = mix(col, col * 0.10, node * 0.95);
    col += tint * node * audioKick * 0.9;      // the strike lights them briefly

    // A rim so the silhouette survives against the dark chamber.
    float rim = pow(1.0 - max(dot(n, viewDir), 0.0), 3.0);
    col += tint * rim * (0.30 + 0.5 * audioSwell);

    if( hue > 0.001 ) col = hueRot(col, 0.12 * sin(hue));

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
