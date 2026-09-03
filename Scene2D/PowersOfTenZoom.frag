#version 330 core
out vec4 fragColor;
/**
 * @file PowersOfTenZoom.frag
 * @brief POWERS OF TEN ZOOM: the scale ladder as one endless zoom.  A moon
 * circles a planet, the planet circles a star, the star sits in a cluster,
 * the cluster in a galaxy, the galaxy in a group -- every level is a ring
 * of bodies around a centre, and the levels are self-similar in log-scale,
 * so the zoom out (or in) is periodic and never wraps visibly.  Each level
 * turns at its own rate on the scene clock; the bodies glow with the bands
 * of their level; the centre body is the photo.  The camera never jolts.
 *
 * Audio Reactivity:
 *   sceneAdvance      -> the zoom and the orbits (continuous, periodic)
 *   audioSpectrum[32] -> body glow per level (light)
 *   audioKick         -> the centre body flashes (light)
 *   audioSwell        -> haze (slow)
 *   audioLevel        -> brightness
 *
 * Per-activation variety: zoomP (rate), bodiesP (bodies per level), hueP.
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

uniform float zoomP;
uniform float bodiesP;
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

float hash11(float n) { return fract(sin(n * 127.1) * 43758.5453); }

void main()
{
    float aspect = resolution.x / resolution.y;
    vec2 p = (gl_FragCoord.xy / resolution - 0.5) * vec2(aspect, 1.0);

    float hue = (hueP > 0.001) ? hueP : 0.0;
    const float L = 2.3025851;                       // ln 10: one level
    float zoom = sceneAdvance * 0.12 * (zoomP > 0.05 ? zoomP : 1.0) + sceneTime * 0.025;
    float m = floor(zoom / L);
    float zf = zoom - m * L;
    int nBodies = 3 + int(clamp(bodiesP, 0.0, 1.0) * 4.0);

    // Levels k = -1 .. 2 relative to the current one; level k has orbit
    // radius R_k = 0.32 * 10^k * exp(-zf) on screen; the centre body of
    // level k is the whole system of level k-1.
    vec3 col = vec3(0.0);
    float r = length(p);
    float a = atan(p.y, p.x);
    for (int k = 2; k >= -1; --k)
    {
        float ls = float(k) * L - zf;
        float R = 0.55 * exp(ls);                      // orbit radius on screen
        if (R < 0.004 || R > 6.0) continue;
        float absLevel = float(m) + float(k);
        int band = int(mod(absLevel * 5.0 + 8.0, 32.0));
        float e = clamp(audioSpectrum[band] * 1.6, 0.0, 1.0);
        float rate = 0.25 * pow(2.2, -float(k));       // inner levels turn faster
        float turn = sceneAdvance * rate + hash11(absLevel * 3.1) * 6.28;
        vec3 levelCol = imgPalette(hue * 0.159 + fract(absLevel * 0.13));
        // Orbit ring, faint.
        float ring = exp(-abs(r - R) / (R * 0.03 + 0.002)) * 0.3;
        col += levelCol * ring * (0.3 + e);
        // Bodies on the orbit: round, sized to the level.
        for (int j = 0; j < 7; ++j)
        {
            if (j >= nBodies) break;
            float aj = turn + float(j) * 6.2831853 / float(nBodies) + hash11(absLevel * 7.7 + float(j)) * 0.3;
            vec2 c = vec2(cos(aj), sin(aj)) * R * (0.85 + 0.3 * hash11(float(j) * 5.3 + absLevel));
            float bs = R * (0.11 + 0.07 * hash11(float(j) * 9.1 + absLevel));
            float d = length(p - c);
            float body = smoothstep(bs, bs * 0.6, d);
            float glow = exp(-d / (bs * 3.0)) * 1.2;
            vec3 bc = mix(levelCol, img(fract(vec2(aj * 0.2, absLevel * 0.1))), 0.35);
            col += bc * (body * (1.2 + 1.0 * e) + glow * (0.3 + e));
        }
        // Haze of this level's disc (a galaxy's arms, a system's dust).
        float haze = exp(-pow((r - R * 0.7) / (R * 0.5), 2.0)) * (0.08 + 0.12 * clamp(audioSwell, 0.0, 1.0));
        col += levelCol * haze * (0.5 + 0.5 * cos(a * 2.0 - turn * 2.0));
    }
    // The centre body: the photo, glowing; flashes on the kick.
    float cr = 0.55 * exp(-1.0 * L - zf) * 0.55 + 0.02;     // the innermost visible body
    float core = smoothstep(cr, cr * 0.7, r);
    col = mix(col, img(fract(p / max(cr, 0.02) * 0.5 + 0.5)) * 1.3, core);
    col += imgPalette(hue * 0.159 + 0.95) * exp(-r / max(cr, 0.02)) * (0.3 + 1.2 * audioKick);
    // Deep space with round stars.
    vec2 su = p * 60.0; vec2 cell = floor(su); vec2 f = fract(su) - 0.5;
    vec2 off = vec2(hash11(dot(cell, vec2(1.0, 57.0)) + 3.1), hash11(dot(cell, vec2(1.0, 57.0)) + 7.7)) - 0.5;
    col += vec3(smoothstep(0.15, 0.02, length(f - off * 0.6)) * step(0.98, hash11(dot(cell, vec2(1.0, 57.0))))) * 0.5;
    col *= 0.75 + 0.5 * audioLevel;

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
