#version 330 core
out vec4 fragColor;
/**
 * @file RaymarchTunnel.frag
 * @brief A ray-marched wormhole papered with the SOURCE IMAGE, mirror-folded around
 * the bore so the picture radiates in symmetric wedges.  Now with:
 *   * a per-activation SPIRAL TWIST of the fold (the wedges corkscrew away),
 *   * corrugated rib shading so the walls have depth,
 *   * TEMPO-LOCKED LIGHT RINGS racing down the bore on the continuous beat
 *     phase (they land ON the beat, travelling smoothly - no snapping),
 *   * a warm light at the end of the tunnel breathing with the slow swell,
 *   * image-driven hue variance (imgPal/hueRot) + a per-bar hue sweep.
 * Camera flight via audioAdvance/audioPhase (jump-free).
 */
uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float audioBeat;
uniform float audioLevel;
uniform float audioBass;
uniform float audioSwell;
uniform float audioBeatPhase;  // continuous beat phase -> travelling light rings
uniform float audioBarPhase;   // 0..1 per bar -> gentle hue sweep
uniform float audioValence;
uniform float audioCentroid;
uniform float audioAdvance;
uniform float audioPhase;

// Per-activation variety (re-rolled each activation; 0 = default):
uniform int   sidesP;          // mirror fold count (0 -> 6; 4..10)
uniform float twistP;          // spiral twist of the fold per depth unit (0 -> none)
uniform float snakeP;          // tunnel snaking amplitude (0 -> 0.35; 0.15..0.55)
uniform float audioChromaHue;

const float PI = 3.14159265358979;

vec3 img(vec2 uv) { return (interpolation * texture(tex0, uv)
                          + (1.0 - interpolation) * texture(tex1, uv)).rgb; }


// IMG-PALETTE (house standard): colours come from a rotating arc in the
// CURRENT slideshow image, so every activation inherits a fresh palette from
// the photos; the arc follows the musical key (audioChromaHue is circular-
// slewed = jump-free) with a slow advance drift, valence shapes saturation.
vec3 imgPalette(float t)
{
    float ang = audioChromaHue + audioAdvance * 0.04 + t * 6.2831853;
    float rad = 0.16 + 0.08 * sin(audioAdvance * 0.013);
    vec3  pc  = img(clamp(vec2(0.5) + rad * vec2(cos(ang), sin(ang)), 0.0, 1.0));
    float pg  = dot(pc, vec3(0.333));
    return mix(vec3(pg), pc, 0.55 + 0.45 * audioValence);
}

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

// Overall level of the photo currently on the texture units, from a fixed
// 5-tap grid. The bore is papered with the picture itself, so a bright photo
// left the tempo-locked rings and the light at the end of the tunnel no
// headroom at all. The probe rides the tex0/tex1 crossfade, so the gain it
// feeds can never pop, and being one number for the whole frame it rescales
// exposure without touching local contrast.
float photoLevel()
{
    vec3 s = img(vec2(0.25, 0.25)) + img(vec2(0.75, 0.25))
           + img(vec2(0.25, 0.75)) + img(vec2(0.75, 0.75))
           + img(vec2(0.50, 0.50));
    return dot(s * 0.2, vec3(0.299, 0.587, 0.114));
}

// Distance to the inside of a wobbling cylindrical tunnel wall.
float mapTunnel(vec3 p, float snake, float widen)
{
    p.xy += snake * vec2(sin(p.z * 0.30), cos(p.z * 0.25));  // tunnel snakes
    float radius = 1.0 + widen;
    return radius - length(p.xy);                            // >0 inside
}

void main()
{
    vec2 uv = (gl_FragCoord.xy - 0.5 * resolution.xy) / resolution.y;

    // Per-activation character (constant during the scene):
    float sides  = float((sidesP >= 3) ? sidesP : 6);
    float snakeV = (snakeP <= 0.01) ? 0.35 : snakeP;
    // Bore width breathes slowly with the swell (+ a whisper of bass).
    float widen  = 0.10 * audioSwell + 0.08 * audioBass;

    float fly = time * 1.2 + audioAdvance * 4.0;
    vec3 ro = vec3(0.0, 0.0, fly);
    float roll = audioPhase * 0.3 + time * 0.05;
    mat2 rot = mat2(cos(roll), -sin(roll), sin(roll), cos(roll));
    vec3 rd = normalize(vec3(rot * uv, 1.0));

    float t = 0.0;
    for (int i = 0; i < 48; i++)
    {
        vec3 p = ro + rd * t;
        float d = mapTunnel(p, snakeV, widen);
        if (d < 0.01 || t > 25.0) break;
        t += max(d * 0.6, 0.02);
    }

    vec3 hit = ro + rd * t;
    // Spiral twist: the fold angle advances with depth -> corkscrew wedges.
    float ang = atan(hit.y, hit.x) + hit.z * twistP;

    // Mirror-fold the angle so the image radiates in symmetric wedges (count
    // fixed per activation - audio-stepped folds snap).
    float seg   = 2.0 * PI / sides;
    float fang  = abs(mod(ang + PI, seg) - 0.5 * seg) / (0.5 * seg);   // 0..1 mirrored
    vec2  wuv   = vec2(fang, hit.z * 0.15);

    vec3 pic = img(fract(wuv));
    float fog = exp(-0.06 * t);

    // Corrugated ribs give the wall depth (static geometry shading).
    float rib = 0.86 + 0.14 * cos(fang * PI * 3.0 + hit.z * 2.0);

    // Hold the wall back to a fixed exposure. The bore fills the frame with one
    // sample of the picture, so a light photo pinned the whole tunnel near 1.0
    // and both the rings and the end-of-tunnel light were clipped off the top
    // of it. Rings and glow ride the SAME gain (they are imgPalette samples),
    // so their relationship to the wall is unchanged -- only the level moves.
    float expGain = clamp(0.28 / max(0.05, photoLevel()), 0.28, 2.4);

    vec3 col = pic * expGain * fog * rib * (0.75 + 0.9 * audioLevel);

    // Tempo-locked light rings racing down the bore: positioned by the
    // CONTINUOUS beat phase, so they travel smoothly and land on the beat.
    float ring = pow(0.5 + 0.5 * cos(2.0 * PI * (hit.z * 0.25 - audioBeatPhase - fly * 0.25)), 12.0);
    vec3  ringCol = imgPalette(0.30 * audioValence) * expGain * 1.7;
    col += min(ringCol * ring * fog * (0.25 + 0.75 * audioBeat), vec3(0.75));

    // Warm light at the end of the tunnel, breathing with the slow swell.
    float glow = exp(-2.6 * dot(uv, uv) / (0.4 + fog));
    col += min(imgPalette(0.30 * audioCentroid) * expGain * 1.7
               * glow * (1.0 - fog) * (0.25 + 0.45 * audioSwell), vec3(0.70));

    col += fog * audioBeat * 0.18;

    // Image-driven hue variance + per-bar sweep (continuous at the wrap).
    float himg = dot(imgPal(dot(col, vec3(0.333)) * 6.0 + fang * 2.0), vec3(0.333));
    col = hueRot(col, (himg - 0.5) * 2.0 + time * 0.04
                      + 0.35 * sin(audioBarPhase * 2.0 * PI));

    vec3 _catTone = clamp(col, 0.0, 1.0);
    _catTone /= 1.0 + 0.26 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(_catTone, 1.0);
}
