#version 330 core
out vec4 fragColor;
/**
 * @file SelfSimilarityCorridor.frag
 * @brief SELF-SIMILARITY CORRIDOR: an endless corridor whose floor, ceiling
 * and walls are tiled with the song's own structure.  The host keeps a 256x256
 * self-similarity matrix (texSSM: ~90 s of feature history against itself).
 * Walking down the corridor is walking down one time axis; the other time
 * axis runs across it.  A returning chorus lays bright diagonal bands across
 * the floor, a section change is a dark threshold you step over, a loop is a
 * fine grid.  The corridor is generated from the music's memory, so no two
 * songs build the same hallway.
 *
 * Audio Reactivity:
 *   texSSM         -> every tile (the architecture itself)
 *   ssmHead        -> "now" is the near end; the corridor slides as time passes
 *   audioBeat      -> the nearest tile row lights up
 *   audioSwell     -> ceiling height (builds lift the roof)
 *   audioChromaHue -> palette
 *
 * Per-activation variety: scaleP (tiles per second of history), glowP, hueP.
 */
uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform sampler2D texSSM;       // 256x256 similarity, ring in both axes (unit 10)
uniform float ssmHead;          // ring head as 0..1 texture coordinate
uniform float ssmFill;          // 0..1 how much history exists yet
uniform float interpolation;

uniform float sceneAdvance;
uniform float sceneTime;
uniform float audioAdvance;
uniform float audioBeat;
uniform float audioSwell;
uniform float audioLevel;
uniform float audioBarPhase;
uniform float audioChromaHue;
uniform float audioValence;

uniform float scaleP;
uniform float glowP;
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

// Similarity between history positions a and b (each 0 = now .. 1 = oldest),
// unwrapped through the ring head so "now" is always at the same place.
float ssm(float a, float b)
{
    // h = 0 is the OLDEST stored moment and h = 1 is now, sampled as
    // h + ssmHead (wrap does the mod).  An age `a` is therefore 1 - a,
    // i.e. ssmHead - a.
    vec2 h = vec2(ssmHead - a, ssmHead - b);
    return texture(texSSM, h).r * min(ssmFill * 3.0, 1.0);
}

void main()
{
    float aspect = resolution.x / resolution.y;
    vec2 p = (gl_FragCoord.xy / resolution - 0.5) * vec2(aspect, 1.0);

    float sc  = (scaleP > 0.01) ? scaleP : 1.0;
    float glw = (glowP > 0.01) ? glowP : 1.0;
    float hue = (hueP > 0.001) ? hueP : 0.0;

    // A corridor of half-width 1 and half-height H, camera at the origin
    // looking down +z.  Each pixel's ray hits floor, ceiling or a wall.
    float H = 0.75 + 0.45 * audioSwell;
    vec2 sway = vec2(0.06 * sin(audioBarPhase * 6.2831853), 0.03 * cos(audioBarPhase * 12.566));
    vec3 rd = normalize(vec3(p.x + sway.x, p.y + sway.y, 1.35));
    float tF = (rd.y < 0.0) ? -H / rd.y : 1e9;   // floor
    float tC = (rd.y > 0.0) ?  H / rd.y : 1e9;   // ceiling
    float tW = 1.0 / max(abs(rd.x), 1e-4);        // walls at x = +-1
    float t  = min(min(tF, tC), tW);
    vec3 hit = rd * t;
    int  face = (t == tW) ? 2 : ((t == tF) ? 0 : 1);

    // Along the corridor = history (0 = now at the camera).  Across = the
    // other time axis, centred on now, so the diagonal (self-similarity of a
    // moment with itself) runs straight down the middle of the floor.
    float along  = hit.z * 0.030 * sc + sceneAdvance * 0.02;
    float across = ((face == 2) ? hit.y / H : hit.x) * 0.5;   // -0.5..0.5
    // The other axis is offset by a fixed lag plus the across position, so
    // the floor shows the BANDS of the matrix (this moment against moments
    // a few seconds to a minute back) instead of the diagonal cell, which
    // compares a moment with itself and drew as a black line.
    float a = along;
    float b = along + 0.12 * sc + across * 0.5 * sc;
    float sim = ssm(fract(a), fract(b));
    // Coarse section blocks on top of the fine stripes (reference scene).
    float simBig = ssm(fract(floor(a * 32.0) / 32.0 + 1.0 / 64.0), fract(floor(b * 32.0) / 32.0 + 1.0 / 64.0));
    sim = clamp(sim * 0.8 + simBig * 0.5, 0.0, 1.2);

    // Tiles: the matrix is 256 wide; draw grout lines at texel edges so the
    // hallway reads as tiled stone, not as a smooth gradient.
    vec2  cellUv = vec2(a, b) * 256.0;
    vec2  cf = abs(fract(cellUv) - 0.5);
    float grout = smoothstep(0.42, 0.5, max(cf.x, cf.y));

    // Bright tiles where the song resembles itself; dark thresholds where it
    // changed.  The near row pulses on the beat.
    float nearRow = exp(-hit.z * 0.9) * audioBeat;
    vec3 tileCol = imgPalette(hue * 0.159 + sim * 0.6 + float(face) * 0.11);
    vec3 col = tileCol * (0.24 + 1.4 * sim * glw + 0.5 * nearRow);
    col *= 1.0 - 0.45 * grout;

    // Light strips along the corridor edges, and a far-end glow that opens
    // with the level.
    float edge = exp(-abs(abs(hit.x) - 1.0) * 30.0) * float(face != 2)
               + exp(-abs(abs(hit.y) - H) * 30.0) * float(face == 2);
    col += imgPalette(hue * 0.159 + 0.8) * edge * 0.35;

    // Fog with distance (far = fogged, correct sign).
    float fog = 1.0 - exp(-hit.z * 0.03);
    col = mix(col, imgPalette(hue * 0.159 + 0.3) * (0.05 + 0.10 * audioLevel), fog);

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
