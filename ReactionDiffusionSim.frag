// ReactionDiffusionSim.frag
// -----------------------------------------------------------------------
// One step of a Gray-Scott reaction-diffusion simulation, run on the GPU in
// a ping-pong pair of RGBA16F buffers (R = reagent A, G = reagent B).  Each
// frame this shader reads the previous state and writes the next — a genuine
// PDE integrator on the graphics card.  Audio onsets inject fresh reagent so
// the pattern blossoms on the beat.  Displayed by ReactionDiffusion.frag.
// -----------------------------------------------------------------------

uniform sampler2D texPrev;     // previous simulation state (R=A, G=B)
uniform vec2  resolution;      // grid size
uniform float seedMode;        // 1.0 -> write the initial seed pattern and return
uniform float feed;            // Gray-Scott feed rate  (audio-modulated, ~0.055)
uniform float kill;            // Gray-Scott kill rate  (~0.062)
uniform float inject;          // 1.0 on a beat/onset -> add reagent at fixed spots

float hash(vec2 p)
{
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

void main()
{
    vec2 uv = gl_FragCoord.xy / resolution;
    vec2 px = 1.0 / resolution;

    if (seedMode > 0.5) {
        // Seed: A = 1 everywhere, B = 1 in scattered noisy clusters.
        float n = hash(floor(gl_FragCoord.xy / 8.0));
        float b = (n > 0.85) ? 1.0 : 0.0;
        gl_FragColor = vec4(1.0, b, 0.0, 1.0);
        return;
    }

    vec2  s = texture2D(texPrev, uv).rg;
    float A = s.r;
    float B = s.g;

    // 9-point Laplacian (weights sum to zero).
    vec2 lap = vec2(0.0);
    lap += texture2D(texPrev, uv + vec2( px.x, 0.0)).rg * 0.20;
    lap += texture2D(texPrev, uv + vec2(-px.x, 0.0)).rg * 0.20;
    lap += texture2D(texPrev, uv + vec2(0.0,  px.y)).rg * 0.20;
    lap += texture2D(texPrev, uv + vec2(0.0, -px.y)).rg * 0.20;
    lap += texture2D(texPrev, uv + vec2( px.x,  px.y)).rg * 0.05;
    lap += texture2D(texPrev, uv + vec2(-px.x,  px.y)).rg * 0.05;
    lap += texture2D(texPrev, uv + vec2( px.x, -px.y)).rg * 0.05;
    lap += texture2D(texPrev, uv + vec2(-px.x, -px.y)).rg * 0.05;
    lap += s * (-1.0);

    const float dA = 1.0;
    const float dB = 0.5;
    float reaction = A * B * B;

    float nA = A + (dA * lap.x - reaction + feed * (1.0 - A));
    float nB = B + (dB * lap.y + reaction - (kill + feed) * B);

    // On a beat, scatter fresh reagent across the WHOLE field (hash-based) so the
    // entire pattern re-blooms with the music, rather than a few fixed dots
    // wobbling in one place.
    if (inject > 0.5) {
        float n = hash(floor(gl_FragCoord.xy / 5.0));
        if (n > 0.90) nB = 1.0;
    }

    gl_FragColor = vec4(clamp(nA, 0.0, 1.0), clamp(nB, 0.0, 1.0), 0.0, 1.0);
}
