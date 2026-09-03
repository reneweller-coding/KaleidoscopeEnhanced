#version 330 core
out vec4 fragColor;
/**
 * @file VoronoiMirrorShatter.frag
 * @brief VORONOI MIRROR SHATTER: a mirror that breaks and mends over the
 * scene's arc.  The picture is cut into Voronoi shards; each shard is a
 * small kaleidoscope of the photo.  Along the arc (sceneProgress, which the
 * drop regie can bend onto the drop) the shards drift apart, tilt and let
 * the dark through, then close again -- a slow breakage, never a cut, so
 * the drop lands on the moment the mirror is most open.  Shard edges catch
 * light on the kick.
 *
 * Audio Reactivity:
 *   sceneProgress  -> shatter and reassembly (staged, continuous)
 *   audioKick      -> shard edges flash (light)
 *   audioSwell     -> the gaps glow (slow)
 *   sceneAdvance   -> the shards' kaleidoscopes turn (continuous)
 *   audioLevel     -> brightness
 *
 * Per-activation variety: shardsP (shard density), spreadP (how far apart), hueP.
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
uniform float audioSwell;
uniform float audioLevel;
uniform float audioChromaHue;
uniform float audioValence;

uniform float shardsP;
uniform float spreadP;
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

void main()
{
    float aspect = resolution.x / resolution.y;
    vec2 p = (gl_FragCoord.xy / resolution - 0.5) * vec2(aspect, 1.0);

    float hue = (hueP > 0.001) ? hueP : 0.0;
    float dens = 3.0 + 3.0 * clamp(shardsP, 0.0, 1.0);
    float spread = 0.5 + 0.7 * clamp(spreadP, 0.0, 1.0);
    // The arc: closed at the start, open in the middle, closed at the end.
    float open = pow(sin(clamp(sceneProgress, 0.0, 1.0) * 3.14159265), 1.5);

    // Voronoi shards, each with its own drift direction; the shard that owns
    // this pixel is found in the DRIFTED layout, so the gaps are real gaps.
    vec2 c = p * dens;
    vec2 n = floor(c);
    float best = 1e9, second = 1e9;
    vec2 bestCell = n, bestCentre = vec2(0.0);
    for (int j = -2; j <= 2; ++j)
    for (int i = -2; i <= 2; ++i)
    {
        vec2 g = n + vec2(float(i), float(j));
        vec2 o = hash22(g);
        vec2 drift = (hash22(g + 7.0) - 0.5) * 2.0 * spread * open;
        vec2 centre = g + o + drift;
        float d = dot(c - centre, c - centre);
        if (d < best) { second = best; best = d; bestCell = g; bestCentre = centre; }
        else if (d < second) second = d;
    }
    float edge = sqrt(second) - sqrt(best);            // distance to the shard border
    // Gap: as the shards drift apart, the border widens into dark.
    float gapW = 0.02 + 0.22 * open;
    float inShard = smoothstep(gapW, gapW + 0.05, edge);

    // Each shard is a small kaleidoscope of the photo: fold around the shard
    // centre, turn on the scene clock.
    vec2 q = c - bestCentre;
    float nSides = 4.0 + floor(hash21(bestCell + 3.3) * 4.0);
    float rot = sceneAdvance * (0.1 + 0.2 * hash21(bestCell + 9.1)) * (hash21(bestCell + 1.1) > 0.5 ? 1.0 : -1.0);
    float a = atan(q.y, q.x) + rot;
    float sector = 6.2831853 / nSides;
    a = mod(a, sector); a = abs(a - sector * 0.5);
    vec2 k = length(q) * vec2(cos(a), sin(a));
    // Tilt: an open shard shows the photo shifted (it has turned away).
    vec2 tilt = (hash22(bestCell + 5.5) - 0.5) * 0.4 * open;
    vec2 uv = fract(k * 0.25 + hash22(bestCell) * 0.5 + tilt);
    vec3 tex = img(uv);
    vec3 tint = imgPalette(hue * 0.159 + hash21(bestCell + 2.2) * 0.3);
    vec3 shard = mix(tex, tex * tint * 1.8, 0.35) * (0.7 + 0.5 * audioLevel);

    // Edges catch the light, harder on the kick; the gaps glow on the swell.
    float rim = exp(-max(edge - gapW, 0.0) * 25.0);
    vec3 gapCol = imgPalette(hue * 0.159 + 0.6) * (0.03 + 0.12 * clamp(audioSwell, 0.0, 1.0)) * open;
    vec3 col = mix(gapCol, shard, inShard);
    col += imgPalette(hue * 0.159 + 0.9) * rim * inShard * (0.2 + 1.0 * audioKick);
    // A little photo showing through the gaps, darker (the wall behind).
    col += img(fract(p * 0.3 + 0.5)) * 0.08 * (1.0 - inShard);

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
