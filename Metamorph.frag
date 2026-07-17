// Metamorph.frag
// -----------------------------------------------------------------------
// The music-type ADAPTIVE effect: cross-fades between two personalities using
// the audioAmbient classifier (0 = beat music, 1 = drone/ambient), which
// changes over seconds — so the morph itself is a slow, seamless transition.
//
// Research-informed (crossmodal correspondence literature):
//   percussive music -> ANGULAR, crisp, spiky forms  => beat personality:
//     hard mirrored shards of the image, pulsing on the beat, a bar-phase
//     highlight sweeping the wedges;
//   harmonic/sustained music -> ROUND, soft forms    => drone personality:
//     softly domain-warped image clouds, breathing with the slow swell
//     (loudness -> looming/expansion).
// Image-forward + imgPal/hueRot colour variance like the rest of the set;
// jump-free motion (audioPhase/audioAdvance, never time*audio).
// -----------------------------------------------------------------------

uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float audioAmbient;   // 0 = beat music .. 1 = drone (slow classifier)
uniform float audioPhase;
uniform float audioAdvance;
uniform float audioBeat;
uniform float audioOnset;
uniform float audioBarPhase;
uniform float audioSwell;
uniform float audioLevel;
uniform float audioCentroid;
uniform float audioValence;

const float PI = 3.14159265358979;

mat2 rot(float a) { float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }
vec3 img(vec2 uv) { return (interpolation * texture2D(tex0, uv)
                          + (1.0 - interpolation) * texture2D(tex1, uv)).rgb; }

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
float vnoise(vec2 p)
{
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = hash21(i), b = hash21(i + vec2(1.0, 0.0));
    float c = hash21(i + vec2(0.0, 1.0)), d = hash21(i + vec2(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
float fbm(vec2 p)
{
    float s = 0.0, a = 0.5;
    for (int i = 0; i < 4; i++) { s += a * vnoise(p); p = p * 2.03 + vec2(1.7, 9.2); a *= 0.5; }
    return s;
}

vec2 kaleido(vec2 p, float sides)
{
    float a   = atan(p.y, p.x);
    float r   = length(p);
    float seg = PI / sides;
    a = mod(a + PI, 2.0 * seg) - seg;
    a = abs(a);
    return vec2(cos(a), sin(a)) * r;
}

void main()
{
    vec2 uv = gl_FragCoord.xy / resolution;
    vec2 p  = (gl_FragCoord.xy - 0.5 * resolution) / resolution.y;
    p = rot(audioPhase * 0.15 + time * 0.015) * p;

    // ---------- BEAT personality: angular mirrored shards ----------
    vec3 beatCol;
    {
        vec2 fp = kaleido(p, 6.0);
        // Angular folding: hard abs() creases give crisp, spiky geometry.
        vec2 q = fp * 3.0;
        q = abs(fract(q) - 0.5);
        float crease = min(q.x, q.y);
        float edges  = smoothstep(0.10, 0.02, crease);          // sharp lattice lines

        vec2 iuv = fp * 0.6 + 0.5 + (q - 0.25) * 0.15;
        vec3 pic = img(fract(iuv));

        // Bar-phase highlight sweeping the wedges; beat pops the whole lattice.
        float ang  = atan(p.y, p.x) / (2.0 * PI) + 0.5;
        float swp  = 0.5 + 0.5 * cos((ang - audioBarPhase) * 2.0 * PI);
        swp = swp * swp;

        beatCol = pic * (0.55 + 0.55 * audioBeat + 0.25 * audioOnset);
        beatCol += edges * imgPal(crease * 8.0) * (0.5 + 1.4 * audioBeat) * 1.4;
        beatCol *= 0.75 + 0.5 * swp;
    }

    // ---------- DRONE personality: soft breathing clouds ----------
    vec3 droneCol;
    {
        // Looming: the slow swell gently expands the view (loudness -> approach).
        vec2 dp = p / (1.0 + 0.10 * audioSwell);
        float t = time * 0.02 + audioAdvance * 0.15;
        vec2 warp = vec2(fbm(dp * 1.6 + vec2(0.0, t)),
                         fbm(dp * 1.6 + vec2(5.2, t * 1.1)));
        vec2 iuv = dp * 0.55 + 0.5 + (warp - 0.5) * 0.22;     // round, curved flow
        vec3 pic = img(fract(iuv));

        float glow = fbm(dp * 2.2 + warp * 2.0 - t);
        droneCol = pic * (0.55 + 0.45 * glow + 0.35 * audioSwell);
        droneCol += imgPal(glow * 3.0) * glow * glow * (0.25 + 0.45 * audioSwell);
    }

    // ---------- Cross-fade by the (slow) music-type classifier ----------
    vec3 col = mix(beatCol, droneCol, clamp(audioAmbient, 0.0, 1.0));

    // Mood grade + image-driven hue variance.
    col *= mix(vec3(0.75, 0.85, 1.20), vec3(1.25, 1.05, 0.75), audioCentroid);
    float lum = dot(col, vec3(0.299, 0.587, 0.114));
    col = mix(vec3(lum), col, 0.6 + 0.6 * audioValence);
    float himg = dot(imgPal(dot(col, vec3(0.333)) * 6.0
                 + length(uv - 0.5) * 4.0), vec3(0.333));
    col = hueRot(col, (himg - 0.5) * 3.0 + time * 0.05);

    col *= 0.9 + 0.4 * audioLevel;

    gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
