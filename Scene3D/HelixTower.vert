#version 330 core
/**
 * @file HelixTower.vert
 * @brief Vertex stage companion to HelixTower.frag -- see that file's header for
 * this scene's description.
 */
// HelixTower.vert — a 100-unit DNA double helix of glowing points; the base
// pair "rungs" light up with their spectrum band, a kick wave climbs the
// tower, the camera spirals slowly around it through a haze of nucleoplasm.
//
// A 6-unit helix seen from 22 units away was a thin vertical thread down the
// middle of a black frame (occ 0.29), drawn with 1.5-3 px points.  The helix
// is nearly twice as wide, the camera sits closer so it fills the frame edge
// to edge, the sprites are large enough to read, and a sixth of the points
// become a haze placed in FRUSTUM coordinates so the corners are never empty.

in vec4 attrA;   ///< Vertex attribute A (meaning per geometry kind, see the stage's header; e.g. position or u/v and an index).
in vec4 attrB;   ///< Vertex attribute B (meaning per geometry kind; e.g. normal or per-element seeds).

uniform mat4  projM;   ///< Projection matrix.
uniform float eyeOff;   ///< Stereo eye offset (0 in mono).
uniform float time;   ///< Seconds since the program started (never reset; see sceneTime).
uniform vec2  resolution;   ///< Size of the render target in pixels.

uniform float audioPhase;   ///< Rotation phase driven by the music (integrated, never jumps).
uniform float audioAdvance;   ///< The music's advance: integrated tempo-weighted energy (never jumps, never runs backwards).
uniform float audioSpectrum[32];   ///< Spectrum bands, 0..1.
uniform float audioKick;   ///< Kick-drum envelope, 0..1 (fast attack, short decay).
uniform float audioBeatPhase;   ///< Position within the current beat, 0..1.
uniform float audioChromaHue;   ///< Hue of the dominant pitch class (radians, unwrapped: continuous).
uniform float audioSwell;   ///< Slow loudness envelope, 0..1 (seconds).
uniform float audioDrop;   ///< Drop envelope: high after a detected drop, decaying.

out vec4 vCol;   ///< Colour (from the vertex stage).

/// @brief Rotates a colour's hue by an angle (about the grey axis).
vec3 hueRot(vec3 c, float a)
{
    vec3  k = vec3(0.57735026919);
    float cs = cos(a), sn = sin(a);
    return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
}

/// @brief Pseudo-random number 0..1 from two values and a seed.
float hsh(float a, float b, float s)
{
    return fract(sin(a * 91.73 + b * 47.31 + s) * 43758.5453);
}

