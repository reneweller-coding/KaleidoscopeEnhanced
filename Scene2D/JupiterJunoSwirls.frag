#version 330 core
out vec4 fragColor;
/**
 * @file JupiterJunoSwirls.frag
 * @brief JUPITER JUNO SWIRLS: Jupiter's clouds seen close, as the Juno probe
 * photographed them -- belts and zones sheared into each other, chains of
 * white ovals, filaments that curl into Kelvin-Helmholtz waves along every
 * belt edge, and a great storm spot rolling at the centre.  The whole
 * field fills the frame and flows: the bands drift in opposite directions
 * and every edge rolls up in eddies.  Colour comes from the photo, pushed
 * into cream, ochre and blue-grey; the music is the storms' glow.
 *
 * Audio Reactivity:
 *   audioSpectrum[32] -> brightness of each belt (one band per belt)
 *   audioSwell        -> contrast of the cloud field (slow)
 *   audioKick         -> lightning flicker in the dark belts (light)
 *   sceneAdvance      -> the flow of the bands (continuous)
 *
 * Per-activation variety: stormP (size of the central storm), hueP.
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
uniform float audioSwell;
uniform float audioKick;
uniform float audioLevel;
uniform float audioChromaHue;
uniform float audioValence;

uniform float stormP;
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

float hash21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise2(vec2 p)
{
    vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x),
               mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), f.x), f.y);
}
float fbm(vec2 p) { float v = 0.0, a = 0.5; for (int i = 0; i < 5; ++i) { v += a * noise2(p); p = p * 2.03 + 3.7; a *= 0.5; } return v; }

void main()
{
    float aspect = resolution.x / resolution.y;
    vec2 uv = gl_FragCoord.xy / resolution;
    vec2 p = (uv - 0.5) * vec2(aspect, 1.0);
    float hue = (hueP > 0.001) ? hueP : 0.0;
    float swell = clamp(audioSwell, 0.0, 1.0);
    float kick = clamp(audioKick, 0.0, 2.0);
    float flow = sceneAdvance * 0.03 + sceneTime * 0.012;

    // Advect the field: iterate a velocity made of opposite zonal jets plus
    // vortices, a few steps back along the flow (a cheap semi-Lagrangian
    // look-up), which rolls every belt edge into curls.
    vec2 q = p * 1.6;
    float storm = mix(0.18, 0.32, clamp(stormP, 0.0, 1.0));
    // The bands drift in opposite directions (zonal jets).
    q.x += sin(q.y * 6.0) * flow * 0.8 + flow;
    // Turbulent curls: several passes of a noise-driven warp whose strength
    // peaks at the belt edges (where the shear is), marbling them.
    for (int i = 0; i < 6; ++i)
    {
        float fi = float(i);
        float shear = 0.35 + 0.65 * abs(cos(q.y * 6.0));
        float n = noise2(q * (3.0 + fi * 1.3) + vec2(fi * 7.1, flow * 0.5));
        q += (0.05 - fi * 0.005) * shear * vec2(cos(n * 6.2831853), sin(n * 6.2831853));
    }
    // The central storm: wound up by a rotation that falls off with radius.
    {
        vec2 c = vec2(0.15, -0.05);
        vec2 d = (q - c) / vec2(1.4, 1.0);
        float r2 = dot(d, d);
        float ang = 5.0 * exp(-r2 / (storm * storm)) + flow * 2.0 * exp(-r2 / (storm * storm));
        float ca = cos(ang), sa = sin(ang);
        d = vec2(ca * d.x - sa * d.y, sa * d.x + ca * d.y);
        q = c + d * vec2(1.4, 1.0);
    }
    // A chain of white ovals along one belt, each a smaller wound vortex.
    for (int k = 0; k < 4; ++k)
    {
        vec2 oc = vec2(-1.6 + float(k) * 0.85 + mod(flow * 0.5, 0.85), 0.5);
        vec2 od = q - oc;
        float ang = -3.5 * exp(-dot(od, od) / 0.012);
        float ca = cos(ang), sa = sin(ang);
        q = oc + vec2(ca * od.x - sa * od.y, sa * od.x + ca * od.y);
    }

    // Belts and zones: a band profile with turbulent detail.
    float lat = q.y * 6.0;
    float belt = 0.5 + 0.5 * sin(lat + 0.8 * fbm(q * vec2(2.0, 5.0)));
    float detail = fbm(q * vec2(6.0, 14.0));
    float fil = fbm(q * vec2(18.0, 30.0));
    int band = int(mod(floor(lat / 3.14159) + 16.0, 32.0));
    float e = clamp(audioSpectrum[band] * 1.4, 0.0, 1.0);

    // Juno colours: cream zones, ochre/brown belts, blue-grey in the deep
    // regions -- leaned toward the photo.
    vec3 cream = vec3(0.93, 0.88, 0.78);
    vec3 ochre = vec3(0.75, 0.5, 0.3);
    vec3 deep  = vec3(0.3, 0.38, 0.5);
    vec3 photo = imgPalette(hue * 0.159 + belt * 0.3);
    cream = mix(cream, photo * 1.2, 0.2);
    ochre = mix(ochre, photo, 0.25);
    float contrast = 0.8 + 0.5 * swell;
    float k = clamp(0.5 + (belt - 0.5) * contrast + (detail - 0.5) * 0.9, 0.0, 1.0);
    vec3 col = k < 0.5 ? mix(deep, ochre, k * 2.0) : mix(ochre, cream, (k - 0.5) * 2.0);
    col *= 0.75 + 0.45 * fil;
    col *= 0.85 + 0.35 * e;

    // The storm's core and the white ovals: brighter, with a darker ring.
    vec2 d0 = (p * 1.6 - vec2(0.15, -0.05)) / vec2(1.4, 1.0);
    float sr = length(d0) / storm;
    col = mix(col, col * 0.7 + vec3(0.25, 0.12, 0.05), smoothstep(1.1, 0.9, sr) * smoothstep(0.6, 0.9, sr) * 0.5);

    // Lightning in the dark belts: small blue-white flashes.
    vec2 lg = q * 10.0;
    vec2 lc = floor(lg), lf = fract(lg) - 0.5;
    float flash = step(0.93, hash21(lc)) * smoothstep(0.3, 0.0, length(lf)) * step(k, 0.4);
    float ph = 0.5 + 0.5 * sin(sceneTime * 2.0 + hash21(lc + 3.0) * 40.0);
    col += vec3(0.7, 0.8, 1.0) * flash * ph * (0.15 + 0.8 * kick);

    // Limb darkening toward the frame edge (the planet curves away).
    col *= 1.0 - 0.25 * dot(uv - 0.5, uv - 0.5);
    col *= 0.9 + 0.2 * audioLevel;
    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
