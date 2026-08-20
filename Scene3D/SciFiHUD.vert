#version 330 core
/**
 * @file SciFiHUD.vert
 * @brief Vertex stage companion to SciFiHUD.frag -- see that file's header for
 * this scene's description.
 */
// SciFiHUD.vert — a diegetic sci-fi cockpit interface floating in front of
// the camera: bezel rings, a rotating radar sweep, a REAL oscilloscope
// trace of the live waveform, a spectrum arc, compass ticks, a target
// reticle with 4 corner brackets, onset-triggered "lock-on" rings, a pitch
// ladder out to either side and two spectrum-fed side data columns.
// 20 ribbons, each routed to a HUD role by index (ri = attrA.w).
//   attrA.x = t along the ribbon, attrA.y = side (thickness/trail).

in vec4 attrA;
in vec4 attrB;

uniform mat4  projM;
uniform float eyeOff;
uniform float time;

uniform float audioAdvance;
uniform float audioWave[64];
uniform float audioSpectrum[32];
uniform float audioOnset;
uniform float audioKick;
uniform float audioChromaHue;
uniform float audioSwell;

out vec4  vCol;
out float vSide;
out float vFade;

vec3 hueRot(vec3 c, float a)
{
    vec3  k = vec3(0.57735026919);
    float cs = cos(a), sn = sin(a);
    return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
}
float hashH(float n) { return fract(sin(n * 127.1) * 43758.5453); }

