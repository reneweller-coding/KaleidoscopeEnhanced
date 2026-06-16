// ReactionDiffusion.frag
// -----------------------------------------------------------------------
// Displays the living Gray-Scott reaction-diffusion field simulated on the
// GPU each frame (bound to the global "texSim" sampler by FilterShader).  The
// field is colourised by the musical mood and tinted by the source image; the
// kaleidoscope/combine passes then fold it into radiating organic structures.
// If the simulation is unavailable, texSim reads as 0 and the effect degrades
// to a dark mood-tinted field rather than failing.
// -----------------------------------------------------------------------

uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform sampler2D texSim;      // reaction-diffusion state (R=A, G=B)
uniform float interpolation;

uniform float audioValence;
uniform float audioCentroid;
uniform float audioBeat;
uniform float audioPhase;

void main()
{
    vec2 uv = gl_FragCoord.xy / resolution;

    // Gentle drift so the fixed-grid simulation feels alive on screen.
    vec2 suv = uv + 0.02 * vec2(sin(uv.y * 6.0 + audioPhase * 0.3),
                                cos(uv.x * 6.0 + audioPhase * 0.3));
    vec2 px = 1.0 / resolution;

    float b = texture2D(texSim, suv).g;

    // Edge enhancement from the B-concentration gradient.
    float bx = texture2D(texSim, suv + vec2(px.x, 0.0)).g
             - texture2D(texSim, suv - vec2(px.x, 0.0)).g;
    float by = texture2D(texSim, suv + vec2(0.0, px.y)).g
             - texture2D(texSim, suv - vec2(0.0, px.y)).g;
    float edge = clamp(length(vec2(bx, by)) * 6.0, 0.0, 1.0);

    // Two-tone palette driven by mood.
    vec3 cLow  = mix(vec3(0.02, 0.04, 0.12), vec3(0.10, 0.02, 0.14), audioCentroid);
    vec3 cHigh = mix(vec3(0.90, 0.45, 0.20), vec3(0.30, 0.90, 1.00), audioValence);

    vec3 col = mix(cLow, cHigh, smoothstep(0.15, 0.50, b));
    col += edge * (0.40 + 0.60 * audioBeat) * cHigh;

    // Subtle image tint inside the high-concentration regions.
    vec3 img = texture2D(tex0, uv).rgb;
    col = mix(col, col * (0.5 + img), 0.25 * b);

    gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
