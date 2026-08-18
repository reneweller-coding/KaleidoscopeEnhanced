#version 330 core
out vec4 fragColor;
/**
 * @file CausticPool.frag
 * @brief The photograph seen as a pool floor through a rippling water surface lit by caustics.
 *
 * texCaustics (written by the CfxPhoton compute pass) supplies both the refraction, whose gradient bends the tex0 lookup so the floor appears to wobble under moving water, and the light pattern itself, blurred into a soft glow and blended in multiplicatively so it reveals the floor rather than sitting on top of it. audioSubBass strengthens the refraction, audioLevel and audioBeat brighten the caustic light and its squared glow term, and audioAmbient dims or lifts the whole image. The warpP and glowP presets scale refraction strength and blur radius.
 */
// CausticPool.frag — the photo as a pool floor under a rippling surface.
// Blend/CfxPhoton.comp splats refracted photons into texCaustics; here the
// same caustic field also displaces the floor, so the picture appears to be
// seen THROUGH moving water rather than having a light pattern laid over it.

uniform sampler2D tex0;
uniform sampler2D texCaustics;    // <- requests the wave + photon sim
uniform vec2  resolution;
uniform float time;
uniform float interpolation;

uniform float audioLevel;
uniform float audioBeat;
uniform float audioKick;
uniform float audioSubBass;
uniform float audioChromaHue;
uniform float audioAmbient;

uniform float warpP;              // refraction strength
uniform float glowP;

void main()
{
    vec2 uv = gl_FragCoord.xy / resolution;
    vec2 px = 1.0 / resolution;

    vec3 caus = texture(texCaustics, uv).rgb;

    // Gradient of the caustic field ~ the surface slope: use it to refract
    // the floor.  Cheap, and automatically in step with the light pattern.
    float cx = dot(texture(texCaustics, uv + vec2(px.x * 3.0, 0.0)).rgb
                 - texture(texCaustics, uv - vec2(px.x * 3.0, 0.0)).rgb, vec3(0.33));
    float cy = dot(texture(texCaustics, uv + vec2(0.0, px.y * 3.0)).rgb
                 - texture(texCaustics, uv - vec2(0.0, px.y * 3.0)).rgb, vec3(0.33));
    vec2 refr = vec2(cx, cy) * (0.010 + 0.030 * warpP) * (1.0 + 0.6 * audioSubBass);

    vec3 floorCol = texture(tex0, uv + refr).rgb;

    // Caustic glow, slightly blurred so the net has body.
    vec3 soft = vec3(0.0);
    float r = 0.003 + 0.005 * glowP;
    for (int i = 0; i < 6; ++i)
    {
        float a = float(i) * 1.0472;
        soft += texture(texCaustics, uv + vec2(cos(a), sin(a)) * r).rgb;
    }
    soft /= 6.0;

    vec3 light = caus + soft * 0.7;

    // Water tint deepens with distance from the light: the classic pool look.
    vec3 water = vec3(0.30, 0.62, 0.72);
    float depthT = 1.0 - clamp(dot(light, vec3(0.4)), 0.0, 1.0);
    vec3 col = floorCol * mix(vec3(1.0), water, 0.45 * depthT);

    // Multiplicative caustics: light REVEALS the floor, it does not sit on it.
    col *= 1.0 + light * (1.6 + 1.2 * audioLevel);
    col += light * light * (0.25 + 0.35 * audioBeat);

    col *= 0.85 + 0.35 * audioAmbient;
    col = col / (1.0 + col * 0.30);
    fragColor = vec4(col, interpolation);
}
