// Feedback.frag
// Phosphor-style feedback/trails pass, upgraded to an ECHO-WARP: the previous
// displayed frame is sampled slightly ZOOMED and ROTATED around the centre
// before being blended back in, so bright structures leave glowing echo
// tunnels that expand, swirl and drift in hue as they fade.
//   out = max(current, warpedPrevious * decay)
// decay near 0 = no trails; near 1 = long trails.  The host modulates decay
// (longer in ambient/sustained passages), pumps the zoom with the beat and
// swings the rotation direction slowly.
uniform sampler2D texCur;    // current combined frame
uniform sampler2D texPrev;   // previous trail frame
uniform vec2  resolution;
uniform float decay;
uniform float warpZoom;      // per-frame echo expansion (1.0 = none)
uniform float warpRot;       // per-frame echo rotation (radians)
uniform float hueDrift;      // per-frame hue rotation of the echoes
uniform float depth3D;       // 0..1: a 3D scene is on screen -> depth-aware
                             // trails (bright=near fades fast, dim=far lingers)

vec3 hueRotF(vec3 c, float a)
{
    vec3  k = vec3(0.57735026919);
    float cs = cos(a), sn = sin(a);
    return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
}

void main()
{
    vec2 uv  = gl_FragCoord.xy / resolution;
    vec3 cur = texture2D(texCur, uv).rgb;

    // Echo-warp: previous frame zoomed + rotated around the centre
    // (aspect-corrected), so echoes expand outward and swirl.
    float aspect = resolution.x / resolution.y;
    vec2 c = uv - 0.5;
    c.x *= aspect;
    float cs = cos(warpRot), sn = sin(warpRot);
    c = mat2(cs, -sn, sn, cs) * c;
    c /= max(warpZoom, 1e-3);
    c.x /= aspect;
    vec2 puv = c + 0.5;

    vec3 prv = hueRotF(texture2D(texPrev, puv).rgb, hueDrift);

    // Soft edge fade: echoes leaving the frame dissolve instead of smearing
    // into hard border bars.
    vec2  e    = min(puv, 1.0 - puv);
    float edge = smoothstep(0.0, 0.02, min(e.x, e.y));

    // Depth-aware trails for the 3D scenes: brightness is the same pseudo-
    // depth the stereo reprojection uses (bright = near).  Near structures
    // shed their echoes quickly (crisp foreground), far dim ones linger —
    // the trail itself gains a sense of depth.
    float dScale = 1.0;
    if (depth3D > 0.001)
    {
        float plum = dot(prv, vec3(0.299, 0.587, 0.114));
        float nearness = smoothstep(0.05, 0.6, plum);
        dScale = mix(1.0, mix(1.035, 0.90, nearness), depth3D);
    }

    gl_FragColor = vec4(max(cur, prv * min(decay * dScale, 0.985) * edge), 1.0);
}
