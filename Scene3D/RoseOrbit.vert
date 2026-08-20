#version 330 core
/**
 * @file RoseOrbit.vert
 * @brief Vertex stage companion to RoseOrbit.frag -- see that file's header for
 * this scene's description.
 *
 * Audio Reactivity:
 *   audioAdvance   -> flow of particles along the curves, the 3-axis
 *                     precession of all three roses, and the slow circling
 *                     drift of the pollen field
 *                     (pre-integrated, never a factor on absolute time)
 *   audioBass      -> petal radius pulse
 *   audioSwell     -> overall glow of the three roses and of the pollen
 *   audioChromaHue -> hue turn along theta (musical key)
 *   audioSpread    -> DISPERSION: a narrow spectrum draws the streams into one
 *                     thin drawn line and keeps the pollen field close in,
 *                     rich wide harmonics let the line bloom into a soft tube
 *                     and open the pollen out across the whole frame.  The
 *                     pollen extent only ever grows from an already
 *                     frame-filling base, so a thin mix cannot bunch the
 *                     additive sprites together and brighten the picture
 *   audioRoughness -> PETAL FRAY: consonant harmony keeps each petal a clean
 *                     analytic arc, dissonant clusters serrate its outline
 *                     (amplitude only -- the fray's spatial frequency is a
 *                     constant, so the accumulated theta is never remapped)
 *   audioMode      -> petal colour temperature: minor cools all three roses
 *                     and the pollen to blue, major restores the warm pink /
 *                     amber pair
 *
 * NOTE: the petal count k must NOT be audio-driven -- it multiplies theta,
 * which contains absolute `time`, so any change to it would remap the whole
 * accumulated phase in one frame (the project-wide anti-flicker rule).
 */
// RoseOrbit.vert — THREE nested rose curves (r = cos(k*theta)) drawn by
// orbiting particle streams on tilted planes that precess independently of
// one another, plus a fine field of shed pollen drifting through the whole
// view volume.  One rose alone left three quarters of the frame dead black
// (and went nearly edge-on every time its plane tumbled through the view
// direction); three of them at different scales, depths and tumble phases
// always keep a full flower facing the camera, and the pollen carries the
// corners the petals cannot reach.  Spirograph serenity.

in vec4 attrA;
in vec4 attrB;

uniform mat4  projM;
uniform float eyeOff;
uniform float time;
uniform vec2  resolution;

uniform float audioAdvance;
uniform float audioSwell;
uniform float audioBass;
uniform float audioChromaHue;
uniform float audioSpread;
uniform float audioRoughness;
uniform float audioMode;

out vec4 vCol;

vec3 hueRot(vec3 c, float a)
{
    vec3  k = vec3(0.57735026919);
    float cs = cos(a), sn = sin(a);
    return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
}

float hsh(float a, float b, float s)
{
    return fract(sin(a * 91.73 + b * 47.31 + s) * 43758.5453);
}

