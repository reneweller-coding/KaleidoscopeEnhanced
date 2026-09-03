#version 330 core
out vec4 fragColor;
/**
 * @file SpiderOrbWebDew.frag
 * @brief SPIDER ORB WEB WITH DEW: an orb web at dawn, strung with dew.
 * The web is built over the scene arc the way a spider builds it -- radii
 * first, then the spiral from the hub outward; each radius belongs to a
 * spectrum band and glows with it; the dew drops (round, on the spiral)
 * sparkle with the treble; the sun rises behind on the swell; the photo
 * is the garden out of focus.  Camera still.
 *
 * Audio Reactivity:
 *   sceneProgress     -> web construction (the arc)
 *   audioSpectrum[32] -> radius glow by band (light)
 *   audioHigh         -> dew sparkle (light)
 *   audioSwell        -> sunrise (slow)
 *   audioLevel        -> brightness
 *
 * Per-activation variety: radiiP, dewP, hueP.
 */
uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float sceneAdvance;
uniform float sceneTime;
uniform float sceneProgress;
uniform float audioAdvance;
uniform float audioSpectrum[32];
uniform float audioHigh;
uniform float audioSwell;
uniform float audioLevel;
uniform float audioChromaHue;
uniform float audioValence;

uniform float radiiP;
uniform float dewP;
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
float hash21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

void main()
{
    float aspect = resolution.x / resolution.y;
    vec2 p = (gl_FragCoord.xy / resolution - 0.5) * vec2(aspect, 1.0);

    float hue = (hueP > 0.001) ? hueP : 0.0;
    float nRadii = floor(18.0 + 14.0 * clamp(radiiP, 0.0, 1.0));      // once per activation
    float dewAmt = 0.5 + 0.5 * clamp(dewP, 0.0, 1.0);
    float prog = clamp(sceneProgress, 0.0, 1.0);
    float sun = clamp(audioSwell, 0.0, 1.0);
    float hi = clamp(audioHigh * 2.0, 0.0, 1.0);

    vec2 hub = vec2(0.05, 0.02);
    vec2 q = p - hub;
    float r = length(q);
    float a = atan(q.y, q.x);

    // The garden: the photo out of focus, dawn-lit; the sun low right.
    vec3 col = (interpolation * textureLod(tex0, gl_FragCoord.xy / resolution, 4.0) + (1.0 - interpolation) * textureLod(tex1, gl_FragCoord.xy / resolution, 4.0)).rgb;
    col = mix(col, col * imgPalette(hue * 0.159 + 0.55) * 1.5, 0.3) * (0.35 + 0.5 * sun);
    vec3 sunCol = vec3(1.0, 0.8, 0.55);
    col += sunCol * exp(-length(p - vec2(0.5, -0.05 + 0.25 * sun)) * 3.0) * (0.3 + 0.9 * sun);
    // Round bokeh highlights in the garden.
    vec2 bu = p * 9.0; vec2 bc = floor(bu); vec2 bf = fract(bu) - 0.5;
    vec2 bo = vec2(hash21(bc + 1.3), hash21(bc + 5.9)) - 0.5;
    col += sunCol * smoothstep(0.22, 0.18, length(bf - bo * 0.5)) * step(0.88, hash21(bc)) * 0.2 * sun;

    // Radii: built first (prog 0..0.35); radius i glows with its band.
    float radiiDone = smoothstep(0.0, 0.35, prog);
    float sector = 6.2831853 / nRadii;
    float ai = mod(a + 3.14159, sector) - sector * 0.5;
    float radIdx = floor((a + 3.14159) / sector);
    float distRad = abs(sin(ai)) * r;
    float radLen = 0.75 * radiiDone * (0.9 + 0.2 * hash11(radIdx * 3.3));
    float radius = smoothstep(0.0025, 0.0008, distRad) * step(r, radLen) * step(0.02, r);
    int band = int(mod(radIdx * 5.0, 32.0));
    float e = clamp(audioSpectrum[band] * 1.6, 0.0, 1.0);
    // The spiral: laid after the radii, from the hub outward with the arc;
    // the capture spiral r = k * theta with a per-turn wobble.
    float spiralDone = smoothstep(0.3, 0.95, prog);
    float pitch = 0.028;
    float turns = (a + 3.14159) / 6.2831853;
    float rTurn = fract((r / pitch) - turns);                  // position between spiral threads
    float spiralR = r;
    float spiral = smoothstep(0.12, 0.03, min(rTurn, 1.0 - rTurn)) * step(0.05, r) * step(r, 0.72 * spiralDone) * step(r, radLen + 0.02);
    // The web silk: pale, catching the sun; radii lit by their band.
    vec3 silk = mix(vec3(0.9, 0.9, 0.85), sunCol, 0.3 * sun);
    col = mix(col, silk * (0.5 + 0.5 * sun), spiral * 0.75);
    col = mix(col, silk * (0.6 + 0.6 * sun), radius * 0.85);
    col += imgPalette(hue * 0.159 + float(band) / 32.0) * radius * e * 1.2;
    // Dew: round drops on the spiral threads at hashed positions, sparkling.
    float threadIdx = floor(r / pitch - turns);
    vec2 dewCell = vec2(threadIdx, floor((a + 3.14159) * 9.0));
    float hasDew = step(1.0 - dewAmt * 0.6, hash21(dewCell));
    float along = fract((a + 3.14159) * 9.0) - 0.5;
    float dewD = length(vec2(along * r * 0.7, (rTurn - 0.5) * pitch));
    float dew = smoothstep(0.009, 0.004, dewD) * hasDew * step(r, 0.72 * spiralDone) * step(0.06, r);
    vec3 dewCol = mix(vec3(0.95, 0.98, 1.0), imgPalette(hue * 0.159 + 0.6), 0.2);
    col = mix(col, dewCol * (0.7 + 0.5 * sun), dew);
    col += dewCol * dew * hi * 1.2 + dewCol * exp(-dewD * 200.0) * hasDew * hi * 0.4 * step(r, 0.72 * spiralDone);
    // The hub and the spider.
    col = mix(col, vec3(0.1, 0.08, 0.06), smoothstep(0.03, 0.02, r) * 0.9);
    col *= 0.75 + 0.5 * audioLevel;

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
