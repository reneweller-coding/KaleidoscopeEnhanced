#version 330 core
out vec4 fragColor;
// BlackHole.frag — Schwarzschild lensing with an accretion disk.
// -----------------------------------------------------------------------
// Photons are integrated in the orbit plane using the standard relativistic
// equation for the inverse radius u = 1/r:
//
//     d2u/dphi2 + u = 3 M u^2
//
// The 3Mu^2 term is the whole of general relativity here: drop it and light
// travels in a straight line, keep it and you get the photon sphere, the
// shadow and the Einstein ring for free.  Each pixel steps its own photon
// forward in phi until it either falls in, escapes, or crosses the disk.
//
// The photo becomes the star field behind the hole, so the lensing visibly
// smears the slideshow around the shadow.
// -----------------------------------------------------------------------

uniform sampler2D tex0;
uniform vec2  resolution;
uniform float time;
uniform float interpolation;

uniform float audioLevel;
uniform float audioBeat;
uniform float audioKick;
uniform float audioSubBass;
uniform float audioBass;
uniform float audioHigh;
uniform float audioChromaHue;
uniform float audioAdvance;
uniform float audioDrop;
uniform float audioMusic;

uniform float massP;        // preset: how strongly it lenses
uniform float diskP;        // preset: disk brightness
uniform float tiltP;        // preset: viewing angle onto the disk

// Blackbody-ish ramp for the disk: inner edge white-hot, outer edge deep red.
vec3 diskColour(float t)
{
    vec3 hot  = vec3(1.15, 1.05, 0.95);
    vec3 mid  = vec3(1.20, 0.62, 0.20);
    vec3 cool = vec3(0.55, 0.12, 0.05);
    return (t < 0.5) ? mix(cool, mid, t * 2.0) : mix(mid, hot, (t - 0.5) * 2.0);
}

