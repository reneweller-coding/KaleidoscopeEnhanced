#version 330 core
/**
 * @file SuperconductingFluxoniumQubitCircuit.vert
 * @brief Vertex stage companion to SuperconductingFluxoniumQubitCircuit.frag -- see that file's
 * header for this scene's description.
 *
 * One fluxonium loop is one small ring, and one small ring in the middle of a
 * black frame is what the catalogue scan measured.  A real device is a DIE: a
 * lattice of qubits wired together by coplanar-waveguide traces.  So each
 * ribbon's 300 segments are split into six runs -- five of them draw one
 * z-layer of one of five qubit loops placed in FRUSTUM coordinates across the
 * chip, the sixth draws that ribbon's readout trace meandering the full width
 * or height of the picture.  Every loop still gets all twenty layers.
 *
 * The ribbon tapers to exactly zero at both ends of every run, so the quad
 * that bridges two runs collapses to zero area.  On the loops that taper is
 * visible as the gap in the ring -- which is exactly where a fluxonium's
 * single small Josephson junction interrupts the superinductance.
 */

in vec4 attrA; // x = t [0,1], y = side (-1/+1), z = 0, w = ribbon index
in vec4 attrB; // 4 seeds in [0,1)

out vec2 vUV;
out float vSide;
out float vRibbonID;
out vec3 vCol;
out float vQubitPulse;

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

uniform float circuitRadiusP;
uniform float ribbonWidthP;
uniform float arrayJunctionsP;

