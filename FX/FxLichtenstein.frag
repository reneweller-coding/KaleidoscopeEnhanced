#version 330 core
out vec4 fragColor;   ///< The pixel's colour (output).
/**
 * @file FxLichtenstein.frag
 * @brief FX LICHTENSTEIN: halftone-dot pop-art look -- the scene is quantized
 * into a grid of circular dots (Ben-Day dots), flat grey outside each
 * dot's radius.
 */
uniform vec2 resolution;   ///< Size of the render target in pixels.
uniform float time;   ///< Seconds since the program started (never reset; see sceneTime).
uniform sampler2D tex0;   ///< The current photo.
uniform sampler2D tex1;   ///< The next photo (cross-faded in by interpolation).
uniform float interpolation;   ///< Cross-fade between the photos: 1 = tex0, 0 = tex1.
uniform float size;   ///< Size of the simulation grid in cells.
uniform float audioBeat;    ///< dots pop on the beat
uniform float audioSwell;   ///< Slow loudness envelope, 0..1 (seconds).


// Size of the quad in pixels
//const float size = 12.0;

// Radius of the circle
//const float radius = size * 0.5 * 0.75;

/// @brief Entry point of this shader stage (the file description says what it draws).
void main(void)
{
	// normalize to the center
	//vec2 p;
    //p.x = gl_FragCoord.x;
    //p.y = gl_FragCoord.y;
	//p.x /= resolution.x;
	//p.y /= resolution.y;	

	float radius = size * 0.5 * (0.75 + 0.15*audioBeat);

	// Current quad in pixels
	vec2 quadPos = floor(gl_FragCoord.xy / size) * size;
	// Normalized quad position
	vec2 quad = quadPos/resolution.xy;
	// Center of the quad
	vec2 quadCenter = (quadPos + size/2.0);
	// Distance to quad center	
	float dist = length(quadCenter - gl_FragCoord.xy);
	
	vec4 texel =  interpolation * texture(tex0,quad) + (1.0-interpolation)*texture(tex1, quad);
	if (dist > radius)
	{
		fragColor = vec4(0.25 + 0.10*audioSwell);
	}
	else
	{
		fragColor = texel;
	}
}