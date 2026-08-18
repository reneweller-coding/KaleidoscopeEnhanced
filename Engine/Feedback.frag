#version 330 core
out vec4 fragColor;
/**
 * @file Feedback.frag
 * @brief Phosphor-style feedback/trails pass, upgraded to an ECHO-WARP: the previous
 * displayed frame is sampled slightly ZOOMED and ROTATED around the centre
 * before being blended back in, so bright structures leave glowing echo
 * tunnels that expand, swirl and drift in hue as they fade.
 *   out = max(current, warpedPrevious * decay)
 * decay near 0 = no trails; near 1 = long trails.  The host modulates decay
 * (longer in ambient/sustained passages), pumps the zoom with the beat and
 * swings the rotation direction slowly.
 */
uniform sampler2D texCur;    // current combined frame
uniform sampler2D texPrev;   // previous trail frame
uniform vec2  resolution;
uniform float decay;
uniform float warpZoom;      // per-frame echo expansion (1.0 = none)
uniform float warpRot;       // per-frame echo rotation (radians)
uniform float hueDrift;      // per-frame hue rotation of the echoes
uniform float depth3D;       // 0..1: a 3D scene is on screen -> depth-aware
                             // trails (bright=near fades fast, dim=far lingers)

// ---- MilkDrop-style SPATIALLY VARYING warp field ----
// The signature "liquid" feedback look: the previous frame is displaced by
// per-pixel amounts that depend on WHERE the pixel is (radius/angle), not
// just globally.  All amplitudes are per-frame displacements (host scales
// by dt) and all phases are integrated host-side (no flicker).
uniform float rippleAmp;     // radial ripple wave amplitude (uv units/frame)
uniform float ripplePhase;   // integrated ripple phase
uniform float swirlAmp;      // extra rotation toward the rim (radians/frame)
uniform float flowAmp;       // pseudo-noise flow field amplitude
uniform float flowPhase;     // integrated flow drift phase

vec3 hueRotF(vec3 c, float a)
{
    vec3  k = vec3(0.57735026919);
    float cs = cos(a), sn = sin(a);
    return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
}

void main()
{
    vec2 uv  = gl_FragCoord.xy / resolution;
    vec3 cur = texture(texCur, uv).rgb;

    // Echo-warp: previous frame zoomed + rotated around the centre
    // (aspect-corrected), so echoes expand outward and swirl.
    float aspect = resolution.x / resolution.y;
    vec2 c = uv - 0.5;
    c.x *= aspect;

    // Spatially in part: swirl grows toward the rim, a radial ripple
    // wave rolls outward, and a slow sine "noise" field kneads everything.
    float rad = length(c);
    float rotHere = warpRot + swirlAmp * smoothstep(0.15, 0.75, rad);
    float cs = cos(rotHere), sn = sin(rotHere);
    c = mat2(cs, -sn, sn, cs) * c;
    c /= max(warpZoom, 1e-3);

    if (rippleAmp > 1e-6 && rad > 1e-4)
        c -= (c / rad) * sin(rad * 24.0 - ripplePhase) * rippleAmp;

    if (flowAmp > 1e-6)
        c -= vec2(sin(c.y * 9.0 + flowPhase) + 0.6 * sin(c.y * 21.0 - flowPhase * 0.7),
                  sin(c.x * 8.0 - flowPhase * 0.8) + 0.6 * sin(c.x * 19.0 + flowPhase * 0.6))
             * flowAmp;

    c.x /= aspect;
    vec2 puv = c + 0.5;

    vec3 prv = hueRotF(texture(texPrev, puv).rgb, hueDrift);

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

    fragColor = vec4(max(cur, prv * min(decay * dScale, 0.985) * edge), 1.0);
}
