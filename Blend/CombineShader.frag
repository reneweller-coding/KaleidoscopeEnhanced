// CombineShader.frag
// The FINAL pass blending the outgoing and incoming combine outputs - with the
// same 25-style transition library as CombinePlain.frag (host-rolled
// transStyle; 0/absent = classic linear mix; see CombinePlain.frag for the
// style list).  interpolation: 1 = old (tex0) .. 0 = new (tex1).
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

// Smooth 1D value noise (for the melt columns).
float noise1T(float x)
{
    float i = floor(x), f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    return mix(hashT(vec2(i, 7.0)), hashT(vec2(i + 1.0, 7.0)), f);
}

// Smooth 2D value noise (for the heat shimmer).
float noise2T(vec2 q)
{
    vec2 i = floor(q), f = fract(q);
    f = f * f * (3.0 - 2.0 * f);
    float a = hashT(i), b = hashT(i + vec2(1.0, 0.0));
    float c = hashT(i + vec2(0.0, 1.0)), e = hashT(i + vec2(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, e, f.x), f.y);
}

vec4 blend4(vec4 a, vec4 b, float w) { return mix(a, b, clamp(w, 0.0, 1.0)); }

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

    // Styles that need their own compositing take this early-out path.
    if (transStyle == 13)                     // blur-through (soft-focus dip)
    {
        vec2 px = (4.0 + 10.0 * mid) / resolution;
        vec4 a = ( texture2D(tex0, p)
                 + texture2D(tex0, p + vec2( px.x,  px.y))
                 + texture2D(tex0, p + vec2(-px.x,  px.y))
                 + texture2D(tex0, p + vec2( px.x, -px.y))
                 + texture2D(tex0, p + vec2(-px.x, -px.y)) ) * 0.2;
        vec4 b = ( texture2D(tex1, p)
                 + texture2D(tex1, p + vec2( px.x,  px.y))
                 + texture2D(tex1, p + vec2(-px.x,  px.y))
                 + texture2D(tex1, p + vec2( px.x, -px.y))
                 + texture2D(tex1, p + vec2(-px.x, -px.y)) ) * 0.2;
        vec4 sharp = blend4(texture2D(tex0, p), texture2D(tex1, p), d);
        gl_FragColor = mix(sharp, blend4(a, b, d), mid);
        return;
    }
    if (transStyle == 18)                     // chromatic dissolve
    {
        vec4 c0 = texture2D(tex0, p);
        vec4 c1 = texture2D(tex1, p);
        float wR = clamp(d * 1.3,        0.0, 1.0);
        float wG = clamp(d * 1.3 - 0.15, 0.0, 1.0);
        float wB = clamp(d * 1.3 - 0.30, 0.0, 1.0);
        gl_FragColor = vec4(mix(c0.r, c1.r, wR),
                            mix(c0.g, c1.g, wG),
                            mix(c0.b, c1.b, wB), 1.0);
        return;
    }
    if (transStyle == 19)                     // luminance-ordered dissolve
    {
        vec4 c0 = texture2D(tex0, p);
        vec4 c1 = texture2D(tex1, p);
        float key = dot(c0.rgb, vec3(0.299, 0.587, 0.114)) * 0.7
                  + dot(c1.rgb, vec3(0.299, 0.587, 0.114)) * 0.3;
        float w = smoothstep(key - 0.25, key + 0.25, d * 1.5 - 0.25);
        gl_FragColor = blend4(c0, c1, w);
        return;
    }
    if (transStyle == 20)                     // double-exposure (screen) peak
    {
        vec4 c0 = texture2D(tex0, p);
        vec4 c1 = texture2D(tex1, p);
        vec4 scr = 1.0 - (1.0 - c0) * (1.0 - c1);
        gl_FragColor = mix(blend4(c0, c1, d), scr, 0.65 * mid);
        return;
    }
    if (transStyle == 24)                     // ghost multi-exposure morph
    {
        vec2 z1 = cu / (1.0 + 0.045 * mid) + 0.5;
        vec2 z2 = cu / (1.0 + 0.090 * mid) + 0.5;
        vec4 a = ( texture2D(tex0, p) + texture2D(tex0, z1)
                 + texture2D(tex0, z2) ) / 3.0;
        vec4 b = ( texture2D(tex1, p) + texture2D(tex1, z1)
                 + texture2D(tex1, z2) ) / 3.0;
        gl_FragColor = blend4(a, b, d);
        return;
    }

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
        // Travel beyond the widescreen corner extent (no corner leak/snap).
        float t = mix(-1.15, 1.15, d);
        w1 = smoothstep(x - 0.09, x + 0.09, t);
    }
    else if (transStyle == 5)                 // blinds (staggered strips)
    {
        float strip = p.x * 6.0;
        float s   = fract(strip);
        float off = fract(floor(strip) * 0.61803);
        // Overshoot: even the most-staggered strip clears s=1 at d=1.
        float t   = d * 1.62 - 0.12 - off * 0.28;
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
        // Seam softness windowed by mid (no edge leak at d=0/d=1).
        float e = 0.015 * mid + 1e-4;
        w1 = smoothstep(1.0 - e, 1.0 + e, xs);
    }
    else if (transStyle == 10)                // doors slide open
    {
        float shift = d * 0.54;
        p0 = vec2(clamp(p.x + ((p.x < 0.5) ? shift : -shift), 0.0, 1.0), p.y);
        // Ease the gap in (no centre stripe popping at the start).
        w1 = (1.0 - smoothstep(shift - 0.02, shift + 0.02, abs(p.x - 0.5)))
           * smoothstep(0.0, 0.06, d);
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
    else if (transStyle == 14)                // melt: the old drips downward
    {
        float n    = noise1T(p.x * 7.0);
        float drop = d * d * (0.55 + 0.75 * n);
        p0 = vec2(p.x, clamp(p.y + drop, 0.0, 1.0));
        w1 = smoothstep(0.15, 0.85, d);
    }
    else if (transStyle == 15)                // heat-shimmer morph
    {
        float amp = mid * 0.055;
        vec2 q = p * 5.0;
        vec2 w = vec2(noise2T(q + vec2(0.0, d * 2.0)) - 0.5,
                      noise2T(q + vec2(3.7, -d * 2.0)) - 0.5);
        p0 = clamp(p + w * amp, 0.0, 1.0);
        p1 = p0;
    }
    else if (transStyle == 16)                // pixelation morph
    {
        // Near-identity start + eased-in blocks (no blockiness pop at ends).
        float cells = mix(900.0, 16.0, mid);
        vec2  grid  = vec2(cells, cells / aspect);
        vec2  pq    = (floor(p * grid) + 0.5) / grid;
        vec2  pm    = mix(p, pq, smoothstep(0.0, 0.12, mid));
        p0 = pm; p1 = pm;
    }
    else if (transStyle == 17)                // spin-zoom crossfade
    {
        float a0 =  d * 0.55;                 // old twists away
        float a1 = -(1.0 - d) * 0.55;         // new untwists in
        float z0 = 1.0 + 0.55 * d;
        float z1 = 1.0 + 0.55 * (1.0 - d);
        vec2 s0 = mat2(cos(a0), -sin(a0), sin(a0), cos(a0)) * cc;
        vec2 s1 = mat2(cos(a1), -sin(a1), sin(a1), cos(a1)) * cc;
        s0.x /= aspect;  s1.x /= aspect;
        p0 = clamp(s0 / z0 + 0.5, 0.0, 1.0);
        p1 = clamp(s1 / z1 + 0.5, 0.0, 1.0);
    }
    else if (transStyle == 21)                // jelly wobble
    {
        vec2 w = vec2(sin(p.y * 9.0 + d * 6.0), sin(p.x * 8.0 - d * 5.0));
        p0 = clamp(p + w * 0.035 * mid, 0.0, 1.0);
        p1 = p0;
    }
    else if (transStyle == 22)                // kaleido-8 spinning fold
    {
        float a = d * 1.2;
        vec2 rc = mat2(cos(a), -sin(a), sin(a), cos(a)) * cc;
        vec2 f = kaleidoT(rc, 8.0);
        f.x /= aspect;
        vec2 pf = mix(p, clamp(f + 0.5, 0.0, 1.0), mid * 0.9);
        p0 = pf; p1 = pf;
    }
    else if (transStyle == 23)                // drain vortex (old spirals away)
    {
        float ang = d * d * 3.0 * (1.5 - min(r, 1.0));
        float cs = cos(ang), sn = sin(ang);
        vec2 sc = mat2(cs, -sn, sn, cs) * cc;
        sc /= (1.0 + 1.2 * d * d);            // magnifies as it goes
        sc.x /= aspect;
        p0 = clamp(sc + 0.5, 0.0, 1.0);
        w1 = smoothstep(0.25, 0.9, d);
    }

    vec4 c0 = texture2D(tex0, p0);
    vec4 c1 = texture2D(tex1, p1);
    gl_FragColor = blend4(c0, c1, w1) * dark;
}
