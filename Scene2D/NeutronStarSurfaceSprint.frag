#version 330 core
out vec4 fragColor;
/**
 * @file NeutronStarSurfaceSprint.frag
 * @brief NEUTRON STAR SURFACE SPRINT: a racing flight over the crust of a
 * neutron star.  The ground is a height field of cooled iron plates split
 * by glowing cracks; the camera skims it at a fixed height on the music's
 * pace, so the crust streams under us and the horizon stays put.  The
 * sharpness of the sound is the heat in the cracks; a starquake is a kick,
 * and it is LIGHT: a flash runs through the crack network, the ground never
 * heaves.  Builds raise a faint magnetospheric glow over the horizon.
 *
 * Audio Reactivity:
 *   sceneAdvance    -> the sprint (music-paced, continuous)
 *   audioSharpness  -> crack glow (light)
 *   audioKick       -> starquake flash through the cracks (light)
 *   audioSwell      -> magnetosphere glow over the horizon (slow)
 *   audioSubBass    -> deep red glow of the plates (light)
 *
 * Per-activation variety: speedP, crackP (crack density), hueP.
 */
uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float sceneAdvance;
uniform float sceneTime;
uniform float audioAdvance;
uniform float audioSharpness;
uniform float audioKick;
uniform float audioSwell;
uniform float audioSubBass;
uniform float audioLevel;
uniform float audioChromaHue;
uniform float audioValence;

uniform float speedP;
uniform float crackP;
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
vec2  hash22(vec2 p) { return vec2(hash21(p), hash21(p + 19.7)); }

// Voronoi: returns (distance to nearest cell centre, distance to the border).
vec2 voro(vec2 x)
{
    vec2 n = floor(x), f = fract(x);
    float d1 = 8.0, d2 = 8.0;
    for (int j = -1; j <= 1; ++j)
    for (int i = -1; i <= 1; ++i)
    {
        vec2 g = vec2(float(i), float(j));
        vec2 o = hash22(n + g);
        vec2 r = g + o - f;
        float d = dot(r, r);
        if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d;
    }
    return vec2(sqrt(d1), sqrt(d2) - sqrt(d1));
}

float terrain(vec2 xz, float dens)
{
    vec2 v = voro(xz * dens);
    // Plates are slightly domed; cracks are grooves.
    return 0.12 * (1.0 - v.x) - 0.08 * exp(-v.y * 12.0);
}

void main()
{
    float aspect = resolution.x / resolution.y;
    vec2 p = (gl_FragCoord.xy / resolution - 0.5) * vec2(aspect, 1.0);

    float hue = (hueP > 0.001) ? hueP : 0.0;
    float dens = 0.7 + 0.6 * clamp(crackP, 0.0, 1.0);
    float travel = sceneAdvance * 3.5 * (speedP > 0.05 ? speedP : 1.0) + sceneTime * 0.8;

    vec3 cam = vec3(0.0, 0.55, travel);
    vec3 dir = normalize(vec3(p.x, p.y - 0.22, 1.2));

    float t = 0.05, hitT = -1.0; vec3 pos = cam;
    for (int i = 0; i < 56; ++i)
    {
        pos = cam + dir * t;
        float h = terrain(pos.xz, dens);
        float dh = pos.y - h;
        if (dh < 0.01 * t) { hitT = t; break; }
        t += max(dh * 0.7, 0.03);
        if (t > 40.0) break;
    }

    vec3 hotCol  = imgPalette(hue * 0.159 + 0.05) * 1.5 + vec3(0.6, 0.15, 0.0);
    vec3 ironCol = imgPalette(hue * 0.159 + 0.6) * 0.35;
    vec3 skyCol  = imgPalette(hue * 0.159 + 0.5);
    vec3 col;
    if (hitT < 0.0)
    {
        // Sky: near-black with a magnetospheric glow over the horizon on the
        // swell, and the star's own hot corona line.
        float hz = smoothstep(-0.05, 0.4, dir.y);
        col = skyCol * 0.04 * (1.0 - hz);
        col += skyCol * exp(-max(dir.y, 0.0) * 8.0) * (0.15 + 0.6 * clamp(audioSwell, 0.0, 1.0));
        vec2 cell = floor(dir.xy * 120.0 / max(dir.z, 0.2)); vec2 f = fract(dir.xy * 120.0 / max(dir.z, 0.2)) - 0.5;
        col += vec3(step(0.988, hash21(cell)) * exp(-dot(f, f) * 9.0)) * 0.4 * hz;
    }
    else
    {
        vec2 v = voro(pos.xz * dens);
        float crack = exp(-v.y * 10.0);
        // Cracks glow with the sharpness; the quake flash runs along them.
        float heat = 0.3 + 1.2 * clamp(audioSharpness * 1.5, 0.0, 1.0);
        float quake = audioKick * (0.5 + 0.5 * sin(pos.z * 3.0 - sceneTime * 12.0));
        vec3 plate = ironCol * (0.6 + 0.4 * v.x) * (0.5 + 0.5 * audioLevel);
        plate += hotCol * 0.08 * clamp(audioSubBass, 0.0, 1.0);          // deep glow through the iron
        plate += img(fract(pos.xz * 0.3)) * 0.06;
        col = plate + hotCol * crack * (heat + 1.5 * quake);
        float fog = 1.0 - exp(-hitT * 0.09);
        col = mix(col, skyCol * 0.05, clamp(fog, 0.0, 0.95));
    }

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
