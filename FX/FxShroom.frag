#version 330 core
out vec4 fragColor;   ///< The pixel's colour (output).
/**
 * @file FxShroom.frag
 * @brief FX SHROOM: psychedelic "trip" warp -- a Lissajous-style offset field
 * displaces the UVs frame to frame, smeared by a short motion-blur
 * accumulation for a breathing, hallucinatory wobble.
 */
uniform vec2 resolution;   ///< Size of the render target in pixels.
uniform float time;   ///< Seconds since the program started (never reset; see sceneTime).
uniform sampler2D tex0;   ///< The current photo.
uniform sampler2D tex1;   ///< The next photo (cross-faded in by interpolation).
uniform float interpolation;   ///< Cross-fade between the photos: 1 = tex0, 0 = tex1.
uniform float audioAdvance; ///< music advances the smear flow
uniform float audioSwell;   ///< Slow loudness envelope, 0..1 (seconds).
uniform float scale;
uniform float speed;
uniform int negativeU;
uniform int negativeV;
uniform float scaleFactor;
//const float scale = 0.02;


vec2 getOffset(float time, vec2 uv)
{
  //float a = 1.0 + 0.5 * sin(time + uv.x * 10.0);
  //float b = 1.0 + 0.5 * cos(time + uv.y * 10.0);
  float a;
  float b;

  if( negativeU > 0 )	
	a = 0.8 * sin(time + uv.x * 10.0);
  else
	a = 0.8 * sin(time - uv.x * 10.0);
	
  if( negativeV > 0 )	
	b = 0.8 * cos(time + uv.y * 10.0);
  else	
	b = 0.8 * cos(time - uv.y * 10.0);
	
  return scale * vec2(a + sin(b), b + cos(a));
}


/// @brief Entry point of this shader stage (the file description says what it draws).
void main(void)
{
  vec2 uv = -gl_FragCoord.xy / resolution.xy;

  float tw = time + 0.6*audioAdvance;
  float timeSpeed = speed * tw;
  float prevTime= speed * (tw-1.0);

  // current offset
  vec2 offset = getOffset(timeSpeed, uv);	
	
  // offset at prev frame
  vec2 prevOffset= getOffset(prevTime, uv);	

  // motion vector from previous to current frame
  vec2 delta= offset - prevOffset;


  uv += offset;
	
  vec4 color= vec4(0.0, 0.0, 0.0, 0.0);
	
  // some iterations of unweighted blur
  const int steps = 3; //rwrw 20
  float factor = scaleFactor * (1.0 + 0.6*audioSwell) / float(steps);
  
  for (int i=0; i<steps; i++)
  {
     color += interpolation * texture(tex0, uv) + (1.0-interpolation)*texture(tex1, uv);
	 uv += delta * factor;
  }
	
  //vec4 whoaColor = color;
  //float whoa = 0.1 + 0.01 * (1.0 + cos(10.0 * sin(time)));
  //(whoa * whoaColor) *

  fragColor =  color / float(steps);
}