/// @brief Entry point of this shader stage (the file description says what it draws).
void main()
{
    float r1 = attrB.x, r2 = attrB.y, r3 = attrB.z, r4 = attrB.w;

    // The scene projection: 55 deg vertical FOV (see Scene3DShader::draw).
    const float kTanY = 0.5206;
    float aspect = (resolution.y > 0.5) ? resolution.x / resolution.y : 1.7778;

    bool haze = hsh(r1, r2, 5.13) < 0.17;

    vec3  vp;
    vec3  col;
    float sizeBase, sizeCap, sizeMin;
    float wave = 0.0;

    if (haze)
    {
        // ---- NUCLEOPLASM HAZE ----------------------------------------
        // Free nucleotides drifting around the tower, spread evenly over the
        // frustum from just in front of the camera out to the far dark.  A
        // background layer: clearly dimmer than the helix, but bright enough
        // that no tile of the picture is ever empty.  Placed directly in
        // camera space, so the spiralling camera does not sweep it around.
        float hx = hsh(r2, r3, 0.41);
        float hy = hsh(r3, r4, 1.83);
        float hz = hsh(r4, r2, 3.07);

        float dz = 10.0 + hz * 76.0;
        float ph = r2 * 6.2831853 + time * 0.06 + audioAdvance * 0.05;

        // 2.0 would fit the frustum exactly; 2.3 so the field still reaches
        // past all four edges when the preset camera rig rolls and yaws.
        float open = 2.3;
        vp = vec3((hx - 0.5) * open * dz * kTanY * aspect + 1.8 * cos(ph),
                  (hy - 0.5) * open * dz * kTanY          + 1.8 * sin(ph * 0.79),
                  dz);

        col = hueRot(vec3(0.30, 0.72, 0.90), audioChromaHue * 1.2 + hz * 1.4)
            * (0.24 + 0.34 * r3) * (0.8 + 0.4 * audioSwell)
            * clamp(1.0 - dz / 150.0, 0.0, 1.0);

        // A speck must stay legible at any distance -- below roughly two and a
        // half pixels an additive sprite averages away to nothing and the far
        // field reads as black again.
        sizeBase = 100.0;
        sizeCap  = 11.0;
        sizeMin  = 2.7;
    }
    else
    {
        bool  rung   = fract(r4 * 7.31) < 0.22;
        float strand = step(0.5, r1);
        float t      = rung ? floor(r2 * 46.0) / 46.0 : r2;   // rungs quantised
        float y      = (t - 0.5) * 100.0;
        float angH   = t * 28.0 + time * 0.06 + audioPhase * 0.10;

        // Helix radius 11 (was 6): from a 20-unit camera orbit the double
        // strand now reaches roughly 80% of the way to both side edges instead
        // of hugging the middle third.
        const float kHelixR = 11.0;
        vec3 pA = vec3(cos(angH) * kHelixR,            y, sin(angH) * kHelixR);
        vec3 pB = vec3(cos(angH + 3.14159) * kHelixR,  y, sin(angH + 3.14159) * kHelixR);
        vec3 world = rung ? mix(pA, pB, r3)
                          : (strand > 0.5 ? pB : pA)
                            + vec3(r3 - 0.5, 0.0, r4 - 0.5) * 1.2;

        // Kick wave climbing the tower with the beat phase.
        wave = exp(-abs(y - (audioBeatPhase * 100.0 - 50.0)) * 0.15) * audioKick;

        // Camera spirals around the tower.
        float ca  = time * 0.07 + audioAdvance * 0.12;
        vec3 cam  = vec3(cos(ca) * 20.0, sin(time * 0.05) * 22.0, sin(ca) * 20.0);
        vec3 fwd  = normalize(vec3(0.0, cam.y * 0.35, 0.0) - cam);
        vec3 rgt  = normalize(cross(fwd, vec3(0.0, 1.0, 0.0)));
        vec3 up   = cross(rgt, fwd);
        vec3 rel  = world - cam;
        vp = vec3(dot(rel, rgt), dot(rel, up), dot(rel, fwd));

        // Strands in two key-driven hues; rungs glow with their spectrum band.
        if (rung)
        {
            int band = int(mod(floor(t * 46.0), 32.0));
            col = hueRot(vec3(1.0, 0.7, 0.3), audioChromaHue + t * 2.0)
                * (0.5 + 2.2 * audioSpectrum[band]);
        }
        else
            col = hueRot(vec3(0.2, 0.85, 0.8), strand * 2.6 + audioChromaHue * 1.2)
                * (0.55 + 0.45 * r3);
        col *= 1.0 + 1.6 * wave + 1.2 * audioDrop;
        col *= (0.8 + 0.4 * audioSwell) * clamp(1.0 - vp.z / 90.0, 0.0, 1.0);

        sizeBase = rung ? 115.0 : 88.0;
        sizeCap  = 26.0;
        sizeMin  = 2.2;
    }

    vp.x -= eyeOff;
    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.05 * gl_Position.w;
    if (vp.z < 0.4)
        gl_Position = vec4(0.0, 0.0, -3.0, 1.0);

    float px   = resolution.y / 1080.0;
    float dist = max(vp.z, 0.5);
    gl_PointSize = clamp(sizeBase * (1.1 + 0.7 * r4) * px / dist, sizeMin, max(sizeCap * px, sizeMin)) * (2.0 + 0.8 * wave);   // sprite sweep 2026-08-22: measured luma 0.031, area x4.5

    vCol = vec4(col * 2.0, 1.0);
}
