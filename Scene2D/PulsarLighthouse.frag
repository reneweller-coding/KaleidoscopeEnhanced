#version 330 core
out vec4 fragColor;
/**
 * @file PulsarLighthouse.frag
 * @brief PULSAR LIGHTHOUSE: we stand on a dark plain under a pulsar.  Its
 * beam cone sweeps around once per beat -- the beat phase IS the rotation
 * angle, so the sweep is locked to the music without a single jump -- and
 * every time the cone crosses the camera the whole landscape is lit for an
 * instant: the plain, the nebula, the dust in the air.  Three cones turn
 * together: a kick cone, a snare cone and a hat cone, each in its own
 * colour and each only as bright as its instrument is playing.  The camera
 * never moves; only the light does.
 *
 * Audio Reactivity:
 *   audioBeatPhase        -> cone angle (continuous; cos/sin of the phase)
 *   audioKick/Snare/Hat   -> brightness of the three cones (light)
 *   audioLevel            -> nebula glow
 *   audioSwell            -> haze density (slow)
 *   sceneAdvance          -> slow drift of the nebula
 *
 * Per-activation variety: heightP (pulsar height), tiltP (cone tilt), hueP.
 */
uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float sceneAdvance;
uniform float sceneTime;
uniform float audioAdvance;
uniform float audioBeatPhase;
uniform float audioKick;
uniform float audioSnare;
uniform float audioHat;
uniform float audioLevel;
uniform float audioSwell;
uniform float audioChromaHue;
uniform float audioValence;

uniform float heightP;
uniform float tiltP;
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
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x),
               mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), f.x), f.y);
}
float fbm(vec2 p)
{
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 4; ++i) { v += a * noise2(p); p = p * 2.03 + 7.0; a *= 0.5; }
    return v;
}

// How much a cone pointing along `axis` lights the direction `d`.
float coneLight(vec3 d, vec3 axis, float width)
{
    float c = dot(d, axis);
    return pow(clamp(c, 0.0, 1.0), width);
}

void main()
{
    float aspect = resolution.x / resolution.y;
    vec2 p = (gl_FragCoord.xy / resolution - 0.5) * vec2(aspect, 1.0);

    float hue = (hueP > 0.001) ? hueP : 0.0;
    float hgt = 1.6 + 1.2 * clamp(heightP, 0.0, 1.0);
    float tilt = 0.25 + 0.35 * clamp(tiltP, 0.0, 1.0);

    // The pulsar hangs above and ahead; its beams rotate about a tilted axis
    // with the beat phase (angle = 2 pi phase, continuous across the wrap).
    vec3 pulsar = vec3(0.0, hgt, 5.0);
    float ph = audioBeatPhase * 6.2831853;
    // Beam axes: three cones sharing the rotation, offset around the axis.
    vec3 spinAxis = normalize(vec3(sin(tilt), cos(tilt), 0.0));
    vec3 u = normalize(cross(spinAxis, vec3(0.0, 0.0, 1.0)));
    vec3 w = cross(spinAxis, u);
    // Cones lean well down so they sweep the plain around the tower.
    vec3 beamK = normalize(u * cos(ph) + w * sin(ph) - spinAxis * 1.1);
    vec3 beamS = normalize(u * cos(ph + 2.094) + w * sin(ph + 2.094) - spinAxis * 1.1);
    vec3 beamH = normalize(u * cos(ph + 4.189) + w * sin(ph + 4.189) - spinAxis * 1.1);
    vec3 colK = imgPalette(hue * 0.159 + 0.05) * (0.3 + 1.7 * audioKick);
    vec3 colS = imgPalette(hue * 0.159 + 0.4)  * (0.2 + 1.5 * audioSnare);
    vec3 colH = imgPalette(hue * 0.159 + 0.75) * (0.15 + 1.2 * audioHat);

    // Camera on the plain, looking slightly up at the pulsar.
    vec3 ro = vec3(0.0, 0.6, 0.0);
    vec3 rd = normalize(vec3(p.x, p.y + 0.05, 1.2));

    vec3 col = vec3(0.0);
    // Ground plane y = 0: lit where a beam points at the hit point.
    if (rd.y < -0.001)
    {
        float t = -ro.y / rd.y;
        vec3 hit = ro + rd * t;
        vec3 toHit = normalize(hit - pulsar);
        float lit = 0.0;
        vec3 lightCol = vec3(0.0);
        lightCol += colK * (coneLight(toHit, beamK, 40.0) + 0.3 * coneLight(toHit, beamK, 6.0));
        lightCol += colS * (coneLight(toHit, beamS, 40.0) + 0.3 * coneLight(toHit, beamS, 6.0));
        lightCol += colH * (coneLight(toHit, beamH, 40.0) + 0.3 * coneLight(toHit, beamH, 6.0));
        float dist2 = dot(hit - pulsar, hit - pulsar);
        vec2 guv = hit.xz * 0.12 + vec2(0.5, sceneAdvance * 0.01);
        vec3 ground = img(fract(guv)) * 0.9 + 0.1;
        float rough = 0.6 + 0.4 * fbm(hit.xz * 0.8);
        col = ground * rough * (lightCol * 220.0 / (dist2 + 4.0) + 0.08);
        float fog = 1.0 - exp(-t * 0.05);
        col = mix(col, imgPalette(hue * 0.159 + 0.6) * 0.03, fog);
    }
    else
    {
        // Sky: nebula, stars, and the beams themselves as haze-lit cones.
        vec2 sk = rd.xy / max(rd.z, 0.05);
        float neb = fbm(sk * 1.5 + vec2(sceneAdvance * 0.02, 0.0));
        col = imgPalette(hue * 0.159 + 0.6) * neb * neb * (0.12 + 0.3 * audioLevel);
        vec2 cell = floor(sk * 80.0); vec2 f = fract(sk * 80.0) - 0.5;
        float hs = hash21(cell);
        col += vec3(step(0.984, hs) * exp(-dot(f, f) * 9.0)) * 0.6;
        // Beams in the haze: a ray through the sky is lit where it passes
        // close to a cone (a cheap volumetric: the angle between the ray and
        // the cone as seen from the pulsar, integrated along the ray).
        float haze = 0.25 + 0.5 * clamp(audioSwell, 0.0, 1.0);
        vec3 acc = vec3(0.0);
        for (int i = 1; i <= 24; ++i)
        {
            float t = float(i) * 0.6;
            vec3 pt = ro + rd * t;
            vec3 dv = normalize(pt - pulsar);
            float dd = dot(pt - pulsar, pt - pulsar);
            acc += (colK * coneLight(dv, beamK, 260.0) + colS * coneLight(dv, beamS, 260.0) + colH * coneLight(dv, beamH, 260.0)) / (dd + 1.0);
        }
        col += acc * haze * 8.0;
        // The pulsar itself.
        vec3 toP = normalize(pulsar - ro);
        float core = exp(-acos(clamp(dot(rd, toP), -1.0, 1.0)) * 80.0);
        col += vec3(1.0, 0.95, 0.85) * core * 2.0 + imgPalette(hue * 0.159 + 0.9) * exp(-acos(clamp(dot(rd, toP), -1.0, 1.0)) * 12.0) * 0.4;
    }

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
