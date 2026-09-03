#version 330 core
out vec4 fragColor;
/**
 * @file KleinBottleFlythrough.frag
 * @brief KLEIN BOTTLE FLYTHROUGH: a ray-marched flight through a bottle
 * whose neck bends over and re-enters its own body.  The camera rides a
 * closed loop that runs down the neck, through the wall into the belly and
 * out again, so "inside" and "outside" trade places every lap without a
 * cut: the wall you fly along is the same wall you just flew through.  The
 * surface is glass-lit from within; the photo is laid over it as a
 * triplanar skin.  Flight on the music's pace, the bottle breathing slowly
 * on the swell -- no fast signal touches the geometry.
 *
 * Audio Reactivity:
 *   sceneAdvance -> flight along the loop (continuous, periodic)
 *   audioSwell   -> the bottle inflates (slow)
 *   audioKick    -> inner light flashes
 *   audioLevel   -> glass brightness
 *   audioMelodyPitch -> tint of the inner light
 *
 * Per-activation variety: neckP (neck radius), speedP, hueP.
 */
uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float sceneAdvance;
uniform float sceneTime;
uniform float audioAdvance;
uniform float audioSwell;
uniform float audioKick;
uniform float audioLevel;
uniform float audioMelodyPitch;
uniform float audioChromaHue;
uniform float audioValence;

uniform float neckP;
uniform float speedP;
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

float sdTorus(vec3 p, float R, float r) { vec2 q = vec2(length(p.xz) - R, p.y); return length(q) - r; }
float smin(float a, float b, float k) { float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0); return mix(b, a, h) - k * h * (1.0 - h); }

// The bottle: a fat torus body in the xz plane and a thinner torus neck in
// the xy plane that loops over the top and pierces the body.  Their smooth
// union is one surface that passes through itself.
float bottle(vec3 p, float neck, float inflate)
{
    float body = sdTorus(p, 2.2, 0.95 * inflate);
    vec3 q = vec3(p.x - 1.2, p.z, p.y - 0.6);            // neck torus: axis along z, centred right
    float nk = sdTorus(q, 2.0, neck * inflate);
    return smin(body, nk, 0.5);
}

vec3 normalAt(vec3 p, float neck, float inflate)
{
    const vec2 e = vec2(0.01, 0.0);
    return normalize(vec3(bottle(p + e.xyy, neck, inflate) - bottle(p - e.xyy, neck, inflate),
                          bottle(p + e.yxy, neck, inflate) - bottle(p - e.yxy, neck, inflate),
                          bottle(p + e.yyx, neck, inflate) - bottle(p - e.yyx, neck, inflate)));
}

// The camera loop: the centre line of the neck torus, which runs through
// the body.  Angle s around that torus.
vec3 loopPos(float s)
{
    return vec3(1.2 + 2.0 * cos(s), 0.6 + 2.0 * sin(s), 0.0);
}

vec3 triplanar(vec3 p, vec3 n)
{
    vec3 w = abs(n); w /= (w.x + w.y + w.z);
    // Mirrored repeat: no seam lines across the tube.
    vec2 a = abs(fract(p.yz * 0.125) * 2.0 - 1.0), b = abs(fract(p.xz * 0.125) * 2.0 - 1.0), c = abs(fract(p.xy * 0.125) * 2.0 - 1.0);
    return img(a) * w.x + img(b) * w.y + img(c) * w.z;
}

void main()
{
    float aspect = resolution.x / resolution.y;
    vec2 p = (gl_FragCoord.xy / resolution - 0.5) * vec2(aspect, 1.0);

    float hue = (hueP > 0.001) ? hueP : 0.0;
    float neck = 0.45 + 0.2 * clamp(neckP, 0.0, 1.0);
    float inflate = 1.0 + 0.12 * clamp(audioSwell, 0.0, 1.0);

    // Flight: the camera slides along the loop, looking ahead.
    float s = sceneAdvance * 0.28 * (speedP > 0.05 ? speedP : 1.0) + sceneTime * 0.05;
    vec3 ro = loopPos(s);
    vec3 ahead = loopPos(s + 0.25);
    vec3 fw = normalize(ahead - ro);
    vec3 up0 = vec3(0.0, 0.0, 1.0);
    vec3 rt = normalize(cross(fw, up0));
    vec3 up = cross(rt, fw);
    vec3 rd = normalize(fw * 1.3 + rt * p.x + up * p.y);

    // Are we inside the surface?  Then march the wall from within (flip sign).
    float sideSign = (bottle(ro, neck, inflate) < 0.0) ? -1.0 : 1.0;

    float t = 0.02;
    float d = 1.0;
    vec3 pos = ro;
    for (int i = 0; i < 80; ++i)
    {
        pos = ro + rd * t;
        d = sideSign * bottle(pos, neck, inflate);
        if (d < 0.003) break;
        t += d * 0.8;
        if (t > 30.0) break;
    }

    vec3 col;
    if (d < 0.003)
    {
        vec3 n = sideSign * normalAt(pos, neck, inflate);
        // Inner light: a warm lamp at the body's centre and a cool one in
        // the neck, tinted by the melody.
        vec3 lampA = vec3(0.0, 0.0, 0.0), lampB = vec3(1.2, 0.6, 0.0);
        vec3 la = lampA - pos, lb = lampB - pos;
        float ia = 3.0 / (dot(la, la) + 0.5), ib = 2.0 / (dot(lb, lb) + 0.5);
        vec3 lightCol = imgPalette(hue * 0.159 + 0.1 + 0.3 * audioMelodyPitch) * ia * (1.0 + 1.5 * audioKick)
                      + imgPalette(hue * 0.159 + 0.6) * ib;
        float fres = pow(1.0 - clamp(dot(-rd, n), 0.0, 1.0), 3.0);
        vec3 skin = triplanar(pos, n);
        col = skin * (0.3 + 0.6 * audioLevel) * (0.4 + 0.6 * clamp(dot(n, normalize(la)), 0.0, 1.0));
        col += lightCol * (0.5 + 0.5 * fres) * 1.2;
        // Meridian lines on the glass so the surface reads as a surface.
        float mer = exp(-abs(fract(atan(pos.z, pos.x) * 2.5) - 0.5) * 30.0) + exp(-abs(fract(pos.y * 1.5) - 0.5) * 30.0);
        col += imgPalette(hue * 0.159 + 0.9) * mer * 0.15;
        col += imgPalette(hue * 0.159 + 0.85) * fres * 0.5;
        // Inside reads warmer, outside cooler, so the swap is felt.
        col *= (sideSign < 0.0) ? vec3(1.15, 1.0, 0.9) : vec3(0.9, 1.0, 1.15);
        float fog = 1.0 - exp(-t * 0.12);
        col = mix(col, imgPalette(hue * 0.159 + 0.6) * 0.05, fog);
    }
    else
    {
        // Sky: dark palette gradient with faint stars.
        col = imgPalette(hue * 0.159 + 0.6) * 0.05 * (1.0 + rd.y);
        vec2 sk = rd.xy / max(abs(rd.z), 0.2);
        vec2 cell = floor(sk * 60.0); vec2 f = fract(sk * 60.0) - 0.5;
        float hs = fract(sin(dot(cell, vec2(127.1, 311.7))) * 43758.5453);
        col += vec3(step(0.985, hs) * exp(-dot(f, f) * 9.0)) * 0.5;
    }

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
