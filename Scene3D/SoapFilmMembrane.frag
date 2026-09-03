#version 330 core
out vec4 fragColor;
/**
 * @file SoapFilmMembrane.frag
 * @brief SOAP FILM MEMBRANE: a soap film in a frame, filling the view.  Its
 * colour is thin-film interference from the thickness the evaluation stage
 * computed: the film drains over the scene arc, so the bands of colour
 * creep downward as they do on a real bubble, the black film appearing at
 * the top near the end.  The photo is reflected in the film (it is a
 * mirror) and seen through it, dimmer; the treble is the shimmer of the
 * thinnest zones, the kick a flash of the frame light.  Camera still.
 *
 * Audio Reactivity:
 *   audioSwell    -> ripple amplitude (evaluation stage, slow)
 *   sceneProgress -> drainage (evaluation stage, the arc)
 *   audioHigh     -> shimmer (light)
 *   audioKick     -> frame-light flash (light)
 *   audioLevel    -> brightness
 *
 * Per-activation variety: detailP, modesP, drainP, hueP.
 */
in vec3  vWorld;
in vec2  vSurfUV;
in vec3  vNormal;
in float vThick;

uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;
uniform float time;
uniform float audioAdvance;
uniform float audioLevel;
uniform float audioKick;
uniform float audioHigh;
uniform float audioChromaHue;
uniform float audioValence;
uniform float hueP;

vec3 img(vec2 uv) {
    return (interpolation * texture(tex0, uv) + (1.0 - interpolation) * texture(tex1, uv)).rgb;
}

vec3 imgPalette(float t)
{
    float ang = audioChromaHue + audioAdvance * 0.04 + t * 6.2831853;
    float rad = 0.16 + 0.08 * sin(audioAdvance * 0.013);
    vec3  col = img(clamp(vec2(0.5) + rad * vec2(cos(ang), sin(ang)), 0.0, 1.0));
    float g   = dot(col, vec3(0.333));
    return mix(vec3(g), col, 0.55 + 0.45 * audioValence);
}

// Thin-film reflectance for the three wavelengths, thickness d in nm/100,
// refractive index 1.33, at incidence cosine c.
vec3 thinFilm(float d, float c)
{
    float n = 1.33;
    float ct = sqrt(1.0 - (1.0 - c * c) / (n * n));
    float opd = 2.0 * n * d * 100.0 * ct;              // optical path difference in nm
    vec3 lambda = vec3(650.0, 530.0, 440.0);
    // Reflected intensity ~ sin^2(pi * opd / lambda) (with the half-wave shift).
    vec3 ph = 3.14159 * opd / lambda;
    return sin(ph) * sin(ph);
}

void main()
{
    float hue = (hueP > 0.001) ? hueP : 0.0;
    vec3 n = normalize(vNormal);
    vec3 V = normalize(-vWorld);
    float c = clamp(dot(n, V), 0.05, 1.0);
    // Interference colour, strongest at grazing angles; the very thin film
    // (d small) goes black -- the drained top.
    vec3 film = thinFilm(vThick, c);
    float black = smoothstep(1.4, 0.6, vThick);
    film *= 1.0 - black;
    // The reflection: the photo along the reflected ray (a mirror), and the
    // world behind seen through the film, dimmer.
    vec3 R = reflect(-V, n);
    vec2 ruv = clamp(vec2(0.5 + R.x * 0.5, 0.5 + R.y * 0.5), 0.0, 1.0);
    vec3 refl = img(ruv) * mix(vec3(1.0), imgPalette(hue * 0.159 + 0.5) * 1.6, 0.3);
    vec2 tuv = clamp(vec2(0.5 + vWorld.x * 0.045, 0.5 + vWorld.y * 0.07), 0.0, 1.0);
    vec3 through = img(tuv) * imgPalette(hue * 0.159 + 0.6) * 0.9;
    float fres = 0.04 + 0.96 * pow(1.0 - c, 3.0);
    vec3 col = through * (1.0 - fres) * (1.0 - black * 0.5) * 0.55 + refl * fres * 0.8;
    col += film * (0.6 + 0.3 * fres) * (1.0 + 0.6 * clamp(audioHigh * 2.0, 0.0, 1.0) * smoothstep(3.0, 1.5, vThick));
    // Frame light: a soft glow at the edges of the film, flashing on the kick.
    vec2 e = min(vSurfUV, 1.0 - vSurfUV);
    float rim = exp(-min(e.x, e.y) * 18.0);
    col += imgPalette(hue * 0.159 + 0.9) * rim * (0.25 + 1.0 * audioKick);
    col *= 0.75 + 0.5 * audioLevel;

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
