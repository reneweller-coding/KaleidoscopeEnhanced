#version 330 core
out vec4 fragColor;
/**
 * @file FxDepthFog.frag
 * @brief FX DEPTH FOG: physically modelled atmospheric haze that separates
 * light absorbed by the fog from light scattered into the ray from a
 * wandering sun (Henyey-Greenstein phase function), read against the
 * scene's real depth buffer.
 *
 * Height falloff gives the fog a layer with a surface rather than a
 * uniform fill; the sun's direction and colour drift with dayPhase and the
 * harmonic hue.
 *   interpolation -> cross-fades the two fogged scene layers
 *   audioSubBass  -> thickens the fog density and widens the forward-scatter halo
 *   audioKick     -> flashes the sun colour brighter
 *   audioLevel    -> brightens the sun colour
 *   audioChromaHue-> tints the sun and air colour with the harmonic hue
 *   audioAmbient  -> lifts the ambient air colour
 *   audioBeat     -> subtle overall brightness pulse
 */
// FxDepthFog.frag — atmospheric depth, done as physics rather than as a
// distance-keyed colour ramp.
// -----------------------------------------------------------------------
// Two things happen to light crossing a hazy volume: some is absorbed, and
// some is scattered INTO the ray from the sun.  A simple lerp toward a fog
// colour models only the first, which is why it flattens a scene into a wash.
// Keeping them separate is what gives aerial perspective its direction — the
// haze glows toward the light and stays dark away from it.
//
// The scattering is weighted by Henyey-Greenstein, the standard one-parameter
// phase function: at g = 0 the haze scatters evenly, and as g rises the glow
// tightens into a halo around the sun.  The bass opens that halo up.
//
// Height falloff turns the fog into a layer with a surface rather than a
// uniform fill, which is what lets tall geometry stand out of it.
uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform sampler2D texDepth0;
uniform sampler2D texDepth1;
uniform vec2  depthValid;
uniform vec2  nearFar;
uniform float tanHalfFov;
uniform float interpolation;

uniform float audioLevel;
uniform float audioBeat;
uniform float audioKick;
uniform float audioHigh;
uniform float audioSubBass;
uniform float audioChromaHue;
uniform float audioAmbient;
uniform float dayPhase;

uniform float densityP;     // preset: how thick the air is
uniform float heightP;      // preset: how fast the layer thins with height
uniform float glowP;        // preset: strength of the forward scattering

vec3 hue2rgb(float h)
{
    return clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
}

float linearise(float d)
{
    float n = nearFar.x, f = nearFar.y;
    float z = d * 2.0 - 1.0;
    return (2.0 * n * f) / (f + n - z * (f - n));
}

// Henyey-Greenstein phase function: how much light scattered from direction L
// ends up travelling toward the viewer.
float phaseHG(float cosT, float g)
{
    float g2 = g * g;
    float d = 1.0 + g2 - 2.0 * g * cosT;
    return (1.0 - g2) / (12.566371 * max(pow(d, 1.5), 1e-4));
}

vec3 fogged(sampler2D src, sampler2D dep, vec2 uv, vec3 sunDir, vec3 sunCol,
            vec3 airCol, float valid)
{
    vec3 c = texture(src, uv).rgb;
    if (valid < 0.5)
        return c;

    float z = linearise(texture(dep, uv).r);

    // The view ray for this pixel, which the phase function needs.
    vec2 ndc = uv * 2.0 - 1.0;
    float aspect = resolution.x / max(resolution.y, 1.0);
    vec3 ray = normalize(vec3(ndc.x * tanHalfFov * aspect, ndc.y * tanHalfFov, -1.0));

    // A height-banded layer: the y of the point this pixel sees, used to thin
    // the fog upward.  Sky (at the far plane) still gets full extinction, which
    // is what keeps the horizon from cutting a hard line.
    float y = ray.y * z;
    float hFall = exp(-max(y, 0.0) * (0.045 * heightP));

    float density = densityP * (0.9 + 0.6 * audioSubBass) * hFall;
    float ext = 1.0 - exp(-z * density * 0.0055);
    ext = clamp(ext, 0.0, 1.0);

    // In-scattering: strongest looking into the sun, and it grows with the same
    // path length that absorbs the scene.
    float cosT = dot(ray, sunDir);
    float g = clamp(0.55 + 0.25 * glowP - 0.20 * audioSubBass, 0.0, 0.92);

    // The phase function is a probability DENSITY, and a forward-scattering
    // lobe is very tall: at g = 0.62 its peak is above 11.  Used raw it does
    // not brighten the haze, it detonates it — the whole frame goes white.
    // Dividing by that peak, which has the closed form (1+g)/(1-g)^2, turns it
    // into a 0..1 shape that still concentrates exactly where it should.
    float peak = (1.0 + g) / max((1.0 - g) * (1.0 - g), 1e-3);
    float inScatter = phaseHG(cosT, g) * 12.566371 / peak;

    vec3 air = airCol + sunCol * inScatter * (0.35 + 1.5 * glowP);

    return mix(c, air, ext);
}

void main()
{
    vec2 uv = gl_FragCoord.xy / resolution;

    // A sun that wanders with the day cycle rather than with the frame counter,
    // so the light in the room agrees with the rest of the show.
    float sa = 6.2831853 * dayPhase + 0.6 * sin(time * 0.017);
    vec3 sunDir = normalize(vec3(0.55 * sin(sa), 0.22 + 0.16 * cos(sa * 0.5), -1.0));

    vec3 sunCol = mix(vec3(1.0, 0.72, 0.42), vec3(0.85, 0.92, 1.0),
                      clamp(0.5 + 0.5 * cos(sa), 0.0, 1.0));
    sunCol = mix(sunCol, hue2rgb(fract(0.08 + 0.10 * sin(audioChromaHue))), 0.22);
    sunCol *= 0.7 + 0.9 * audioLevel + 0.5 * audioKick;

    vec3 airCol = mix(vec3(0.045, 0.060, 0.095), vec3(0.16, 0.20, 0.28),
                      0.3 + 0.5 * audioAmbient);

    vec3 a = fogged(tex0, texDepth0, uv, sunDir, sunCol, airCol, depthValid.x);
    vec3 b = fogged(tex1, texDepth1, uv, sunDir, sunCol, airCol, depthValid.y);
    vec3 col = mix(b, a, clamp(interpolation, 0.0, 1.0));

    col *= 1.0 + 0.12 * audioBeat;
    col = col / (1.0 + col * 0.12);
    fragColor = vec4(col, 1.0);
}