// The scene projection: 55 deg vertical FOV (see Scene3DShader::draw).
const float kTanY = 0.5206;
const float NQUBIT = 5.0;

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

    float t = time * 0.35 + audioAdvance * 0.3;

    // Six runs per ribbon: 0..4 = qubit loops, 5 = readout trace.
    float j = min(floor(tCoord * 6.0), 5.0);
    float u = clamp(tCoord * 6.0 - j, 0.0, 1.0);
    vUV = vec2(u, side * 0.5 + 0.5);

    // Exactly zero at both ends of a run.
    float taper = smoothstep(0.0, 0.06, u) * (1.0 - smoothstep(0.94, 0.98, u));

    float wBase = (ribbonWidthP > 0.001 ? ribbonWidthP : 0.05)
                * (1.0 + 0.3 * audioSwell);

    vec3 vp;

    if (j < 4.5)
    {
        // ---- One z-layer of qubit loop `j` ---------------------------
        float depth = 4.0 + fract(j * 0.371 + 0.23) * 6.5;      // 4.0 .. 10.5
        float halfH = depth * kTanY;

        float sx = ((j + 0.5) / NQUBIT - 0.5) * 2.0 * 0.98;
        float sy = (fract(j * 0.618034 + 0.21) - 0.5) * 2.0 * 0.72;
        float dph = time * 0.12 + j * 1.9;
        sx += cos(dph) * 0.05;
        sy += sin(dph * 0.79) * 0.07;
        vec3 ctr = vec3(sx * halfH * aspect, sy * halfH, depth);

        // circuitRadiusP still varies the die per activation, at half weight:
        // at full strength its top end swelled five loops into one blob.
        float cS = mix(1.0, (circuitRadiusP > 0.01 ? circuitRadiusP : 1.2) / 1.2, 0.5);
        // Loop radius as a fraction of the frustum half-height at its own
        // depth, so a far qubit is drawn as large as a near one.
        float rLoop = (0.30 + 0.09 * fract(j * 0.727 + 0.41)) * halfH * cS;
        float sc    = rLoop / 1.2;              // scale of the original 1.2 loop

        float loopAngle = u * 6.2831853;

        // Josephson junction array superinductance corrugations.  Capped:
        // a run is 50 segments long, and above ten corrugations per loop the
        // sine is sampled fewer than five times per period and beats into an
        // aliasing mess instead of reading as junctions.
        float nJunc = min((arrayJunctionsP > 0.01 ? arrayJunctionsP : 16.0), 10.0);
        float juncCorrugation = sin(u * nJunc * 6.2831853) * 0.05 * sc;

        float rCurrent = rLoop + juncCorrugation;
        float zLayer = ((rIndex - 9.5) * 0.07 + sin(loopAngle * 2.0 + t * 0.8) * 0.1) * sc;

        vec3 centerPos = vec3(cos(loopAngle) * rCurrent,
                              sin(loopAngle) * rCurrent,
                              zLayer);

        vec3 tangent  = vec3(-sin(loopAngle), cos(loopAngle), 0.0);
        vec3 binormal = normalize(cross(tangent, vec3(0.0, 0.0, 1.0)));

        float width = wBase * sc * taper;
        vec3 lp = centerPos + binormal * (side * width);

        // Each die site sits at its own attitude.
        float ra = t * 0.15 + j * 1.21;
        lp = vec3(lp.x * cos(ra) - lp.z * sin(ra), lp.y, lp.x * sin(ra) + lp.z * cos(ra));
        float rb = 0.42 * sin(t * 0.10 + j * 2.3);
        lp = vec3(lp.x, lp.y * cos(rb) - lp.z * sin(rb), lp.y * sin(rb) + lp.z * cos(rb));

        vp = ctr + lp;

        // Quantum phase slip / microwave pulse traveling through qubit loop
        vQubitPulse = exp(-abs(fract(u * 2.0 - t * 3.0 + rIndex * 0.2 + j * 0.31) - 0.5) * 16.0)
                    * (1.0 + 3.0 * audioKick) * taper;

        vCol = imgPalette(fract(rIndex * 0.166 + u * 0.3 + j * 0.11 + audioCentroid)) * taper;
    }
    else
    {
        // ---- Coplanar-waveguide readout trace ------------------------
        // One meander per ribbon, half of them running the full width of the
        // die and half its full height.  These are what carry the chip
        // between the qubits instead of leaving it bare.
        float fs = fract(rIndex * 0.618034 + 0.31);
        float fd = 5.0 + fract(rIndex * 0.371 + 0.17) * 14.0;    // depth 5 .. 19
        float halfH = fd * kTanY;

        float vert = step(0.5, fract(rIndex * 0.443 + 0.19));     // 0 = across, 1 = down
        float aTr  = vert * 1.5707963;
        vec2  dir  = vec2(cos(aTr), sin(aTr));
        vec2  nrm  = vec2(-dir.y, dir.x);

        float s    = (u - 0.5) * 2.0;
        float row  = (fract(rIndex * 0.917 + 0.07) - 0.5) * 2.0
                   * mix(1.02, 1.60, vert);
        // The characteristic meander of a readout resonator, drifting slowly.
        float mean = sin(s * (11.0 + 8.0 * fs) + rIndex * 1.3 + t * 0.55)
                   * (0.045 + 0.045 * fs);

        vec2 sxy = dir * (s * 2.4) + nrm * (row + mean);

        float width = (0.008 + 0.005 * fs) * halfH * (1.0 + 0.3 * audioSwell) * taper;

        vp = vec3(sxy.x * halfH + nrm.x * side * width,
                  sxy.y * halfH + nrm.y * side * width,
                  fd);

        // Microwave gate pulse running down the trace.
        vQubitPulse = exp(-abs(fract(u - t * 0.35 + rIndex * 0.13) - 0.5) * 14.0)
                    * (1.0 + 3.0 * audioKick) * taper * 0.55;

        // Wiring layer: clearly dimmer than the qubits, but bright enough
        // that no tile of the picture is ever empty.
        vCol = imgPalette(fract(rIndex * 0.083 + u * 0.12 + audioCentroid)) * 0.50 * taper;
    }

    vp.x -= eyeOff;

    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;
    if (vp.z < 0.4)
        gl_Position = vec4(0.0, 0.0, -3.0, 1.0);
}
