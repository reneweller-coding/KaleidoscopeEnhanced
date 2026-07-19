// CombinePlain.frag
// The plain effect blend — now with per-transition STYLES.  The host rolls a
// style whenever a cross-fade starts (transStyle; 0/absent = the classic
// linear mix) and the transition then plays as:
//   1  radial wipe   — the new scene grows from the centre with a soft edge
//   2  kaleido fold  — both scenes fold into a 6-mirror rosette that peaks
//                      mid-transition and unfolds into the new scene
//   3  zoom-through  — the camera flies forward: the old scene dives past
//                      while the new one arrives from the distance
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

void main()
{
    vec2  p   = gl_FragCoord.xy / resolution;
    float d   = 1.0 - interpolation;          // transition progress 0..1
    float mid = sin(PI * d);                  // 0 at both ends, 1 mid-transition
    float aspect = resolution.x / resolution.y;

    vec4  c0, c1;
    float w1 = d;                             // weight of the NEW scene

    if (transStyle == 1)
    {
        // Radial wipe with a soft edge (fully old at d=0, fully new at d=1).
        vec2 cc = p - 0.5;
        cc.x *= aspect;
        float r  = length(cc) / 0.95;
        float dd = d * 1.35 - 0.14;
        w1 = 1.0 - smoothstep(dd - 0.08, dd + 0.08, r);
        c0 = texture2D(tex0, p);
        c1 = texture2D(tex1, p);
    }
    else if (transStyle == 2)
    {
        // Kaleido fold-through: the fold amount rises and falls with mid, so
        // the transition passes through a mirrored rosette and unfolds again.
        vec2 cc = p - 0.5;
        cc.x *= aspect;
        vec2 f = kaleidoT(cc, 6.0);
        f.x /= aspect;
        vec2 pf = mix(p, clamp(f + 0.5, 0.0, 1.0), mid * 0.85);
        c0 = texture2D(tex0, pf);
        c1 = texture2D(tex1, pf);
    }
    else if (transStyle == 3)
    {
        // Zoom-through: continuous forward flight through both scenes.
        vec2 cc = p - 0.5;
        vec2 p0 = cc / (1.0 + 0.6 * d) + 0.5;         // old magnifies (passes by)
        vec2 p1 = cc / (1.6 - 0.6 * d) + 0.5;         // new arrives from afar
        c0 = texture2D(tex0, p0);
        c1 = texture2D(tex1, p1);
    }
    else
    {
        c0 = texture2D(tex0, p);
        c1 = texture2D(tex1, p);
    }

    gl_FragColor = mix(c0, c1, w1);
}