void main()
{
    vec2 uv = gl_FragCoord.xy / resolution;
    vec2 q  = (gl_FragCoord.xy - 0.5 * resolution) / resolution.y;

    // ---- camera ----
    // Slow orbit around the hole; the tilt decides how much of the disk's far
    // side is lifted over the top by the lensing (the "Interstellar" halo).
    float orbit = audioAdvance * 0.09;
    // Elevation above the disk plane.  Too shallow and the disk is edge-on and
    // fills the frame as a bar; this keeps 20-45 degrees, where the far side
    // lifts over the shadow.
    float tilt  = 0.34 + 0.42 * tiltP + 0.06 * sin(audioAdvance * 0.05);
    // Well OUTSIDE the disk's outer radius — a camera inside it sees nothing
    // but a wall of disk.
    float camR  = 15.0 - 1.5 * audioLevel;

    // Proper spherical placement, so |ro| really is camR.
    vec3 ro = camR * vec3(cos(tilt) * sin(orbit), sin(tilt), cos(tilt) * cos(orbit));
    vec3 fw = normalize(-ro);
    vec3 rt = normalize(cross(vec3(0.0, 1.0, 0.0), fw));
    vec3 up = cross(fw, rt);
    vec3 rd = normalize(fw * 1.5 + rt * q.x + up * q.y);

    // Mass: the bass literally deepens the well, so the shadow breathes.
    float M = (0.40 + 0.45 * massP) * (1.0 + 0.35 * audioSubBass + 0.25 * audioBass);

    // ---- set up the photon's orbit plane ----
    // Everything happens in the plane spanned by the camera position and the
    // ray direction, which turns the 3D problem into a 2D one.
    vec3 nrm = normalize(cross(ro, rd));
    vec3 e1  = normalize(ro);
    vec3 e2  = normalize(cross(nrm, e1));

    float r0  = length(ro);
    float u   = 1.0 / r0;
    // du/dphi from the ray's radial component at the start.
    float du  = -dot(rd, e1) / dot(rd, e2) * u;

    float phi = 0.0;
    const int STEPS = 160;
    float dphi = 0.055;

    vec3  col = vec3(0.0);
    float diskAcc = 0.0;
    bool  captured = false;
    vec3  escapeDir = rd;

    float prevY = dot(ro, vec3(0.0, 1.0, 0.0));

    for (int i = 0; i < STEPS; ++i)
    {
        // Leapfrog on d2u/dphi2 = 3 M u^2 - u
        float acc = 3.0 * M * u * u - u;
        du += acc * dphi;
        u  += du * dphi;
        phi += dphi;

        if (u <= 1e-4) { escapeDir = normalize(cos(phi) * e1 + sin(phi) * e2); break; }
        float r = 1.0 / u;
        if (r < 2.0 * M) { captured = true; break; }     // through the horizon

        vec3 p = (cos(phi) * e1 + sin(phi) * e2) * r;
        float y = p.y;

        // ---- disk crossing ----
        // The disk is razor thin, so test for a SIGN CHANGE of y rather than
        // "is y small": a thickness test would miss it at grazing angles and
        // make the disk flicker as the camera moves.
        if (prevY * y < 0.0)
        {
            float t  = prevY / (prevY - y);
            float rc = mix(1.0 / max(u - du * dphi, 1e-4), r, t);
            float rIn  = 3.0 * M;                    // innermost stable orbit
            float rOut = 9.0 * M;
            if (rc > rIn && rc < rOut)
            {
                float s = clamp((rc - rIn) / (rOut - rIn), 0.0, 1.0);

                // Keplerian orbit -> Doppler beaming: the side coming toward
                // the camera is brighter and bluer.  Without this the disk
                // reads as a flat ring instead of a rotating one.
                vec3 pc  = normalize(vec3(p.x, 0.0, p.z));
                vec3 vel = normalize(cross(vec3(0.0, 1.0, 0.0), pc));
                float beta = 0.42 * inversesqrt(max(rc / M, 1.0));
                float dop  = 1.0 / (1.0 - beta * dot(vel, normalize(-rd)));
                dop = clamp(dop, 0.35, 2.6);

                // Turbulent banding so the disk has texture, driven by an
                // INTEGRATED phase (never time x level) to stay flicker-free.
                float band = 0.65 + 0.35 * sin(rc * 9.0 - audioAdvance * 2.2
                                               + atan(p.z, p.x) * 3.0);
                band *= 0.75 + 0.5 * sin(atan(p.z, p.x) * 7.0 + audioAdvance * 1.1);

                float bright = (1.0 - s) * (1.0 - s) * band * pow(dop, 3.0);
                col += diskColour(1.0 - s) * bright * (1.4 + 2.6 * diskP);
                diskAcc += bright;
            }
        }
        prevY = y;
    }

    if (!captured)
    {
        // The photo IS the sky: the lensed direction decides where we sample,
        // so the slideshow gets dragged around the shadow and forms the ring.
        vec2 sky = vec2(atan(escapeDir.z, escapeDir.x) / 6.2831853 + 0.5,
                        acos(clamp(escapeDir.y, -1.0, 1.0)) / 3.14159265);
        // textureLod(..., 0) on purpose: next to the shadow the lensed
        // direction changes enormously between adjacent pixels, so the
        // automatic derivative picks a very coarse mip and the sky breaks into
        // hard blocks.  Averaging a few taps takes the aliasing back out.
        vec3 star = textureLod(tex0, fract(sky), 0.0).rgb;
        star += textureLod(tex0, fract(sky + vec2( 0.002, 0.0)), 0.0).rgb;
        star += textureLod(tex0, fract(sky + vec2(-0.002, 0.0)), 0.0).rgb;
        star += textureLod(tex0, fract(sky + vec2(0.0,  0.002)), 0.0).rgb;
        star *= 0.25;

        // Darken the sky so the disk stays the brightest thing in frame.
        col += star * star * (0.30 + 0.25 * audioMusic);

        // Point stars from the photo's own highlights.  A gentle exponent here
        // turns every bright patch of the picture into a white blob that the
        // lensing then smears into arcs — keep it sharp and faint.
        float lum = dot(star, vec3(0.299, 0.587, 0.114));
        col += vec3(0.9, 0.95, 1.1) * pow(lum, 16.0) * (0.25 + 0.45 * audioHigh);
    }

    // Photon ring: a thin bright rim right at the shadow's edge.
    float ring = smoothstep(0.0, 1.2, diskAcc) * (1.0 - smoothstep(1.2, 3.0, diskAcc));
    col += vec3(1.0, 0.85, 0.65) * ring * (0.25 + 0.9 * audioKick);

    // Bounded hue nudge: chromaHue can carry a full turn, so send it through a
    // sine or the disk leaves the plausible fire palette entirely.
    float hr = 0.13 * sin(audioChromaHue);
    col.rb = mat2(cos(hr), -sin(hr), sin(hr), cos(hr)) * col.rb;

    col *= 1.0 + 0.30 * audioBeat + 0.8 * audioDrop;
    col = col / (1.0 + col * 0.42);
    fragColor = vec4(col, interpolation);
}
