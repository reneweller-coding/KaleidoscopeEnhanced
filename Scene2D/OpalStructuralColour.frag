#version 330 core
out vec4 fragColor;
/**
 * @file OpalStructuralColour.frag
 * @brief OPAL STRUCTURAL COLOUR: the play of colour of a precious opal.
 * The stone is a lattice of silica spheres in domains; each domain
 * reflects the Bragg wavelength for its orientation and the viewing
 * angle, so as the viewing angle sweeps slowly the domains flash through
 * the spectrum.  The photo is the milky body of the stone; band energy
 * lights the domains whose colour matches; the treble sparkles the
 * sphere lattice.  Camera still; only the light angle moves.
 *
 * Audio Reactivity:
 *   sceneAdvance      -> viewing-angle sweep (continuous, slow)
 *   audioSpectrum[32] -> domain brightness by colour (light)
 *   audioHigh         -> lattice sparkle (light)
 *   audioSwell        -> light strength (slow)
 *   audioLevel        -> brightness
 *
 * Per-activation variety: domainP (domain size), milkP, hueP.
 */
uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float sceneAdvance;
uniform float sceneTime;
uniform float audioAdvance;
uniform float audioSpectrum[32];
uniform float audioHigh;
uniform float audioSwell;
uniform float audioLevel;
uniform float audioChromaHue;
uniform float audioValence;

uniform float domainP;
uniform float milkP;
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

vec2 hash22(vec2 p)
{
    p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
    return fract(sin(p) * 43758.5453);
}
float hash21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

// Voronoi domains: id, distance to the edge.
void domains(vec2 x, out float id, out float edge, out vec2 orient)
{
    vec2 n = floor(x), f = fract(x);
    float d1 = 8.0, d2 = 8.0; id = 0.0; orient = vec2(0.0);
    for (int j = -1; j <= 1; ++j)
    for (int i = -1; i <= 1; ++i)
    {
        vec2 g = vec2(float(i), float(j));
        vec2 h = hash22(n + g);
        vec2 r = g + h - f;
        float d = dot(r, r);
        if (d < d1) { d2 = d1; d1 = d; id = h.x; orient = h; }
        else if (d < d2) d2 = d;
    }
    edge = sqrt(d2) - sqrt(d1);
}

// A spectral colour for a wavelength parameter 0 (violet) .. 1 (red).
vec3 spectral(float t)
{
    return clamp(vec3(1.2 * t - 0.2 + 0.5 * pow(max(0.2 - t, 0.0), 1.0) * 3.0, 1.0 - abs(t - 0.5) * 2.4, 1.0 - t * 1.6), 0.0, 1.0);
}

void main()
{
    float aspect = resolution.x / resolution.y;
    vec2 p = (gl_FragCoord.xy / resolution - 0.5) * vec2(aspect, 1.0);

    float hue = (hueP > 0.001) ? hueP : 0.0;
    float scale = 5.0 + 6.0 * (1.0 - clamp(domainP, 0.0, 1.0));
    float milk = 0.3 + 0.5 * clamp(milkP, 0.0, 1.0);
    float light = 0.6 + 0.7 * clamp(audioSwell, 0.0, 1.0);
    // The viewing angle sweeps slowly (a tilt of the stone under the lamp).
    float view = 0.5 + 0.5 * sin(sceneAdvance * 0.18 + sceneTime * 0.03);

    // The stone: a cabochon; outside it, the dark velvet.
    float r = length(p * vec2(0.8, 1.0));
    float stone = smoothstep(0.62, 0.6, r);
    float dome = sqrt(max(1.0 - r * r / 0.37, 0.0));
    vec3 col = vec3(0.03, 0.02, 0.035);
    // Body: milky, the photo soft inside.
    vec3 body = mix((interpolation * textureLod(tex0, p * 0.7 + 0.5, 3.0) + (1.0 - interpolation) * textureLod(tex1, p * 0.7 + 0.5, 3.0)).rgb, vec3(0.9, 0.92, 0.95), milk);
    body = mix(body, body * imgPalette(hue * 0.159 + 0.6) * 1.5, 0.2);
    // Domains and their Bragg colour: wavelength parameter from the domain
    // orientation and the viewing angle (Bragg: lambda ~ d cos(theta)).
    float id, edge; vec2 orient;
    domains(p * scale + 3.0, id, edge, orient);
    float theta = orient.x * 1.2 + view * 1.1 + orient.y * 0.4;
    float lam = fract(0.5 + 0.5 * cos(theta) + orient.y * 0.3);
    vec3 flash = spectral(lam);
    // Band energy for this colour: map wavelength to a band.
    int band = int(clamp(lam * 31.0, 0.0, 31.0));
    float e = clamp(audioSpectrum[band] * 1.6, 0.0, 1.0);
    // Domain visibility: strong near a Bragg match (a bell in theta), soft edges.
    float match = exp(-pow(fract(theta / 3.14159 + 0.5) - 0.5, 2.0) * 30.0);
    float dom = match * smoothstep(0.0, 0.06, edge);
    vec3 play = flash * dom * (0.5 + 0.9 * e) * light * 1.4;
    // The sphere lattice itself: fine round sparkles, brighter with the treble.
    vec2 gu = p * 140.0; vec2 cell = floor(gu); vec2 f = fract(gu) - 0.5;
    vec2 off = vec2(hash21(cell + 3.1), hash21(cell + 7.7)) - 0.5;
    float sparkle = smoothstep(0.18, 0.05, length(f - off * 0.5)) * step(0.93, hash21(cell)) * (0.15 + 0.9 * clamp(audioHigh * 2.0, 0.0, 1.0)) * dom;
    vec3 stoneCol = body * (0.45 + 0.6 * dome) * light + play + vec3(1.0) * sparkle;
    // Surface highlight of the cabochon.
    stoneCol += vec3(1.0) * pow(max(1.0 - length(p - vec2(-0.2, 0.25)) * 3.0, 0.0), 3.0) * 0.5 * light;
    col = mix(col, stoneCol, stone);
    col *= 0.75 + 0.5 * audioLevel;

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
