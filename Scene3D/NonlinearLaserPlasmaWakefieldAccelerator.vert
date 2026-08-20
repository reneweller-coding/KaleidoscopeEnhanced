#version 330 core
/**
 * @file NonlinearLaserPlasmaWakefieldAccelerator.vert
 * @brief Vertex stage companion to NonlinearLaserPlasmaWakefieldAccelerator.frag -- see that file's
 * header for this scene's description.
 *
 * The accelerator channel is a TUBE, and a tube can only ever be a band across
 * the picture -- lengthening it further just made a longer band.  So every
 * ribbon's 300 segments are split into two runs: the first draws the cavity
 * train's sheath as before (all twenty strands, now on a longer, fatter
 * channel), the second draws one ionisation filament of the ambient plasma the
 * channel is bored through, laid out in FRUSTUM coordinates so the twenty
 * filaments criss-cross the entire frame at every depth.  The quad that
 * bridges the two runs is pinched to zero width and zero brightness by the
 * end taper, so no sheet is ever drawn between them.
 */

in vec4 attrA; // x = t [0,1], y = side (-1/+1), z = 0, w = ribbon index
in vec4 attrB; // 4 seeds in [0,1)

out vec2 vUV;
out float vSide;
out float vRibbonID;
out vec3 vCol;
out float vBubblePulse;

uniform mat4 projM;
uniform float eyeOff;
uniform float time;
uniform vec2 resolution;

uniform float audioPhase;
uniform float audioAdvance;
uniform float audioKick;
uniform float audioSwell;
uniform float audioCentroid;
uniform float audioValence;
uniform float audioChromaHue;

uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float bubbleRadiusP;
uniform float ribbonWidthP;
uniform float wakefieldLengthP;

// The scene projection: 55 deg vertical FOV (see Scene3DShader::draw).
const float kTanY = 0.5206;

vec3 img(vec2 uv) {
    return (interpolation * texture(tex0, uv) + (1.0 - interpolation) * texture(tex1, uv)).rgb;
}

vec3 imgPalette(float t)
{
    float ang = audioChromaHue + audioAdvance * 0.04 + t * 6.2831853;
    float rad = 0.16 + 0.08 * sin(audioAdvance * 0.013);
    vec3  col = img(clamp(vec2(0.5) + rad * vec2(cos(ang), sin(ang)), 0.0, 1.0));
    float g   = dot(col, vec3(0.333));
    return mix(vec3(g), col, 0.55 + 0.45 * audioValence);
}