void main()
{
    float t  = attrA.x;
    float sd = attrA.y;
    float ri = attrA.w;
    float r1 = attrB.x, r2 = attrB.y, r3 = attrB.z, r4 = attrB.w;

    // STROKE WIDTH.  At 32 units out every one of these strokes projected to
    // barely two pixels, so the whole interface read as a faint scratch on a
    // black frame.  `sdw` widens the ribbons; `sd` itself still goes to the
    // fragment stage unchanged, so the line PROFILE across the wider ribbon is
    // exactly the same crisp core-plus-halo.
    //
    // 4.5, not 2: the fragment profile is exp(-d*d*30), which is already down to
    // 0.15 by |sd| = 0.25, so only the innermost QUARTER of the ribbon is
    // actually lit.  A ribbon 2 x 0.06 units wide therefore still drew a
    // 1.6-pixel hairline on a 1080-line frame, which averages away to nothing in
    // any downscale -- the reason the interface measured luma 0.006.
    float sdw = sd * 4.5;

    vec2  pos  = vec2(0.0);
    vec3  col  = vec3(0.3, 0.9, 0.8);
    float fade = 1.0;

    if (ri < 0.5)                                   // outer bezel ring
    {
        float a = t * 6.2831853;
        pos = vec2(cos(a), sin(a)) * (12.0 + sdw * 0.06);
        col = hueRot(vec3(0.25, 0.85, 0.95), audioChromaHue * 0.3);
    }
    else if (ri < 1.5)                               // inner bezel ring
    {
        float a = t * 6.2831853;
        pos = vec2(cos(a), sin(a)) * (9.3 + sdw * 0.05);
        col = hueRot(vec3(0.25, 0.85, 0.95), audioChromaHue * 0.3) * 0.7;
    }
    else if (ri < 2.5)                               // radar sweep (trailing wedge)
    {
        float sweepAngle = time * 1.1 + audioAdvance * 0.6;
        float a = sweepAngle - t * 0.85;
        float radius = mix(0.8, 11.6, sd * 0.5 + 0.5);
        pos = vec2(cos(a), sin(a)) * radius;
        col = hueRot(vec3(0.3, 1.0, 0.6), audioChromaHue * 0.3);
        fade = 1.0 - t;
    }
    else if (ri < 4.5)                                // waveform core + glow
    {
        bool glow = ri > 3.5;
        float fw = t * 62.999;
        int   wi = int(fw);
        float wv = mix(audioWave[wi], audioWave[wi + 1], fract(fw));
        pos = vec2((t - 0.5) * 15.0, -7.0 + wv * 2.2 + sdw * (glow ? 0.14 : 0.045));
        col = hueRot(vec3(0.2, 1.0, 0.5), audioChromaHue * 0.3) * (glow ? 0.35 : 1.0);
    }
    else if (ri < 5.5)                                // compass ticks (12 packed)
    {
        float tt = t * 12.0;
        float lf = fract(tt);
        float a  = floor(tt) / 12.0 * 6.2831853;
        float radius = mix(12.3, 13.1, lf) + sdw * 0.05;
        pos = vec2(cos(a), sin(a)) * radius;
        col = vec3(0.6, 0.85, 0.9);
        fade = 1.0 - abs(lf - 0.5) * 2.0;
    }
    else if (ri < 6.5)                                // spectrum arc (32 bands)
    {
        float tt = t * 32.0;
        int   band = int(min(tt, 31.0));
        float lf = fract(tt);
        float a  = -0.9 + (band / 32.0) * 1.8;         // bottom arc, +-0.9 rad
        float lvl = audioSpectrum[band];
        float radius = 6.0 + lvl * 4.5 * lf + sdw * 0.04;
        pos = vec2(sin(a), -cos(a)) * radius + vec2(0.0, -6.5);
        col = hueRot(vec3(1.0, 0.6, 0.2), audioChromaHue * 0.3);
    }
    else if (ri < 10.5)                               // 4 target corner brackets
    {
        float corner = ri - 7.0;                       // 0..3
        float sx = (mod(corner, 2.0) < 0.5) ? -1.0 : 1.0;
        float sy = (corner < 1.5) ? 1.0 : -1.0;
        vec2  cpt = vec2(sx * 2.3, sy * 1.7);
        float armLen = 0.7;
        vec2  local = (t < 0.5)
                     ? vec2(mix(0.0, -sx * armLen, t * 2.0), 0.0)
                     : vec2(0.0, mix(0.0, -sy * armLen, (t - 0.5) * 2.0));
        pos = cpt + local + sdw * 0.05 * vec2(1.0, 1.0);
        float lockPulse = 0.6 + 0.4 * sin(6.2831853 * fract(time * 0.6));
        col = hueRot(vec3(1.0, 0.3, 0.25), audioChromaHue * 0.3)
            * (0.7 + 0.6 * audioOnset) * lockPulse;
    }
    else if (ri < 11.5)                               // crosshair horizontal
    {
        float x = (t - 0.5) * 1.3;
        float gap = step(0.12, abs(x));                // small centre gap
        pos = vec2(x, sdw * 0.05);
        fade = gap;
        col = vec3(0.7, 0.9, 0.85);
    }
    else if (ri < 12.5)                               // crosshair vertical
    {
        float y = (t - 0.5) * 1.3;
        float gap = step(0.12, abs(y));
        pos = vec2(sdw * 0.05, y);
        fade = gap;
        col = vec3(0.7, 0.9, 0.85);
    }
    else if (ri < 15.5)                               // 3 onset lock-on rings
    {
        float ring = ri - 13.0;                        // 0..2
        float a = t * 6.2831853;
        float baseR = 3.2 + ring * 1.35;
        float pulse = exp(-fract(time * 0.7 - ring * 0.12) * 5.0) * audioOnset;
        float radius = baseR * (1.0 + 0.25 * pulse) + sdw * 0.04;
        pos = vec2(cos(a), sin(a)) * radius;
        col = hueRot(vec3(0.9, 0.35, 1.0), audioChromaHue * 0.3);
        fade = 0.15 + pulse;
    }
    else if (ri < 17.5)                                // pitch ladder, 14 rungs
    {
        // The old "4 decorative data ticks" all sat inside the bezel, in one
        // 0.35-rad wedge at the lower right; the entire left and right thirds
        // of the canopy were empty black.  These two ribbons pack a stack of
        // rungs out to either side instead.
        float k   = ri - 16.0;                          // 0 = left, 1 = right
        float sx  = (k < 0.5) ? -1.0 : 1.0;
        float tt  = t * 14.0;
        float row = floor(tt);
        float lf  = fract(tt);
        float len = 4.0 + 4.5 * hashH(row * 3.1 + k * 11.0);
        pos = vec2(sx * mix(7.5, 7.5 + len, lf),
                   (row - 6.5) * 2.35 + sdw * 0.05);
        col = vec3(0.34, 0.70, 0.72);
        // Blank the jump between rungs, otherwise the strip draws a diagonal
        // connector from each rung's end to the next one's start.
        fade = smoothstep(0.0, 0.07, lf) * (1.0 - smoothstep(0.90, 1.0, lf))
             * (0.55 + 0.45 * sin(time * 1.7 + row * 0.9));
    }
    else                                               // 2 side data columns
    {
        float k   = ri - 18.0;                          // 0 = left, 1 = right
        float sx  = (k < 0.5) ? -1.0 : 1.0;
        float tt  = t * 26.0;
        float row = floor(tt);
        float lf  = fract(tt);
        float lvl = audioSpectrum[int(mod(row, 32.0))];
        float len = 0.9 + 5.0 * lvl;
        pos = vec2(sx * (12.6 + mix(0.0, len, lf)),
                   (row - 12.5) * 1.28 + sdw * 0.04);
        col = hueRot(vec3(0.95, 0.72, 0.22), audioChromaHue * 0.3);
        fade = smoothstep(0.0, 0.08, lf) * (1.0 - smoothstep(0.90, 1.0, lf));
    }

    // CANOPY FIT.  At 32 units out the frustum is roughly 59 x 33 units, and
    // the interface only ever reached radius 13 -- a small disc adrift in a
    // black rectangle.  Scaling it up and stretching it to the frame's aspect
    // makes it read as a HUD projected across the whole canopy (rings become
    // the wide ellipses a real head-up display draws), with the bezel just
    // overflowing top and bottom.  Applied AFTER the branches so every stroke
    // width scales with it too.
    pos *= 1.35;
    pos.x *= 1.35;

    vec3 world = vec3(pos.x, pos.y, 0.0);
    vec3 vp = world + vec3(0.02 * sin(time * 0.11), 0.015 * cos(time * 0.09), 32.0);
    vp.x -= eyeOff;
    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.04 * gl_Position.w;

    vCol  = vec4(col * (0.7 + 0.5 * audioSwell + 0.5 * audioKick) * fade, 1.0);
    vSide = sd;
    vFade = fade;
}
