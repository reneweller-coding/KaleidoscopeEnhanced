#version 330 core
out vec4 fragColor;
/**
 * @file MuonTomographyPyramid.frag
 * @brief MUON TOMOGRAPHY PYRAMID: seeing through a pyramid with cosmic
 * rays.  Muons rain from the sky in straight tracks (light events on the
 * scene clock); where a track crosses less stone it survives, so over the
 * arc the hidden chamber -- the photo -- resolves inside the silhouette
 * as the region of excess flux.  The kick is a bright track, the bass the
 * detector glow beneath, the treble the scintillator sparkle.  Camera
 * still.
 *
 * Audio Reactivity:
 *   sceneProgress -> chamber resolves (the arc)
 *   sceneAdvance  -> muon tracks (continuous)
 *   audioKick     -> bright track (light)
 *   audioBass     -> detector glow (light)
 *   audioHigh     -> scintillator sparkle (light)
 *   audioLevel    -> brightness
 *
 * Per-activation variety: rateP, chamberP, hueP.
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
uniform float audioKick;
uniform float audioBass;
uniform float audioHigh;
uniform float audioLevel;
uniform float audioChromaHue;
uniform float audioValence;

uniform float rateP;
uniform float chamberP;
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
    float rate = 0.6 + 0.8 * clamp(rateP, 0.0, 1.0);
    float prog = clamp(sceneProgress, 0.0, 1.0);
    float clock = sceneAdvance * 0.5 + sceneTime * 0.1;
    float bass = clamp(audioBass, 0.0, 1.0);

    // The pyramid: a triangle on the ground line, apex at the top.
    float ground = -0.38;
    float apexY = 0.42;
    float halfBase = 0.7;
    float py = (p.y - ground) / (apexY - ground);
    float inside = step(0.0, py) * step(py, 1.0) * step(abs(p.x), halfBase * (1.0 - py));
    // The hidden chamber: a rectangle inside, sized by chamberP.
    vec2 cc = vec2(0.05, ground + 0.28);
    vec2 cs = vec2(0.18 + 0.1 * clamp(chamberP, 0.0, 1.0), 0.1);
    float chamber = step(abs(p.x - cc.x), cs.x) * step(abs(p.y - cc.y), cs.y);
    float chamberSoft = smoothstep(cs.x + 0.05, cs.x, abs(p.x - cc.x)) * smoothstep(cs.y + 0.05, cs.y, abs(p.y - cc.y));

    // Night sky with round stars.
    vec3 col = vec3(0.01, 0.012, 0.03);
    vec2 su = p * 90.0; vec2 sc = floor(su); vec2 sf = fract(su) - 0.5;
    vec2 so = vec2(hash21(sc + 1.3), hash21(sc + 5.9)) - 0.5;
    col += vec3(0.7) * smoothstep(0.14, 0.03, length(sf - so * 0.6)) * step(0.985, hash21(sc)) * step(ground, p.y);
    // The desert ground and the detector beneath the pyramid, glowing with the bass.
    vec3 sand = vec3(0.22, 0.17, 0.1) * (0.6 + 0.4 * hash21(floor(p * 60.0)));
    col = mix(col, sand, step(p.y, ground));
    col += imgPalette(hue * 0.159 + 0.1) * exp(-length(p - vec2(0.0, ground - 0.08)) * 6.0) * (0.3 + 1.0 * bass);

    // Stone: the pyramid as dark blocks (the photo as their texture, faint).
    vec3 stone = img(vec2(p.x / aspect + 0.5, p.y + 0.5)) * 0.7 * vec3(0.9, 0.8, 0.65) + 0.04;
    stone *= 0.7 + 0.3 * step(0.5, fract(p.y * 30.0)) * step(0.5, fract(p.x * 20.0 + floor(p.y * 30.0) * 0.5));
    col = mix(col, stone, inside);
    // The flux map resolves over the arc: inside the chamber region the
    // photo appears (excess muons), fading in with the progress.
    vec3 reveal = img(clamp((p - cc + cs) / (2.0 * cs), 0.0, 1.0)) * 1.4;
    reveal = mix(reveal, reveal * imgPalette(hue * 0.159 + 0.5) * 1.5, 0.25);
    float resolved = smoothstep(0.1, 0.9, prog) * chamberSoft;
    col = mix(col, reveal, resolved * inside);
    // Muon tracks: straight lines from the sky, launched on the clock,
    // brighter where they pass through the chamber (less stone).
    for (int k = 0; k < 14; ++k)
    {
        float fk = float(k);
        float ph = fract(clock * rate * (0.5 + 0.5 * hash11(fk * 3.1)) + hash11(fk * 5.3));
        float idx = floor(clock * rate * (0.5 + 0.5 * hash11(fk * 3.1)) + hash11(fk * 5.3));
        float x0 = (hash11(fk * 7.7 + idx) - 0.5) * aspect * 1.2;
        float slope = (hash11(fk * 9.1 + idx) - 0.5) * 0.8;
        // The track is a line x = x0 + slope * (0.5 - y); its head descends with ph.
        float headY = 0.55 - ph * 1.1;
        float dx = abs(p.x - (x0 + slope * (0.5 - p.y)));
        float onLine = smoothstep(0.004, 0.001, dx) * step(headY, p.y) * step(p.y, 0.55);
        float tail = exp(-(p.y - headY) * 6.0);
        float throughChamber = chamber;
        float alive = mix(1.0, 0.35, inside * (1.0 - throughChamber));
        vec3 tc = mix(vec3(0.6, 0.85, 1.0), imgPalette(hue * 0.159 + 0.35), 0.4);
        col += tc * onLine * tail * alive * (1.2 + 0.8 * throughChamber) * (1.0 - smoothstep(0.85, 1.0, ph));
        if (k == 0) col += tc * onLine * tail * audioKick * 2.0;
    }
    // Scintillator sparkle at the detector (round), on the treble.
    vec2 gu = p * 50.0; vec2 gc = floor(gu); vec2 gf = fract(gu) - 0.5;
    vec2 go = vec2(hash21(gc + 1.3), hash21(gc + 5.9)) - 0.5;
    float spark = smoothstep(0.2, 0.05, length(gf - go * 0.6)) * step(0.92, hash21(gc)) * step(ground - 0.15, p.y) * step(p.y, ground) * step(abs(p.x), 0.5);
    col += vec3(0.7, 0.9, 1.0) * spark * clamp(audioHigh * 2.0, 0.0, 1.0);
    col *= 0.75 + 0.5 * audioLevel;

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
