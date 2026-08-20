#version 330 core
/**
 * @file CymaticsPlate.vert
 * @brief Vertex stage companion to CymaticsPlate.frag -- see that file's header for
 * this scene's description.
 */
// CymaticsPlate.vert — Chladni figures done the physical way: 60k grains of
// "sand" on a square vibrating plate.  The plate's standing wave is the
// classic free-plate Chladni field
//     F(x,y) = cos(nπx)·cos(mπy) − cos(mπx)·cos(nπy)
// and each grain slides DOWN the vibration gradient (a few fixed gradient-
// descent steps per frame from its random home), so the sand collects on
// the nodal lines F = 0 — exactly what real sand does on a real plate.
//
// The (n,m) mode pair advances on a music-integrated clock (audioAdvance),
// and neighbouring figures CROSS-FADE (the descent runs on the blended
// field), so the sand visibly migrates from one figure to the next instead
// of jumping.  Kicks shake the plate: grains scatter with audioKick and
// re-converge as the envelope decays.  The plate surface itself vibrates
// between the nodal lines (grains on the lines stay still — physically
// right).
//
// An eighth of the grains are AIRBORNE instead: sand the plate has already
// thrown off, hanging in the light over the table, spread across the frustum
// so the picture is not a square figure between two black margins.  They are
// far dimmer than the plate and drift on audioAdvance.

in vec4 attrA;
in vec4 attrB;

uniform mat4  projM;
uniform float eyeOff;
uniform float time;
uniform vec2  resolution;
uniform float sceneSeed;

uniform float audioAdvance;
uniform float audioKick;
uniform float audioLevel;
uniform float audioSwell;
uniform float audioChromaHue;
uniform float audioDrop;
uniform float audioBeatPhase;   // 0..1 within the beat -> tempo-locked flutter

out vec4 vCol;

vec3 hueRot(vec3 c, float a)
{
    vec3  k = vec3(0.57735026919);
    float cs = cos(a), sn = sin(a);
    return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
}
float hash11(float n) { return fract(sin(n * 127.1) * 43758.5453); }

// Pick the k-th (n,m) pair from a fixed table of nicely distinct figures.
vec2 modePair(float k)
{
    float i = mod(k, 8.0);
    if (i < 0.5) return vec2(1.0, 2.0);
    if (i < 1.5) return vec2(2.0, 3.0);
    if (i < 2.5) return vec2(1.0, 4.0);
    if (i < 3.5) return vec2(3.0, 4.0);
    if (i < 4.5) return vec2(2.0, 5.0);
    if (i < 5.5) return vec2(3.0, 5.0);
    if (i < 6.5) return vec2(4.0, 5.0);
    return vec2(1.0, 3.0);
}

float chladni(vec2 p, vec2 nm)     // p in 0..1
{
    float PI = 3.1415927;
    return cos(nm.x * PI * p.x) * cos(nm.y * PI * p.y)
         - cos(nm.y * PI * p.x) * cos(nm.x * PI * p.y);
}
vec2 chladniGrad(vec2 p, vec2 nm)
{
    float PI = 3.1415927;
    float dx = -nm.x * PI * sin(nm.x * PI * p.x) * cos(nm.y * PI * p.y)
             + nm.y * PI * sin(nm.y * PI * p.x) * cos(nm.x * PI * p.y);
    float dy = -nm.y * PI * cos(nm.x * PI * p.x) * sin(nm.y * PI * p.y)
             + nm.x * PI * cos(nm.y * PI * p.x) * sin(nm.x * PI * p.y);
    return vec2(dx, dy);
}

