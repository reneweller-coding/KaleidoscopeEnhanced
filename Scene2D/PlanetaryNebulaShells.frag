#version 330 core
out vec4 fragColor;
/**
 * @file PlanetaryNebulaShells.frag
 * @brief PLANETARY NEBULA SHELLS: a dying star has thrown off shell after
 * shell of gas, and we fly inward through them.  The shells sit at radii
 * doubling outward, each one a thin sphere of fbm-mottled gas that glows
 * with its own spectrum band -- the innermost the bass, the outermost the
 * treble -- lit by the white dwarf at the centre.  Because the shell radii
 * double, the configuration is self-similar under "one shell inward", so
 * the flight is a log-periodic zoom: endless and seamless at the wrap.  The
 * camera flies steadily on the scene clock; the music is the shells' light.
 *
 * Audio Reactivity:
 *   audioSpectrum[32] -> shell brightness (light)
 *   sceneAdvance      -> the inward flight (periodic, seamless)
 *   audioKick         -> the white dwarf flashes (light)
 *   audioSwell        -> gas density (slow)
 *   audioLevel        -> brightness
 *
 * Per-activation variety: speedP, thickP (shell thickness), hueP.
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
uniform float audioKick;
uniform float audioSwell;
uniform float audioLevel;
uniform float audioChromaHue;
uniform float audioValence;

uniform float speedP;
uniform float thickP;
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

float hash13(vec3 p) { p = fract(p * 0.3183099 + vec3(0.71, 0.113, 0.419)); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float noise3(vec3 x)
{
    vec3 i = floor(x), f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(hash13(i), hash13(i + vec3(1, 0, 0)), f.x), mix(hash13(i + vec3(0, 1, 0)), hash13(i + vec3(1, 1, 0)), f.x), f.y),
               mix(mix(hash13(i + vec3(0, 0, 1)), hash13(i + vec3(1, 0, 1)), f.x), mix(hash13(i + vec3(0, 1, 1)), hash13(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}
float fbm(vec3 p)
{
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 4; ++i) { v += a * noise3(p); p = p * 2.03 + 5.0; a *= 0.5; }
    return v;
}

void main()
{
    float aspect = resolution.x / resolution.y;
    vec2 p = (gl_FragCoord.xy / resolution - 0.5) * vec2(aspect, 1.0);

    float hue = (hueP > 0.001) ? hueP : 0.0;
    float thick = 0.06 + 0.08 * clamp(thickP, 0.0, 1.0);
    const float L = 0.6931472;                    // ln 2: one shell inward
    float zoom = sceneAdvance * 0.18 * (speedP > 0.05 ? speedP : 1.0) + sceneTime * 0.03;
    float m = floor(zoom / L);
    float zf = zoom - m * L;

    // Camera on the axis at distance D from the star, flying inward; the
    // shells are at radii R_k = 2^k.  In log space we are at -zf: the
    // configuration repeats every ln 2, and the wrap moves every shell to
    // the next one's place (with its band index shifting by one), so the
    // picture is identical.
    float D = 6.0 * exp(-zf);
    vec3 ro = vec3(0.0, 0.0, -D);
    vec3 rd = normalize(vec3(p.x, p.y, 1.2));
    // The shell we are just outside of has index m; shells m-3 .. m+2 visible.
    vec3 col = vec3(0.0);
    float trans = 1.0;
    // Central star.
    vec3 toStar = normalize(-ro);
    float core = exp(-acos(clamp(dot(rd, toStar), -1.0, 1.0)) * 40.0 / max(D, 0.5));
    vec3 starCol = vec3(0.85, 0.9, 1.0);

    for (int k = 3; k >= -3; --k)
    {
        float R = 6.0 * exp(-zf) * exp(float(k) * L) * 0.55;    // radii relative to the camera distance
        // Ray-sphere: |ro + t rd| = R.
        float b = dot(ro, rd);
        float cc = dot(ro, ro) - R * R;
        float disc = b * b - cc;
        if (disc < 0.0) continue;
        float sq = sqrt(disc);
        float tA = -b - sq, tB = -b + sq;
        // Band for this shell: the absolute shell index m + k, wrapped over 32
        // bands in a fixed way so the wrap of zf keeps the band with the shell.
        int band = int(mod(float(m) + float(k) + 16.0, 32.0));
        float e = clamp(audioSpectrum[band] * 1.6, 0.0, 1.0);
        vec3 shellCol = imgPalette(hue * 0.159 + float(band) / 32.0 * 0.8) * (0.25 + 1.4 * e);
        // Two crossings (front and back of the shell), each a thin glowing
        // layer mottled by fbm on the sphere.
        for (int s = 0; s < 2; ++s)
        {
            float t = (s == 0) ? tA : tB;
            if (t < 0.0) continue;
            vec3 h = (ro + rd * t) / R;                      // point on the unit sphere
            float mottle = fbm(h * 4.0 + float(k) * 1.3 + vec3(0.0, sceneTime * 0.02, 0.0));
            float gas = smoothstep(0.35, 0.7, mottle) * (0.6 + 0.6 * clamp(audioSwell, 0.0, 1.0));
            // Grazing rays pass through more gas (limb brightening).
            float graze = 1.0 / max(abs(dot(normalize(ro + rd * t), rd)), 0.2);
            float a = clamp(gas * thick * graze * 2.5, 0.0, 0.85);
            float depthFade = exp(-t * 0.08);
            col += shellCol * a * trans * depthFade * 1.6;
            trans *= 1.0 - a * 0.6;
        }
    }
    // The white dwarf, seen through whatever gas is in front.
    col += starCol * core * (2.0 + 3.0 * audioKick) * trans;
    col += starCol * exp(-length(p) * 3.0) * 0.08 * trans;
    // Faint far stars.
    vec2 su = p * 60.0; vec2 cell = floor(su); vec2 f = fract(su) - 0.5;
    float hs = hash13(vec3(cell, 1.0));
    vec2 off = vec2(hash13(vec3(cell, 2.0)), hash13(vec3(cell, 3.0))) - 0.5;
    col += vec3(smoothstep(0.14, 0.02, length(f - off * 0.6)) * step(0.978, hs)) * 0.5 * trans;
    col *= 0.8 + 0.5 * audioLevel;

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
