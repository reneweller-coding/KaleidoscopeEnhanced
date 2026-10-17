//@doc
 * @brief KERR SELF-FOCUSING FILAMENTS: an intense light beam in a Kerr medium focuses itself -- where it is brighter
 * the medium refracts more, which gathers more light there -- and breaks up into filaments that wander, merge and
 * split as the beam travels on.  Shown as the beam's history: the propagation runs outward from the centre line,
 * each row one step of the nonlinear Schroedinger equation (saturable, so the filaments do not collapse), mirrored
 * up and down.  The filaments carry the photo's colours.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell      -> the beam's power: loud passages break it into more filaments
 *   audioOnset      -> noise is sprinkled into the beam (new filaments seed there)
 *   audioKick       -> the filaments flash (light)
 *
 * Knobs: powerP (the base power), spreadP (how much the filaments wander), photoP (photo share), hueP.
//@params powerP spreadP photoP
//@audio audioSwell audioKick audioOnset
//@state 256 160 40 32
//@body
/**  One propagation step for this cell (the state pass): the ring buffer's next row is the saturable 1D nonlinear
 * Schroedinger equation advanced by leapfrog from the two rows before it; every other row keeps its step.
 *
 * @return
 *   Re A, Im A, |A|^2, 1.
 **/
vec4 stateStep()
{
    ivec2 ip = stCell();
    int h = int(stateRes.y);
    if (stateFrame < 1.5) {
        // the input beam: a broad, slightly noisy profile in the first two rows
        float x = (float(ip.x) + 0.5) / stateRes.x - 0.5;
        float amp = (0.8 + 0.6 * clamp(powerP, 0.0, 1.0)) * (0.85 + 0.15 * cos(6.2831853 * x * 3.0))
                    * (0.96 + 0.08 * noise2(vec2(float(ip.x) * 0.15, 0.5)));   // smooth ripples seed the filaments
        return vec4(amp, 0.0, amp * amp, 1.0);
    }
    int row = int(mod(stateFrame, float(h)));
    if (ip.y != row) return stAt(ip);
    int r1 = (row + h - 1) % h, r2 = (row + h - 2) % h;
    // the beam drifts sideways a little (both earlier rows read at the same shifted place): the filaments wander
    float dr = 0.25 * sin(0.05 * sceneTime) + 0.15 * sin(0.013 * sceneTime + 1.0);
    float xs = float(ip.x) + 0.5 + dr;
    vec2 a = stLin(vec2(xs, float(r1) + 0.5)).rg, aOld = stLin(vec2(xs, float(r2) + 0.5)).rg;
    vec2 lap = stLin(vec2(xs + 1.0, float(r1) + 0.5)).rg + stLin(vec2(xs - 1.0, float(r1) + 0.5)).rg - 2.0 * a;
    float dz = 0.06;                                           // leapfrog: stable while dz (4 D + N) < 1
    float I = dot(a, a);
    float gain = 0.5 + 0.6 * clamp(audioSwell, 0.0, 1.0);
    float nl = gain * I / (1.0 + 0.25 * I);                     // saturable Kerr nonlinearity
    float diff = 0.5 * (0.6 + 0.8 * clamp(spreadP, 0.0, 1.0));
    // i A_z = -(D A_xx + N A): A_z = i (D A_xx + N A); leapfrog A_new = A_old + 2 dz A_z
    vec2 rhs = diff * lap + nl * a;
    vec2 az = vec2(-rhs.y, rhs.x);
    // a touch of real diffusion damps the grid's own noise: taken from the older row (leapfrog with a lagged
    // diffusion is stable while 8 nu dz < 1; on the current row it would not be)
    vec2 lapOld = stLin(vec2(xs + 1.0, float(r2) + 0.5)).rg + stLin(vec2(xs - 1.0, float(r2) + 0.5)).rg - 2.0 * aOld;
    vec2 an = aOld + 2.0 * dz * az + 2.0 * dz * 0.25 * lapOld;
    // a gentle pump holds the beam's mean power (the medium neither starves nor runs away), and onsets ripple it
    an *= 1.0 + 0.004 * (1.0 - dot(an, an));
    if (clamp(audioOnset, 0.0, 1.0) > 0.6) an *= 1.0 + 0.06 * (noise2(vec2(float(ip.x) * 0.2, stateFrame * 0.1)) - 0.5);
    float m = length(an);
    if (m > 4.0) an *= 4.0 / m;                                 // a guard, never reached in a healthy run
    return vec4(an, dot(an, an), 1.0);
}

void main()
{
    if (statePass == 1) { fragColor = stateStep(); return; }
    vec2 p = screenP();
    float rows = 0.5 * stateRes.y * 0.9;
    float age = abs(p.y) * 2.0 * rows;                          // the newest row on the centre line
    float gF = stateFrame - 1.0 + stateFrac - age;
    float g = floor(gF);
    int h = int(stateRes.y);
    float xs = (p.x / 1.7777778 + 0.5) * stateRes.x;
    vec2 c = vec2(xs, mod(g, float(h)) + 0.5);
    float I = texture(texState, c / stateRes).b;
    float lit = smoothstep(0.3, 2.2, I) + 0.15 * min(I, 1.0);  // the filaments against the dimmer beam
    vec2 uv = p * 0.7 + 0.5;
    vec3 photo = imgLod(uv, 0.6);
    vec3 tone = imgPalette(0.1 + 0.3 * lit + 0.03 * audioPhase);
    vec3 col = photo * 0.12 + mix(tone * 1.6, photo * 2.0, 0.35 + 0.5 * clamp(photoP, 0.0, 1.0)) * lit;
    col += mix(tone, vec3(1.0), 0.6) * smoothstep(0.85, 1.0, lit) * 0.3 * (0.4 + clamp(audioKick, 0.0, 1.0));
    col *= g < 1.0 ? 0.0 : 1.0;
    finish(col);
}
