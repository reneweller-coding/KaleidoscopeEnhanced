#version 330 core
out vec4 fragColor;
/**
 * @file SpiralStairwellDescent.frag
 * @brief SPIRAL STAIRWELL DESCENT: looking straight down an endless spiral
 * staircase.  The steps wind around a central well; the camera descends
 * steadily on the scene clock, so the steps rise toward us and pass, and
 * the well below stays a dark eye.  The steps carry the photo as inlaid
 * treads; lamps on every turn glow with the bands; the kick lights the
 * banister.  The descent is periodic in one step, so it is seamless; the
 * camera never jolts.
 *
 * Audio Reactivity:
 *   sceneAdvance      -> the descent (music-paced, periodic)
 *   audioSpectrum[32] -> lamp brightness per turn (light)
 *   audioKick         -> banister flash (light)
 *   audioSwell        -> well glow from below (slow)
 *   audioLevel        -> brightness
 *
 * Per-activation variety: turnsP (steps per turn), wellP (well radius), hueP.
 */
uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float sceneAdvance;
uniform float sceneTime;
uniform float audioAdvance;
uniform float audioSpectrum[32];
uniform float audioKick;
uniform float audioSwell;
uniform float audioLevel;
uniform float audioChromaHue;
uniform float audioValence;

uniform float turnsP;
uniform float wellP;
uniform float hueP;

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
    float aspect = resolution.x / resolution.y;
    vec2 p = (gl_FragCoord.xy / resolution - 0.5) * vec2(aspect, 1.0);

    float hue = (hueP > 0.001) ? hueP : 0.0;
    float stepsPerTurn = 12.0 + 8.0 * clamp(turnsP, 0.0, 1.0);
    float rIn = 0.12 + 0.1 * clamp(wellP, 0.0, 1.0);          // the well
    const float rOut = 1.0;                                    // outer wall
    float riseTotal = 1.0;                                     // height of one turn
    float descent = sceneAdvance * 0.5 + sceneTime * 0.12;     // in turns

    // Looking down the axis: each pixel is a ray from the eye at height 0
    // down into the well.  A point at depth d (below the eye) at radius r
    // projects to screen radius r / (d * 0.52).  Invert: for this pixel with
    // screen radius R and angle a, the ray hits the staircase at the depth
    // where the helix's step surface is at radius R * d * 0.52.
    float R = length(p);
    float a = atan(p.y, p.x);
    vec3 col = vec3(0.0);
    // March depth: the step surfaces are the treads (horizontal) at heights
    // that depend on the angle: tread height h(theta) = -(theta / 2pi +
    // stepIndex) * riseTotal, quantised into steps.  We march d and test
    // whether the radius at that depth is between rIn and rOut and whether
    // the tread at that angle is above the ray.
    float trans = 1.0;
    float hitD = -1.0; float hitR = 0.0; float hitAng = 0.0; float hitStep = 0.0; float wallHit = 0.0;
    float d = 0.15;
    for (int i = 0; i < 90; ++i)
    {
        float r = R * d * 0.52 * 2.0;                          // radius at this depth
        if (r > rOut) { wallHit = 1.0; hitD = d; hitR = r; hitAng = a; break; }
        if (r > rIn)
        {
            // Tread height at this angle (helix descending clockwise): the
            // continuous helix height plus the quantisation into steps.
            float turnsHere = (a / 6.2831853);                  // -0.5..0.5
            float k = floor((d + descent - turnsHere * riseTotal) / riseTotal);   // which turn
            float hHelix = (turnsHere + k) * riseTotal - descent;   // height (depth) of the helix at this angle in turn k
            float stepIdx = floor(turnsHere * stepsPerTurn + k * stepsPerTurn);
            float hStep = (stepIdx / stepsPerTurn) * riseTotal - descent;
            // The ray at depth d has passed the tread if d >= hStep (tread is
            // a horizontal surface at depth hStep, at this angle).
            if (d >= hStep && d < hStep + 0.02 + 0.06)
            {
                hitD = hStep; hitR = r; hitAng = a; hitStep = stepIdx; break;
            }
        }
        d += 0.045 + d * 0.03;
        if (d > 9.0) break;
    }
    if (hitD > 0.0)
    {
        if (wallHit > 0.5)
        {
            // Outer wall: stone with lamps at every turn.
            float turn = fract((hitD + descent) / riseTotal);
            float lamp = pow(0.5 + 0.5 * cos(turn * 6.2831853), 20.0);
            int band = int(mod(floor((hitD + descent) / riseTotal) + 8.0, 32.0));
            float e = clamp(audioSpectrum[band] * 1.6, 0.0, 1.0);
            vec3 stone = imgPalette(hue * 0.159 + 0.6) * 0.25 * (0.5 + 0.5 * cos(hitAng * 24.0) * 0.2);
            col = stone * (0.4 + 0.6 * audioLevel) + imgPalette(hue * 0.159 + 0.05) * lamp * (0.4 + 1.6 * e);
        }
        else
        {
            // A tread: the photo inlaid, radial grain, nosing highlight.
            float u = (hitR - rIn) / (rOut - rIn);
            vec2 uv = vec2(fract(hitStep / stepsPerTurn * 3.0), u);
            vec3 tread = img(uv) * imgPalette(hue * 0.159 + 0.15) * 1.6;
            float nose = exp(-abs(fract(hitAng / 6.2831853 * stepsPerTurn) - 0.5) * 12.0);
            col = tread * (0.5 + 0.5 * audioLevel) + imgPalette(hue * 0.159 + 0.9) * nose * (0.15 + 0.6 * audioKick) * step(0.85, u);
            // Banister at the inner edge.
            float ban = exp(-abs(u - 0.06) * 30.0);
            col += imgPalette(hue * 0.159 + 0.85) * ban * (0.3 + 1.0 * audioKick);
        }
        float fog = 1.0 - exp(-hitD * 0.35);
        col = mix(col, imgPalette(hue * 0.159 + 0.6) * 0.04, clamp(fog, 0.0, 0.92));
    }
    else
    {
        // The well: dark, a glow from far below on the swell.
        col = imgPalette(hue * 0.159 + 0.1) * exp(-R * 6.0) * (0.15 + 0.6 * clamp(audioSwell, 0.0, 1.0));
    }

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
