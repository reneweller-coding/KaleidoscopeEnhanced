#version 330 core
out vec4 fragColor;
/**
 * @file Starfield.frag
 * @brief Flying INTO the source image: the picture rushes past in looping nebula
 * layers while a star warp-field sparkles on top.  Now with:
 *   * WARP STREAKS: on each beat the stars stretch into radial light trails
 *     (classic warp-jump), longer for nearer stars;
 *   * image-coloured, twinkling stars (imgPal tint);
 *   * THREE nebula layers with differential roll (parallax) and per-depth
 *     hue rotation, swept gently once per bar;
 *   * a soft core glow breathing with the slow swell.
 * Accelerates with the music (audioAdvance), rolls with the audio phase
 * (jump-free); per-activation star density / speed / roll variety.
 */
uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float audioBeat;
uniform float audioLevel;
uniform float audioSwell;
uniform float audioBarPhase;
uniform float audioAdvance;
uniform float audioPhase;

// Per-activation variety (re-rolled each activation; 0 = default):
uniform float densP;           // star density threshold (0 -> 0.92; 0.88 = dense, 0.95 = sparse)
uniform float speedP;          // flight speed multiplier (0 -> 1.0; 0.6..1.6)
uniform float rollP;           // differential layer roll  (0 -> none; up to ~0.3)

const float PI = 3.14159265358979;

vec3 img(vec2 uv) { return (interpolation * texture(tex0, uv)
                          + (1.0 - interpolation) * texture(tex1, uv)).rgb; }

vec3 imgPal(float x)
{
    vec2 cc = vec2(0.5) + 0.32 * vec2(cos(time * 0.045 + audioPhase * 0.12),
                                      sin(time * 0.033 + audioPhase * 0.09));
    return img(fract(cc + 0.24 * vec2(cos(x), sin(x * 1.31))));
}

vec3 hueRot(vec3 c, float a)
{
    vec3  k = vec3(0.57735026919);
    float cs = cos(a), sn = sin(a);
    return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
}

float hash21(vec2 p)
{
    p = fract(p * vec2(123.34, 345.45));
    p += dot(p, p + 34.345);
    return fract(p.x * p.y);
}

mat2 rotM(float a) { return mat2(cos(a), -sin(a), sin(a), cos(a)); }

void main()
{
    vec2 uv = (gl_FragCoord.xy - 0.5 * resolution.xy) / resolution.y;

    // Per-activation character (constant during the scene):
    float dens   = (densP  <= 0.01) ? 0.92 : densP;
    float speedV = (speedP <= 0.01) ? 1.0  : speedP;

    float speed = (time * 0.25 + audioAdvance * 3.5 + audioPhase * 0.5) * speedV;
    float baseRot = audioPhase * 0.2 + time * 0.03;

    // Nebula: three looping depth layers of the image rushing toward the
    // camera, each rolled a little differently (parallax) and hue-shifted by
    // depth, swept gently once per bar (continuous at the wrap).
    vec3 col = vec3(0.0);
    for (int k = 0; k < 3; k++)
    {
        float fk = float(k);
        vec2 ruv = rotM(baseRot * (1.0 + rollP * fk)) * uv;
        float depth = fract(speed * 0.06 + fk / 3.0);         // 0..1 loop
        float zscale = mix(2.2, 0.15, depth);                 // zoom in as depth -> 1
        vec2  iuv = ruv * zscale * 0.5 + 0.5;
        float fade = sin(depth * PI);
        vec3  layer = img(fract(iuv)) * fade * (0.32 + 0.42 * audioLevel);
        layer = hueRot(layer, (depth - 0.5) * 0.5
                              + 0.30 * sin(audioBarPhase * 2.0 * PI));
        col += layer;
    }

    // Star warp-field: stars stretch into radial trails on the beat (longer
    // when nearer), coloured by the image, twinkling.
    vec3 stars = vec3(0.0);
    for (int i = 0; i < 4; i++)
    {
        float fi    = float(i);
        vec2  ruv   = rotM(baseRot) * uv;
        float depth = fract(speed * 0.12 + fi * 0.25);
        float scale = mix(18.0, 0.6, depth);
        vec2  g  = ruv * scale + fi * 37.2;
        vec2  gi = floor(g);
        vec2  gf = fract(g) - 0.5;
        float h  = hash21(gi);

        // Radial direction of this star cell (for the warp trail).
        vec2  cellPos = (gi + 0.5 - fi * 37.2) / scale;
        vec2  dir     = cellPos / max(length(cellPos), 1e-3);
        float trail   = 0.05 + 0.55 * audioBeat * depth;      // beat -> warp jump
        vec2  dv      = gf - dir * clamp(dot(gf, dir), -trail, trail);

        float star = step(dens, h) * smoothstep(0.17, 0.02, length(dv));
        float fade = sin(depth * PI);
        float tw   = 0.72 + 0.28 * sin(time * 3.0 + h * 40.0);   // twinkle
        vec3  sc   = mix(vec3(0.95, 0.97, 1.08), imgPal(h * 6.0) * 1.5, 0.45);
        stars += star * fade * tw * sc * (0.6 + 0.8 * audioLevel);
    }
    col += stars;

    // Soft core glow: the destination breathing with the slow swell.
    col += vec3(0.85, 0.92, 1.10) * exp(-3.0 * dot(uv, uv))
         * (0.10 + 0.35 * audioSwell);

    col += audioBeat * 0.12;
    // Catalogue review: soft-knee exposure — hot audio compresses
    // instead of clipping the whole frame to white.
    vec3 _catTone = (clamp(col, 0.0, 1.0)) * 0.75;
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(_catTone, 1.0);
}
