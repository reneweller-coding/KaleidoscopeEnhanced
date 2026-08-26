#version 330 core
out vec4 fragColor;

/**
 * @file ShadowTheatre.frag
 * @brief A shadow play. A lamp behind a lit screen, a real 3D model turning in
 * front of it, and the only thing the audience is given is the outline. The
 * shape is unrecognisable and then suddenly obvious as it turns through a
 * profile that reads, which is the whole pleasure of the form.
 *
 * The caster is near-black with a soft warm edge rather than a hard cut-out: a
 * lamp has size, so every real shadow has a penumbra, and it is the softness
 * that makes it read as light rather than as a sticker. The penumbra widens
 * with nearP -- a caster close to the lamp throws a large blurred shadow, one
 * near the screen a small sharp one -- and holding those two together is what
 * makes the depth believable.
 *
 * The screen is the sky shell's far face, lit from behind by a drifting lamp.
 * No shadow map is involved (see the .vert for why the engine's could not be
 * used here), so the family costs a single pass.
 *
 *   audioAdvance -> the lamp drifts behind the screen
 *   audioKick    -> the lamp flares and the caster jolts
 *   audioSwell   -> screen brightness
 *   audioHigh    -> grain and flicker, like a real projector
 *
 * Per-instance: sizeP, spinP, nearP (distance to the lamp), tintP (lamp hue).
 * Per-activation variety: hueP float palette offset (0..6.28).
 */

uniform sampler2D tex0;
uniform sampler2D tex1;

uniform float time;
uniform float interpolation;
uniform float audioAdvance;
uniform float audioKick;
uniform float audioSwell;
uniform float audioHigh;

uniform float hueP;
uniform float tintP;
uniform float nearP;

in vec3  vNormal;
in vec3  vPos;
in vec3  vWorld;
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

vec3 photo(vec2 uv)
{
    uv = clamp(uv, 0.0, 1.0);
    return mix(texture(tex1, uv).rgb, texture(tex0, uv).rgb, 1.0 - interpolation);
}

void main()
{
    float hue = (hueP > 0.01 ? hueP : 0.0);
    vec3 lamp = hueRot(vec3(1.0, 0.86, 0.62), tintP);
    float nr = (nearP > 0.01 ? nearP : 1.0);

    // Where the lamp sits behind the screen. Both the falloff on the screen and
    // the side the penumbra opens toward are measured from here, so they agree.
    vec2 lampPos = vec2(0.30 * sin(time * 0.07 + audioAdvance * 0.03),
                        0.16 * cos(time * 0.05) + 0.06);

    if( vBg > 0.5 )
    {
        vec3 w = vWorld;
        if( w.z < 140.0 )
        {
            // Not the screen -- the dark of the room around it.
            fragColor = vec4(vec3(0.012, 0.012, 0.016), 1.0);
            return;
        }

        vec2 s = w.xy / 190.0;                 // -1..1 across the screen
        float r = length(s - lampPos);

        // A lamp behind a diffusing screen: bright core, long falloff. The
        // 1/(1+kr^2) form is what a diffuser actually does and it keeps a
        // usable gradient out to the edges instead of clipping to white.
        float glow = 1.0 / (1.0 + r * r * 7.0);
        vec3 col = lamp * glow * (0.85 + 0.85 * audioSwell + 1.1 * audioKick);

        // The screen has a weave and the lamp has grain. Both are small, and
        // both stop the gradient reading as a computed ramp.
        float weave = 0.5 + 0.5 * sin(s.x * 420.0) * sin(s.y * 420.0);
        col *= 0.94 + 0.06 * weave;
        col *= 0.93 + 0.07 * noise2(s * 90.0 + time * 3.0) * (0.4 + 0.9 * audioHigh);

        // The current photograph, very faint, as staining in the screen fabric:
        // it ties the family to whatever the rest of the show is looking at.
        col += photo(s * 0.5 + 0.5) * 0.10 * glow;

        vec3 t1 = max(col, 0.0);
        t1 /= 1.0 + 0.30 * max(t1.r, max(t1.g, t1.b));
        fragColor = vec4(clamp(t1, 0.0, 1.0), 1.0);
        return;
    }

    // The caster: nearly opaque, with a warm penumbra around the rim. Grazing
    // fragments ARE the outline, so the fresnel term is the penumbra, and
    // widening it with nearP keeps the softness tied to the geometry.
    vec3 n = normalize(vNormal);
    vec3 viewDir = normalize(-vPos);
    float graze = 1.0 - max(dot(n, viewDir), 0.0);

    float soft = mix(6.0, 1.6, clamp((nr - 0.6) / 1.4, 0.0, 1.0));
    float edge = pow(graze, soft);

    // Light bleeding past the caster, strongest on the side the lamp is on.
    vec2 sp = vWorld.xy / 190.0;
    float toLamp = length(sp - lampPos);
    float bleed = edge * (0.55 + 0.75 * audioKick) / (1.0 + toLamp * toLamp * 3.0);

    vec3 col = vec3(0.008, 0.008, 0.011);
    col += lamp * bleed * (0.8 + 0.7 * audioSwell);

    if( hue > 0.001 ) col = hueRot(col, 0.10 * sin(hue));

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.30 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
