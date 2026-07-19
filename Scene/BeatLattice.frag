// BeatLattice.frag
// -----------------------------------------------------------------------
// A BEAT-FIRST primary effect, built for rhythmic music.  Research-informed:
//   onsets/beats -> impulsive pulsation (envelope-followed pops — fast attack,
//                   organic release, exactly the "pip-and-pop" kinetic);
//   percussive material -> ANGULAR geometry (crisp folded shards);
//   beatPhase (continuous) -> an expanding ring wave that rides the tempo grid;
//   barPhase -> a slow per-bar rotation of the highlight;
//   downbeat -> a brighter, wider ring on the bar's "1".
// The image fills the angular shards (image-forward) with imgPal/hueRot colour
// variance; all motion is continuous (no snapping) and strobe-safe (the beat
// values arrive slew-limited from the host).
// -----------------------------------------------------------------------

uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float audioPhase;
uniform float audioBeat;
uniform float audioOnset;
uniform float audioDownbeat;
uniform float audioBeatPhase;
uniform float audioBarPhase;
uniform float audioLevel;
uniform float audioCentroid;
uniform float audioValence;
uniform float audioBass;

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
    p = rot(audioPhase * 0.20 + time * 0.02) * p;
    float r = length(p);

    // 8-fold angular fold + a second hard crease -> crisp percussive shards.
    vec2 fp = kaleido(p, 8.0);
    vec2 g  = abs(fract(fp * (2.6 + 0.4 * audioBass)) - 0.5);
    float crease = min(g.x, g.y);
    float edges  = smoothstep(0.12, 0.02, crease);

    // The image fills the shards; the beat pops their brightness (envelope pop).
    vec2 iuv = fp * 0.55 + 0.5 + (g - 0.25) * 0.12;
    vec3 pic = img(fract(iuv));

    // Ring wave riding the CONTINUOUS beat phase: expands outward once per beat.
    float ringR = audioBeatPhase * 1.15;
    float ring  = exp(-pow((r - ringR) * 9.0, 2.0));
    // Downbeat: a wider, brighter surge on the bar's "1".
    float dbRing = exp(-pow((r - audioBarPhase * 1.3) * 5.0, 2.0)) * audioDownbeat;

    // Bar-phase highlight rotating once per bar.
    float ang = atan(p.y, p.x) / (2.0 * PI) + 0.5;
    float swp = 0.5 + 0.5 * cos((ang - audioBarPhase) * 2.0 * PI);
    swp = swp * swp * swp;

    vec3 col = pic * (0.45 + 0.60 * audioBeat + 0.25 * audioOnset);
    col += edges * imgPal(crease * 10.0 + r * 2.0) * (0.45 + 1.5 * audioBeat);
    col += ring   * imgPal(r * 3.0) * (0.30 + 0.90 * audioBeat);
    col += dbRing * imgPal(r * 3.0 + 1.5) * 0.8;
    col *= 0.80 + 0.35 * swp;

    // Mood grade + image-driven hue variance.
    col *= mix(vec3(0.75, 0.85, 1.20), vec3(1.25, 1.05, 0.75), audioCentroid);
    float lum = dot(col, vec3(0.299, 0.587, 0.114));
    col = mix(vec3(lum), col, 0.6 + 0.6 * audioValence);
    float himg = dot(imgPal(dot(col, vec3(0.333)) * 6.0 + length(uv - 0.5) * 4.0), vec3(0.333));
    col = hueRot(col, (himg - 0.5) * 3.0 + time * 0.05);

    col *= 0.9 + 0.4 * audioLevel;
    col *= 1.0 - 0.25 * dot(p, p);

    gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
