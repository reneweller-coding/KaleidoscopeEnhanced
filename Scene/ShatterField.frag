#version 330 core
out vec4 fragColor;
// ShatterField.frag — the picture blown into 1300 rigid shards that spring
// back together.  Blend/CfxShardStep.comp holds each shard's pose and splats
// its own patch of the photo wherever it currently is; this pass only grades
// the result and lights the cracks.

uniform sampler2D tex0;
uniform sampler2D texShards;     // <- requests the shatter sim
uniform vec2  resolution;
uniform float time;
uniform float interpolation;

uniform float audioLevel;
uniform float audioBeat;
uniform float audioKick;
uniform float audioDrop;
uniform float audioHigh;
uniform float audioChromaHue;

uniform float glowP;
uniform float voidP;             // how dark the gaps between shards go

void main()
{
    vec2 uv = gl_FragCoord.xy / resolution;
    vec2 px = 1.0 / resolution;

    vec4 s = texture(texShards, uv);
    vec3 col = s.rgb;
    float cover = clamp(s.a, 0.0, 1.0);

    // The gaps: where no shard is, the frame falls away into near-black with
    // just a memory of the photo, which is what sells the pieces as SOLID.
    vec3 bg = texture(tex0, uv).rgb;
    bg *= bg * (0.10 - 0.07 * voidP);
    col = mix(bg, col, smoothstep(0.05, 0.35, cover));

    // Rim light on the shard edges: the gradient of the coverage mask marks
    // every break line, and a hard specular there reads as glass.
    float cx = texture(texShards, uv + vec2(px.x * 1.5, 0.0)).a
             - texture(texShards, uv - vec2(px.x * 1.5, 0.0)).a;
    float cy = texture(texShards, uv + vec2(0.0, px.y * 1.5)).a
             - texture(texShards, uv - vec2(0.0, px.y * 1.5)).a;
    float edge = clamp(length(vec2(cx, cy)) * 5.0, 0.0, 1.0);

    vec3 tint = 0.5 + 0.5 * cos(6.2831853 * (vec3(0.0, 0.33, 0.67))
                                + 0.5 * sin(audioChromaHue));
    col += tint * edge * (0.35 + 0.9 * glowP) * (0.6 + 1.6 * audioKick);
    col += vec3(0.9, 0.95, 1.0) * edge * audioHigh * 0.5;

    // A drop flashes the whole break pattern.
    col += tint * edge * audioDrop * 1.2;

    col *= 1.0 + 0.15 * audioBeat;
    col = col / (1.0 + col * 0.28);
    fragColor = vec4(col, interpolation);
}
