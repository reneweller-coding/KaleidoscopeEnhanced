#version 330 core
out vec4 fragColor;
/**
 * @file TidalLockTerminator.frag
 * @brief TIDAL LOCK TERMINATOR: a flight along the day/night line of a
 * tidally locked planet.  The world turns under the camera on the music's
 * pace, so the terminator -- a band of long shadows, glowing cloud tops
 * and the first lights of the eternal night -- streams past forever.  The
 * host's day clock (dayPhase) shifts where the line falls; the valence of
 * the music is the weather on the day side (bright cumulus or a brooding
 * overcast); on the night side auroras breathe with the swell and storms
 * flash on the kick.  The camera never moves.
 *
 * Audio Reactivity:
 *   sceneAdvance -> the planet turns under the camera (continuous)
 *   dayPhase     -> the terminator drifts (very slow)
 *   audioValence -> day-side weather (light/colour)
 *   audioSwell   -> aurora on the night side (slow)
 *   audioKick    -> storm flashes on the night side (light)
 *   audioLevel   -> sunlight strength
 *
 * Per-activation variety: tiltP (view angle), cloudP (cloud cover), hueP.
 */
uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float sceneAdvance;
uniform float sceneTime;
uniform float audioAdvance;
uniform float dayPhase;
uniform float audioValence;
uniform float audioSwell;
uniform float audioKick;
uniform float audioLevel;
uniform float audioChromaHue;

uniform float tiltP;
uniform float cloudP;
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
float fbm3(vec3 p)
{
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 5; ++i) { v += a * noise3(p); p = p * 2.03 + 3.1; a *= 0.5; }
    return v;
}

void main()
{
    float aspect = resolution.x / resolution.y;
    vec2 p = (gl_FragCoord.xy / resolution - 0.5) * vec2(aspect, 1.0);

    float hue = (hueP > 0.001) ? hueP : 0.0;
    float tilt = 0.35 + 0.3 * clamp(tiltP, 0.0, 1.0);
    float cloudCover = 0.35 + 0.4 * clamp(cloudP, 0.0, 1.0);
    float val = clamp(audioValence, 0.0, 1.0);

    // A big sphere below and ahead; the camera looks down along the limb.
    vec3 ro = vec3(0.0, 0.0, 0.0);
    vec3 rd = normalize(vec3(p.x, p.y - tilt, 1.0));
    vec3 C = vec3(0.0, -3.3, 2.2);
    const float R = 3.0;
    vec3 oc = ro - C;
    float b = dot(oc, rd);
    float c = dot(oc, oc) - R * R;
    float disc = b * b - c;

    // Sun direction: the terminator runs across the view; dayPhase turns it
    // slowly (a 4.7-minute cycle, continuous through the wrap).
    float dp = dayPhase * 6.2831853;
    vec3 sunDir = normalize(vec3(cos(dp * 0.5 + 0.6) * 0.9, 0.35 + 0.15 * sin(dp), -0.4 + 0.5 * cos(dp * 0.5 + 0.6)));

    vec3 col;
    if (disc > 0.0)
    {
        float t = -b - sqrt(disc);
        vec3 pos = ro + rd * t;
        vec3 n = normalize(pos - C);
        // The planet turns under us: rotate the surface sample about the
        // planet's axis on the scene clock.
        float a = sceneAdvance * 0.12 + sceneTime * 0.02;
        vec3 sp = n;
        sp = vec3(cos(a) * sp.x - sin(a) * sp.z, sp.y, sin(a) * sp.x + cos(a) * sp.z);

        float land = fbm3(sp * 3.0);
        float sea = smoothstep(0.42, 0.5, land);
        float mountains = fbm3(sp * 9.0 + 4.0) * sea;
        vec3 seaCol  = imgPalette(hue * 0.159 + 0.55) * 0.5;
        vec3 landCol = mix(imgPalette(hue * 0.159 + 0.25), imgPalette(hue * 0.159 + 0.1), mountains) * 0.8;
        vec3 ground = mix(seaCol, landCol, sea);
        // Weather: valence chooses bright cumulus or a brooding overcast.
        float cl = fbm3(sp * 5.0 + vec3(0.0, sceneAdvance * 0.03, 0.0));
        float clouds = smoothstep(1.0 - cloudCover, 1.0 - cloudCover + 0.25, cl);
        vec3 cloudCol = mix(vec3(0.55, 0.55, 0.6), vec3(1.0, 0.98, 0.95), val);
        vec3 surf = mix(ground, cloudCol, clouds);

        float sun = dot(n, sunDir);
        float day = smoothstep(-0.08, 0.15, sun);
        // Terminator band: long shadows and gold light.
        float term = exp(-sun * sun * 60.0);
        vec3 dayLight = surf * (0.15 + 1.1 * max(sun, 0.0)) * (0.7 + 0.5 * audioLevel);
        dayLight += imgPalette(hue * 0.159 + 0.08) * term * 0.6;
        // Night side: dark, an aurora breathing on the swell, storms flashing.
        float aur = fbm3(sp * 6.0 + vec3(sceneTime * 0.1, 0.0, 0.0));
        aur = pow(smoothstep(0.45, 0.7, aur), 2.0) * (0.2 + 0.8 * clamp(audioSwell, 0.0, 1.0));
        vec3 night = surf * 0.02 + imgPalette(hue * 0.159 + 0.45) * aur * 0.7;
        float storm = smoothstep(0.62, 0.7, cl) * audioKick;
        night += vec3(0.9, 0.9, 1.0) * storm * 0.8;
        col = mix(night, dayLight, day);
        // Atmosphere rim.
        float rim = pow(1.0 - max(dot(-rd, n), 0.0), 3.0);
        col += imgPalette(hue * 0.159 + 0.6) * rim * (0.3 + 0.6 * day);
    }
    else
    {
        // Space: stars and the corona of the star beyond the limb.
        vec2 sk = rd.xy / max(rd.z, 0.1);
        vec2 cell = floor(sk * 90.0); vec2 f = fract(sk * 90.0) - 0.5;
        float hs = fract(sin(dot(cell, vec2(127.1, 311.7))) * 43758.5453);
        col = vec3(step(0.986, hs) * exp(-dot(f, f) * 9.0)) * 0.6;
        float glow = pow(max(dot(rd, sunDir), 0.0), 8.0);
        col += imgPalette(hue * 0.159 + 0.08) * glow * 0.5;
        // Atmosphere halo just outside the limb.
        float limb = exp(-abs(sqrt(max(-disc, 0.0))) * 6.0);
        col += imgPalette(hue * 0.159 + 0.6) * limb * 0.5;
    }

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