void main()
{
    float idx = attrA.w;
    float r1 = attrB.x, r2 = attrB.y, r3 = attrB.z, r4 = attrB.w;

    // Mode clock: advances with the music, cross-fades over the last 25 %.
    float clockv = audioAdvance * 0.22 + sceneSeed * 8.0;
    vec2 nmA = modePair(floor(clockv));
    vec2 nmB = modePair(floor(clockv) + 1.0);
    float w  = smoothstep(0.75, 1.0, fract(clockv));

    // Grain home + kick scatter (decays with the kick envelope itself).
    vec2 p = vec2(r1, r2);
    float sc = audioKick * 0.045 * (0.3 + 0.7 * r4);
    p += vec2(hash11(idx * 3.1) - 0.5, hash11(idx * 7.7) - 0.5) * sc;

    // Gradient descent of F² onto the nodal lines of the BLENDED field.
    // ~1/5 of the grains take only 1-2 steps and stay a diffuse dust field —
    // that dust is what makes the PLATE itself visible (the scan showed the
    // fully-converged version as thin lines floating in a void, 2 % cover).
    float steps = (r3 < 0.22) ? 1.0 + floor(r3 * 9.0)
                              : 5.0 + floor((r3 - 0.22) * 6.4);
    for (int i = 0; i < 9; ++i)
    {
        if (float(i) >= steps) break;
        float FA = chladni(p, nmA), FB = chladni(p, nmB);
        float F  = mix(FA, FB, w);
        vec2  G  = mix(chladniGrad(p, nmA), chladniGrad(p, nmB), w);
        float g2 = dot(G, G) + 1e-4;
        // Newton-ish step toward F = 0, capped so grains never overshoot.
        vec2 stepv = G * (F / g2);
        stepv = clamp(stepv, vec2(-0.06), vec2(0.06));
        p -= stepv;
    }
    p = clamp(p, 0.0, 1.0);

    // Residual field at the grain -> vibration + brightness.
    float Ff = mix(chladni(p, nmA), chladni(p, nmB), w);

    // Plate space: 26x26 units in xz, gently vibrating in y BETWEEN the
    // nodal lines. The flutter used to be sin(time*47) -- a FIXED 7.5 Hz that
    // was both the fastest term in the whole catalog and completely unrelated
    // to the music. Two cycles per beat is tempo-locked instead (4 Hz at
    // 120 BPM, and it follows the tempo), and stays inside the 4 Hz
    // camera/geometry ceiling in Tools/temporal_budget.py. audioBeatPhase
    // wraps 0->1 each beat, so an INTEGER cycle count is continuous across the
    // wrap -- no jump. A slow fixed component keeps the plate alive in silence.
    vec2 q = (p - 0.5) * 26.0;
    float flutter = sin(audioBeatPhase * 6.2831853 * 2.0) * 0.75
                  + sin(time * 3.0) * 0.25;
    float vib = Ff * flutter * (0.25 + 1.1 * audioLevel) * 0.55;
    vec3 world = vec3(q.x, vib + 0.15, q.y);

    // Slow orbit around the plate, camera looking down at a tilt.  The
    // framing is deliberately tight (steeper tilt, closer dolly): the metric
    // scan showed the old 30-unit distance left the plate at 2 % coverage —
    // a Chladni figure the size of a postage stamp.
    float oa = time * 0.045;
    world.xz = mat2(cos(oa), -sin(oa), sin(oa), cos(oa)) * world.xz;
    float tilt = 1.15;
    world.yz = mat2(cos(tilt), -sin(tilt), sin(tilt), cos(tilt)) * world.yz;

    vec3 vp = world + vec3(0.0, 1.5, 21.0);

    // Sand: warm off-white, brightest ON the nodal line (|F| small); the
    // scattered dust glows dimly too, so the whole plate reads as a surface
    // instead of thin lines floating in the void.
    float onLine = exp(-abs(Ff) * 6.0);
    vec3 col = mix(hueRot(vec3(0.16, 0.14, 0.19), audioChromaHue),
                   vec3(1.0, 0.94, 0.80),
                   onLine);
    // The on-line/off-line RATIO used to be 0.50..1.30 on top of an already
    // 16:1 colour step.  Multiplied by the ~50:1 density ratio the descent
    // produces, the nodal line ran several hundred times over white and every
    // bit of that surplus was discarded by the additive clamp.  Flattened to
    // 0.75..1.05: the line is bright because it is DENSE, which is what makes
    // a real Chladni figure bright, and the surplus now lands on the dust
    // between the lines instead of in the bin.
    col *= (0.75 + 0.30 * onLine) * (0.75 + 0.5 * audioSwell + 0.9 * audioDrop);

    // Sprite footprint.  At the old 150/13 the plate grains came out 3-6 px
    // wide at 1080p -- below the ~6 px that survives the frame downscale, so
    // the figure averaged away toward black no matter how bright each grain
    // was.  240/20 puts a grain at 5-10 px, which the picture can actually
    // resolve.
    float sizeBase = 240.0, sizeCap = 20.0, sizeMin = 2.0;

    // ---- AIRBORNE DUST ---------------------------------------------------
    // A square plate in a 16:9 frame can never reach the left and right edges:
    // the scan measured the picture 40 % empty, all of it down the sides.  An
    // eighth of the grains are therefore airborne instead — sand the plate has
    // already thrown off, hanging in the light over the table.  Placed in
    // FRUSTUM coordinates (x,y scaled by depth), so the motes stay evenly
    // spread across the whole picture at every distance.  The layer is picked
    // by MIXING the seeds, not by cutting a band out of r1/r2 (those are the
    // grain's home on the plate — a band of them missing would bite a hole in
    // the figure).  Mixing beats hashing the index here: idx runs to 60000 and
    // sin() of a seven-digit argument bands badly in 32-bit floats.
    float lay = fract(r3 * 17.0 + r4 * 29.0 + 0.37);
    if (lay < 0.13)
    {
        const float kTanY = 0.5206;
        float aspect = (resolution.y > 0.5) ? resolution.x / resolution.y : 1.7778;
        // The grain's plate home is free to be reused as the mote's position:
        // this one is not on the plate any more.
        float hx = r1;
        float hy = r2;
        float hz = fract(r1 * 13.0 + r2 * 7.0 + 0.11);
        float dz = 9.0 + hz * 60.0;
        // Motes turn slowly in the air: a fixed drift plus the music-integrated
        // advance, never absolute time scaled by an audio value.
        float ph = r2 * 6.2831853 + time * 0.06 + audioAdvance * 0.05;
        // 2.0 would fit the frustum exactly; 2.3 so the field still reaches
        // past all four edges when the preset camera rig rolls and yaws.
        float open = 2.3;
        vp = vec3((hx - 0.5) * open * dz * kTanY * aspect + 1.1 * cos(ph),
                  (hy - 0.5) * open * dz * kTanY          + 1.1 * sin(ph * 0.83),
                  dz);
        col = mix(hueRot(vec3(0.16, 0.14, 0.19), audioChromaHue),
                  vec3(1.0, 0.94, 0.80), 0.40)
            // 0.055/0.105 scaled by 3.0/2.2, so the airborne layer keeps its
            // old absolute level after the vCol gain below came down.
            * (0.075 + 0.143 * r4) * (0.8 + 0.4 * audioSwell + 0.5 * audioDrop)
            * clamp(1.0 - dz / 120.0, 0.0, 1.0);
        // A mote has to stay a legible speck: below ~3 px an additive sprite
        // averages away to nothing and the far field reads as black again.
        sizeBase = 130.0; sizeCap = 13.0; sizeMin = 3.0;
    }

    vp.x -= eyeOff;
    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.05 * gl_Position.w;
    if (vp.z < 0.5)
        gl_Position = vec4(0.0, 0.0, -3.0, 1.0);

    float px   = resolution.y / 1080.0;
    float dist = max(vp.z, 0.5);
    gl_PointSize = clamp(sizeBase * (0.4 + 0.5 * r4) * px / dist,
                         sizeMin, max(sizeCap * px, sizeMin));

    // 3.0 -> 2.2: with the wider sprite each grain now covers ~4x the pixels,
    // so the same 3.0 would only have widened the saturated core instead of
    // lighting more of the plate.
    vCol = vec4(col * 2.2, 1.0);
}