void main()
{
    float tCoord = attrA.x;
    float side   = attrA.y;
    float rIndex = attrA.w;

    vSide = side;
    vRibbonID = rIndex;

    float aspect = (resolution.y > 0.5) ? resolution.x / resolution.y : 1.7778;

    float t = time * 0.45 + audioAdvance * 0.4;

    // Two runs per ribbon: 0 = accelerator channel, 1 = ambient plasma.
    float g = min(floor(tCoord * 2.0), 1.0);
    float u = clamp(tCoord * 2.0 - g, 0.0, 1.0);
    vUV = vec2(u, side * 0.5 + 0.5);

    // Exactly zero at both ends of a run, so the bridging quad degenerates.
    float taper = smoothstep(0.0, 0.10, u) * (1.0 - smoothstep(0.90, 0.99, u));

    float wBase = (ribbonWidthP > 0.001 ? ribbonWidthP : 0.045)
                * (1.0 + 0.3 * audioSwell);

    vec3 vp;

    if (g < 0.5)
    {
        // ---- The accelerator channel ---------------------------------
        // Laser plasma wakefield "bubble" regime: ultraintense laser expels
        // electrons creating a spherical ion cavity.
        float rBubble = (bubbleRadiusP > 0.01 ? bubbleRadiusP : 0.85) * 2.4;
        float zLen    = (wakefieldLengthP > 0.01 ? wakefieldLengthP : 3.6) * 3.6;
        float zPos    = (u - 0.5) * zLen;

        // A wake is a TRAIN of cavities, not a single bubble: the plasma
        // oscillates behind the driver at the plasma wavelength, so the
        // blowout repeats down the channel.  The train damps with distance
        // behind the driver but never pinches shut, so the whole channel
        // carries structure.
        float zLaser = sin(t * 1.5) * 1.6;
        float lam    = 2.15 * rBubble;                      // plasma wavelength
        float dCav   = abs(fract((zPos - zLaser) / lam + 0.5) - 0.5) * lam;
        float damp   = 0.55 + 0.45 * exp(-abs(zPos - zLaser) * 0.14);
        float rLoc   = rBubble * damp;
        // Each cavity spans a whole half-period, so the train is a chain of
        // touching cavities: damping narrows them without opening bare gaps
        // of axis between them.
        float uCav   = dCav / (0.5 * lam);
        float bubbleR = rLoc * sqrt(max(0.0, 1.0 - uCav * uCav));

        // One strand per ribbon.
        float nStrands = 20.0;
        float phi = rIndex * (6.2831853 / nStrands) + zPos * 2.0 + t * 2.0;

        vec3 centerPos = vec3(cos(phi) * (bubbleR + 0.22),
                              sin(phi) * (bubbleR + 0.22),
                              zPos);

        vec3 binormal = vec3(cos(phi), sin(phi), 0.0);

        float width = wBase * 1.6 * taper;
        vec3 worldPos = centerPos + binormal * (side * width);

        // Trapped relativistic electron bunch self-injection flash at the
        // back of the bubble.
        float atBack = exp(-pow(zPos - (zLaser - rBubble), 2.0) * 6.0);
        vBubblePulse = atBack * (1.0 + 3.5 * audioKick) * taper;

        vCol = imgPalette(fract(rIndex * 0.166 + u * 0.3 + audioCentroid)) * taper;

        // Camera Transform (V3): the channel turns broadside and end-on.
        vp = worldPos;
        float c = cos(t * 0.15), s = sin(t * 0.15);
        vp = vec3(vp.x * c - vp.z * s, vp.y, vp.x * s + vp.z * c);
        // Far enough back that the lengthened channel (half-length up to 6.5
        // units) cannot swing through the eye when the rotation turns it
        // broadside-on, close enough that the cavity train still fills the
        // frame.
        vp.z += 11.0;
    }
    else
    {
        // ---- Ambient plasma: ionisation filaments --------------------
        // The gas jet the channel is bored through is not empty -- it glows
        // in fine striations along the laser's own polarisation.  Twenty of
        // them, each a long wavy cord crossing the picture at its own angle
        // and depth, which is what carries the frame outside the channel.
        float fs = fract(rIndex * 0.618034 + 0.19);
        float fd = 6.5 + fract(rIndex * 0.371 + 0.53) * 15.5;   // depth 6.5 .. 22
        float halfH = fd * kTanY;

        float aFil = fs * 3.14159265;
        vec2  dir  = vec2(cos(aFil), sin(aFil));
        vec2  nrm  = vec2(-dir.y, dir.x);

        // Screen-normalised coordinates: y spans +-1, x spans +-aspect.  The
        // cord runs past both edges whichever way it is pointing.
        float s    = (u - 0.5) * 2.0;
        float offN = (fract(rIndex * 0.917 + 0.31) - 0.5) * 2.0 * 1.15;
        float wob  = sin(s * 3.4 + time * 0.37 + rIndex * 1.7 + audioPhase * 0.25) * 0.20
                   + sin(s * 8.1 - time * 0.23 + rIndex) * 0.08;

        vec2 sxy = dir * (s * 2.3) + nrm * (offN + wob);

        float width = (0.010 + 0.006 * fs) * halfH
                    * (1.0 + 0.3 * audioSwell) * taper;

        vp = vec3(sxy.x * halfH + nrm.x * side * width,
                  sxy.y * halfH + nrm.y * side * width,
                  fd);

        // Betatron sparkle running along the cord.
        vBubblePulse = 0.10 * pow(0.5 + 0.5 * sin(s * 26.0 + t * 2.4 + rIndex * 2.0), 3.0)
                     * (1.0 + 2.0 * audioKick) * taper;

        // Background layer: clearly dimmer than the channel, but bright
        // enough that no tile of the picture is ever empty.
        vCol = imgPalette(fract(rIndex * 0.083 + u * 0.15 + audioCentroid)) * 0.42 * taper;
    }

    vp.x -= eyeOff;

    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;
    if (vp.z < 0.4)
        gl_Position = vec4(0.0, 0.0, -3.0, 1.0);
}
