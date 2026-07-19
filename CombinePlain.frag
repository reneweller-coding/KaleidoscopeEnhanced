// CombinePlain.frag
// The plain effect blend — with a LIBRARY of per-transition styles.  The host
// rolls a style whenever a cross-fade starts (transStyle; 0/absent = classic
// linear mix):
//    1 radial wipe     — the new scene grows from the centre (iris open)
//    2 kaleido fold    — both scenes fold through a 6-mirror rosette
//    3 zoom-through    — forward flight: old dives past, new arrives
//    4 diagonal wipe   — a soft slanted edge sweeps across
//    5 blinds          — staggered vertical strips reveal the new scene
//    6 mosaic dissolve — soft blocks flip over pseudo-randomly
//    7 swirl           — the frame winds into a whirlpool and unwinds
//    8 ripple          — a water ripple radiates while the scenes blend
//    9 push            — the new scene pushes the old one off to the left
//   10 doors           — the old scene splits and slides open like doors
//   11 clock sweep     — an angular wipe sweeps around like a clock hand
//   12 dip to dark     — the blend dips through darkness mid-transition
// All edges are soft; nothing flashes brighter than the scenes themselves
// (dip-to-dark only darkens), so photosensitivity safety is unaffected.
// interpolation: 1 = old scene (tex0) fully visible .. 0 = new scene (tex1).
uniform vec2 resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;
uniform int transStyle;

const float PI = 3.14159265358979;

vec2 kaleidoT(vec2 c, float sides)
{
    float a   = atan(c.y, c.x);
    float r   = length(c);
    float seg = PI / sides;
    a = mod(a + PI, 2.0 * seg) - seg;
    a = abs(a);
    return vec2(cos(a), sin(a)) * r;
}

float hashT(vec2 p2)
{
    return fract(sin(dot(p2, vec2(127.1, 311.7))) * 43758.5453);
}

void main()
{
    vec2  p   = gl_FragCoord.xy / resolution;
    float d   = 1.0 - interpolation;          // transition progress 0..1
    float mid = sin(PI * d);                  // 0 at both ends, 1 mid-transition
    float aspect = resolution.x / resolution.y;
    vec2  cc  = p - 0.5;                      // centred, aspect-corrected
    cc.x *= aspect;
    float r   = length(cc) / 0.95;
    vec2  cu  = p - 0.5;                      // centred, raw uv space

    vec2  p0 = p, p1 = p;                     // sample coords old / new
    float w1 = d;                             // weight of the NEW scene
    float dark = 1.0;                         // optional dip factor

    if (transStyle == 1)                      // radial wipe (iris open)
    {
        float dd = d * 1.35 - 0.14;
        w1 = 1.0 - smoothstep(dd - 0.08, dd + 0.08, r);
    }
    else if (transStyle == 2)                 // kaleido fold-through
    {
        vec2 f = kaleidoT(cc, 6.0);
        f.x /= aspect;
        vec2 pf = mix(p, clamp(f + 0.5, 0.0, 1.0), mid * 0.85);
        p0 = pf; p1 = pf;
    }
    else if (transStyle == 3)                 // zoom-through flight
    {
        p0 = cu / (1.0 + 0.6 * d) + 0.5;
        p1 = cu / (1.6 - 0.6 * d) + 0.5;
    }
    else if (transStyle == 4)                 // diagonal wipe
    {
        float x = dot(cc, normalize(vec2(1.0, 0.55)));
        float t = mix(-0.85, 0.85, d);
        w1 = smoothstep(x - 0.09, x + 0.09, t);
    }
    else if (transStyle == 5)                 // blinds (staggered strips)
    {
        float strip = p.x * 6.0;
        float s   = fract(strip);
        float off = fract(floor(strip) * 0.61803);
        float t   = d * 1.45 - 0.12 - off * 0.28;
        w1 = 1.0 - smoothstep(t - 0.07, t + 0.07, s);
    }
    else if (transStyle == 6)                 // mosaic dissolve
    {
        vec2  cell = floor(p * vec2(22.0, 13.0));
        float h    = hashT(cell);
        w1 = smoothstep(h - 0.18, h + 0.18, d * 1.36 - 0.18);
    }
    else if (transStyle == 7)                 // swirl / whirlpool
    {
        float ang = mid * 2.2 * smoothstep(1.0, 0.0, r);
        float cs = cos(ang), sn = sin(ang);
        vec2 sc = mat2(cs, -sn, sn, cs) * cc;
        sc.x /= aspect;
        p0 = clamp(sc + 0.5, 0.0, 1.0);
        p1 = p0;
    }
    else if (transStyle == 8)                 // water ripple
    {
        vec2  dir = cc / max(length(cc), 1e-4);
        float rip = mid * 0.025 * sin(r * 38.0 - d * 14.0);
        vec2  pr  = p + vec2(dir.x / aspect, dir.y) * rip;
        p0 = clamp(pr, 0.0, 1.0);
        p1 = p0;
    }
    else if (transStyle == 9)                 // push (new shoves old left)
    {
        float xs = p.x + d;
        p0 = vec2(clamp(xs,       0.0, 1.0), p.y);
        p1 = vec2(clamp(xs - 1.0, 0.0, 1.0), p.y);
        w1 = smoothstep(1.0 - 0.015, 1.0 + 0.015, xs);
    }
    else if (transStyle == 10)                // doors slide open
    {
        float shift = d * 0.54;
        p0 = vec2(clamp(p.x + ((p.x < 0.5) ? shift : -shift), 0.0, 1.0), p.y);
        w1 = 1.0 - smoothstep(shift - 0.02, shift + 0.02, abs(p.x - 0.5));
        w1 = max(w1, step(1.0, d));           // fully open at the end
    }
    else if (transStyle == 11)                // clock sweep
    {
        float ang = atan(cc.y, cc.x) / (2.0 * PI) + 0.5;
        w1 = smoothstep(ang - 0.035, ang + 0.035, d * 1.07 - 0.035);
    }
    else if (transStyle == 12)                // dip through darkness
    {
        dark = 1.0 - 0.55 * mid;
    }

    vec4 c0 = texture2D(tex0, p0);
    vec4 c1 = texture2D(tex1, p1);
    gl_FragColor = mix(c0, c1, clamp(w1, 0.0, 1.0)) * dark;
}
