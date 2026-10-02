#version 330 core
out vec4 fragColor;   ///< The pixel's colour (output).
/**
 * @file TessellatedOcean.frag
 * @brief TESSELLATED OCEAN: a night sea whose fineness is the treble.  The
 * tessellation control stage splits the water finer when the mix is bright
 * (continuous, fractional spacing) -- a loud passage ripples the whole sea,
 * a dull one leaves it glassy -- and the fragment stage lights it as a
 * night ocean: a Fresnel mirror of the photo as the sky, and phosphorescence
 * on the breaking crests that flares on the kick.  Camera height fixed,
 * swell on the slow envelope, waves on the scene clock.
 *
 * Audio Reactivity:
 *   audioHigh (+swell) -> tessellation fineness (control stage, continuous)
 *   audioSwell         -> wave height (evaluation stage, slow)
 *   audioKick          -> phosphorescence flares on the crests (light)
 *   audioLevel         -> water brightness
 *   audioChromaHue     -> phosphor tint via the palette
 *
 * Per-activation variety: camHP (eye height), detailP, swellP, choppyP, hueP.
 */
in vec3  vWorld;   ///< World position (from the vertex stage).
in vec2  vSurfUV;
in float vCrest;
in vec3  vNormal;   ///< Surface normal (from the vertex stage).
in float vDist;   ///< Distance (from the vertex stage).

uniform sampler2D tex0;   ///< The current photo.
uniform sampler2D tex1;   ///< The next photo (cross-faded in by interpolation).
uniform float interpolation;   ///< Cross-fade between the photos: 1 = tex0, 0 = tex1.
uniform float time;   ///< Seconds since the program started (never reset; see sceneTime).
uniform float sceneTime;   ///< Seconds since this scene was activated.
uniform float audioAdvance;   ///< The music's advance: integrated tempo-weighted energy (never jumps, never runs backwards).
uniform float audioLevel;   ///< Overall loudness, 0..1.
uniform float audioKick;   ///< Kick-drum envelope, 0..1 (fast attack, short decay).
uniform float audioHigh;   ///< High band level, 0..1.
uniform float audioChromaHue;   ///< Hue of the dominant pitch class (radians, unwrapped: continuous).
uniform float audioValence;   ///< Mood valence: 0 dark .. 1 bright.
uniform float camHP;   ///< Camera height knob, 0..1.
uniform float hueP;   ///< Hue knob (radians), usually the music's chroma hue plus a rolled offset.

/// @brief The photo at a coordinate: the cross-fade of tex0 and tex1.
vec3 img(vec2 uv) {
    return (interpolation * texture(tex0, uv) + (1.0 - interpolation) * texture(tex1, uv)).rgb;
}

/// @brief The house palette: a colour of the photo on an arc that turns with the music's hue.
vec3 imgPalette(float t)
{
    float ang = audioChromaHue + audioAdvance * 0.04 + t * 6.2831853;
    float rad = 0.16 + 0.08 * sin(audioAdvance * 0.013);
    vec3  col = img(clamp(vec2(0.5) + rad * vec2(cos(ang), sin(ang)), 0.0, 1.0));
    float g   = dot(col, vec3(0.333));
    return mix(vec3(g), col, 0.55 + 0.45 * audioValence);
}

/// @brief Entry point of this shader stage (the file description says what it draws).
void main()
{
    float hue = (hueP > 0.001) ? hueP : 0.0;
    vec3 n = normalize(vNormal);
    vec3 V = normalize(vec3(0.0, camHP, 0.0) - vWorld);
    float fres = pow(1.0 - clamp(dot(n, V), 0.0, 1.0), 5.0);
    fres = mix(0.03, 0.8, fres);

    // Night sky reflection: the photo, dark and low-contrast, along the
    // reflected ray; a moon from the palette.
    vec3 R = reflect(-V, n);
    vec2 skyUV = clamp(vec2(0.5 + R.x * 0.4, 0.5 + R.y * 0.8), 0.0, 1.0);
    vec3 sky = img(skyUV) * 0.6 * imgPalette(hue * 0.159 + 0.6) * 2.5 + imgPalette(hue * 0.159 + 0.6) * 0.15;
    vec3 moonDir = normalize(vec3(0.3, 0.35, 1.0));
    float moon = pow(max(dot(R, moonDir), 0.0), 300.0) * 4.0 + pow(max(dot(R, moonDir), 0.0), 20.0) * 0.8;
    sky += vec3(1.0, 0.97, 0.9) * moon;

    // Water body: deep, dark, with a phosphorescent tint in the crests.
    vec3 water = imgPalette(hue * 0.159 + 0.55) * 0.3 * (0.6 + 0.6 * audioLevel) + vec3(0.01, 0.03, 0.05);
    vec3 phos = imgPalette(hue * 0.159 + 0.45) * 1.5 + vec3(0.1, 0.4, 0.5);
    float crest = vCrest * (0.4 + 0.6 * clamp(audioHigh * 2.0, 0.0, 1.0));
    water += phos * crest * (0.5 + 1.5 * audioKick);

    vec3 col = mix(water, sky, fres);
    // Distance fog into the night.
    float fog = 1.0 - exp(-vDist * 0.006);
    col = mix(col, imgPalette(hue * 0.159 + 0.6) * 0.12, clamp(fog, 0.0, 0.85));

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