void main()
{
    float r1 = attrB.x, r2 = attrB.y, r3 = attrB.z, r4 = attrB.w;

    float mmaj = clamp(audioMode, 0.0, 1.0);
    float spr  = clamp(audioSpread, 0.0, 1.0);

    // The scene projection: 55 deg vertical FOV (see Scene3DShader::draw).
    // Placing the pollen in FRUSTUM coordinates rather than in a fixed world
    // box is what makes the field even across the picture at every depth.
    const float kTanY = 0.5206;
    float aspect = (resolution.y > 0.5) ? resolution.x / resolution.y : 1.7778;

    vec3  vp;
    vec3  col;
    float sizeBase, sizeCap, sizeMin, gain;

    if (r1 < 0.18)
    {
        // ---- POLLEN --------------------------------------------------
        // Fine dust the roses shed, spread evenly over the frustum from just
        // in front of the camera out to the far haze.  It is a background
        // layer: clearly dimmer than any petal, but bright enough that no
        // tile of the picture is ever empty.
        float hx = hsh(r2, r3, 0.31);
        float hy = hsh(r3, r4, 1.77);
        float hz = hsh(r4, r2, 2.93);

        float dz = 15.0 + hz * 78.0;
        float ph = r2 * 6.2831853 + time * 0.06 + audioAdvance * 0.05;

        // 2.0 would fit the frustum exactly; the base is 2.25 so the field
        // still reaches past all four edges when the preset camera rig rolls
        // and yaws the view (every Scene3D preset carries one), and spectral
        // spread only ever opens it further.
        float open = 2.25 + 0.35 * spr;
        vp = vec3((hx - 0.5) * open * dz * kTanY * aspect + 2.6 * cos(ph),
                  (hy - 0.5) * open * dz * kTanY          + 2.6 * sin(ph * 0.83),
                  dz);

        col = mix(vec3(0.42, 0.52, 0.92), vec3(0.92, 0.52, 0.46), mmaj);
        col = hueRot(col, audioChromaHue * 0.45);
        col *= (0.30 + 0.42 * r3) * (0.75 + 0.5 * audioSwell)
             * clamp(1.0 - dz / 150.0, 0.0, 1.0);
        // A grain of pollen has to stay a legible speck at any distance --
        // below roughly two and a half pixels an additive sprite averages
        // away to nothing and the far half of the field reads as black again.
        sizeBase = 86.0;
        sizeCap  = 9.0;
        sizeMin  = 2.8;
        gain     = 4.2;
    }
    else
    {
        // ---- ROSES ---------------------------------------------------
        // Layer 0 = the front rose (the subject), 1 = the mid rose, 2 = a
        // wide outer rose whose petals sweep past the frame edges.
        float lf = (r1 < 0.46) ? 2.0 : ((r1 < 0.72) ? 1.0 : 0.0);
        sizeMin = 1.5;
        gain    = 2.6;

        float k, R0, zc, spin, thr, bri;
        vec3  pc;
        if (lf < 0.5)
        {
            k = 2.5;  R0 = 17.0;  zc = 34.0;  spin =  0.080;  thr = 0.090;
            bri = 0.80;
            pc = mix(vec3(0.45, 0.55, 0.95), vec3(0.95, 0.35, 0.55), mmaj);
            sizeBase = 100.0;  sizeCap = 13.0;
        }
        else if (lf < 1.5)
        {
            k = 3.5;  R0 = 25.0;  zc = 45.0;  spin = -0.050;  thr = 0.062;
            bri = 0.50;
            pc = mix(vec3(0.30, 0.45, 0.85), vec3(0.85, 0.55, 0.35), mmaj);
            sizeBase = 120.0;  sizeCap = 12.0;
        }
        else
        {
            k = 4.5;  R0 = 36.0;  zc = 56.0;  spin =  0.032;  thr = 0.045;
            bri = 0.40;
            pc = mix(vec3(0.35, 0.50, 0.90), vec3(0.90, 0.50, 0.40), mmaj);
            sizeBase = 145.0;  sizeCap = 11.0;
        }

        // theta runs twice around for closure; particles stream along it.
        float th = r2 * 12.5663706 + time * thr + audioAdvance * 0.15;
        float R  = R0 * abs(cos(k * th)) * (1.0 + 0.05 * audioBass);

        // PETAL FRAY: sensory dissonance serrates the petal outline.  Only the
        // amplitude is audio-driven; the 9.0 spatial frequency on theta stays a
        // constant, so the accumulated phase is never remapped.
        R *= 1.0 + 0.28 * clamp(audioRoughness, 0.0, 1.0)
                  * sin(th * 9.0 + r4 * 6.2831853);

        float rot = time * spin;
        vec2 p = vec2(cos(th + rot), sin(th + rot)) * R;

        // Thicken the line into a soft tube of particles.  SPECTRAL SPREAD sets
        // how wide: a narrow spectrum draws one thin line, rich harmonics bloom
        // it into a soft tube.  The outer roses get a proportionally fatter
        // tube so they stay legible at their distance.
        p += vec2(r3 - 0.5, r4 - 0.5)
           * (1.1 * (0.80 + 0.60 * spr) * (1.0 + 0.55 * lf));

        // 3-AXIS SPIN (user feedback): each rose turns around all of its axes,
        // and each layer gets its OWN rates and phase offsets -- otherwise all
        // three planes go edge-on to the camera at the same instant and the
        // whole picture collapses to a line.
        float tilt = 0.75;
        float rx = tilt + time * (0.170 - 0.035 * lf) + lf * 1.93;
        float ry = time * (0.230 - 0.045 * lf) + lf * 2.61 + audioAdvance * 0.08;
        float rz = time * (0.110 + 0.025 * lf) + lf * 1.17;
        vec3 q = vec3(p, 0.0);
        q.xz = mat2(cos(ry), -sin(ry), sin(ry), cos(ry)) * q.xz;
        q.yz = mat2(cos(rx), -sin(rx), sin(rx), cos(rx)) * q.yz;
        q.xy = mat2(cos(rz), -sin(rz), sin(rz), cos(rz)) * q.xy;
        vp = q + vec3(0.0, 0.0, zc);

        // Petal hue turns with position; the outer roses are cooler and
        // fainter.  MODE sets each pair's temperature before the key's hue
        // turn.  All endpoints are luminance-matched, so this is a tint and
        // not a gain.
        col = hueRot(pc, audioChromaHue + th * 0.12);
        col *= bri * (0.75 + 0.5 * audioSwell) * (0.5 + 0.5 * r3);
    }

    vp.x -= eyeOff;
    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.05 * gl_Position.w;
    if (vp.z < 0.4)
        gl_Position = vec4(0.0, 0.0, -3.0, 1.0);

    float px   = resolution.y / 1080.0;
    float dist = max(vp.z, 0.5);
    gl_PointSize = clamp(sizeBase * (0.4 + 0.8 * r4) * px / dist,
                         sizeMin, max(sizeCap * px, sizeMin));

    vCol = vec4(col * gain, 1.0);
}
