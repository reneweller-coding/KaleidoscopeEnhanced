#version 330 core
/**
 * @file SpectroWeave.vert
 * @brief Vertex stage companion to SpectroWeave.frag -- see that file's header for
 * this scene's description.
 */
// SpectroWeave.vert — the bundle arrives finished; fly the camera down its axis.
//
// Two primitive families arrive, told apart by attrB.w: the strand tubes
// (band 0..1) and the dust motes that fill the frame behind them (band = -1,
// with seeds in attrA.xyz and the quad corner in attrB.xy instead of a
// position and a normal).  The dust is placed HERE and not in the compute
// stage because only this stage knows the aspect ratio, and the point of it
// is to be laid out in FRUSTUM coordinates -- x and y scaled by depth -- so
// it covers the picture evenly however far away it is.

in vec4 attrA;      // xyz = position (or dust seeds), w = band energy / dust size
in vec4 attrB;      // xyz = normal (or quad corner), w = band 0..1, -1 = dust

out vec3  vWorld;
out vec3  vNormal;
out vec3  vView;
out float vEnergy;
out float vBand;
out float vDist;
out vec2  vQuad;

uniform mat4  projM;
uniform float eyeOff;
uniform float time;
uniform vec2  resolution;
uniform float audioAdvance;
uniform float audioLevel;

uniform float camHP;

void main()
{
    // The camera drifts off the bundle's axis and back, so the weave is seen
    // from inside and from beside it in turn.
    float ox = 1.9 * sin(audioAdvance * 0.045);
    float oy = 1.4 * cos(audioAdvance * 0.031);

    vec3 p;
    vec3 vp;

    if (attrB.w < -0.5)
    {
        // ---- DUST ------------------------------------------------------
        // The scene projection: 55 deg vertical FOV (see Scene3DShader::draw).
        const float kTanY = 0.5206;
        float aspect = (resolution.y > 0.5) ? resolution.x / resolution.y : 1.7778;

        float hx = attrA.x, hy = attrA.y, hz = attrA.z, hs = attrA.w;

        // Kept beyond the cable's far end (z = 176), so an opaque mote can
        // never punch a dim disc through a strand -- but ALSO inside the far
        // plane.  Scene3DShader::draw clips at 220 (EffectShader::kSceneFar)
        // and these motes are flat quads at a constant z, so at the old
        // 185..335 the clipper threw away every one past 220: 385 of the 512,
        // three quarters of the only thing in this scene that fills the corners
        // of the frame.  180..214 keeps the whole field.
        float dz = 180.0 + hz * 34.0;
        float ph = hx * 6.2831853 + time * 0.04 + audioAdvance * 0.03;

        // 2.0 would fit the frustum exactly; 2.3 so the field still reaches
        // past all four edges when the preset camera rig rolls and yaws.
        float open = 2.3;
        vec3 c = vec3((hx - 0.5) * open * dz * kTanY * aspect + 6.0 * cos(ph),
                      (hy - 0.5) * open * dz * kTanY          + 6.0 * sin(ph * 0.79),
                      dz);
        // Grows with depth so its ON-SCREEN size stays roughly constant; below
        // about 2.5 px a mote averages away and the far field reads black.
        float sz = (0.026 + 0.040 * hs) * dz;

        vQuad = attrB.xy;
        p  = c + vec3((attrB.xy * 2.0 - 1.0) * sz, 0.0);
        vp = vec3(p.x - ox - eyeOff, p.y - oy - camHP, p.z);

        vNormal = vec3(0.0, 0.0, 1.0);
        vEnergy = fract(hs * 7.31 + hx * 3.17);   // per-mote brightness seed
        vDist   = 0.0;                            // dust runs its own fade
    }
    else
    {
        p  = attrA.xyz;
        vp = vec3(p.x - ox - eyeOff, p.y - oy - camHP, p.z);

        vQuad   = vec2(0.5);
        vNormal = attrB.xyz;
        vEnergy = attrA.w;
        vDist   = p.z;
    }

    vWorld  = p;
    vView   = normalize(-vp);
    vBand   = attrB.w;

    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;
    if (vp.z < 0.4)
        gl_Position = vec4(0.0, 0.0, -3.0, 1.0);
}
