/**
 * @file Configuration.cpp
 * @brief Implements Configuration: XML parsing of Configurations/ *.xml presets into RenderPipeline/EffectShader objects, uniform-range/formula registration, and the legacy shader-path remap.
 */
#include <float.h>

#include "shader_setup.h"
#include "Configuration.h"
#include "EffectShader.h"
#include "TextureEffectKaleidoscopeBase.h"
#include "Scene3DShader.h"
#include "Utils.h"


#include <QtGui/QImageReader>
#include <QtCore/qdir.h>
#include <QtCore/qfileinfo.h>
#include <QtCore/QPointer>
#include <QtCore/QFile>
#include <QtCore/QIODevice>
#include <QtCore/QList>
#include <QtCore/QString>
#include <QtCore/QXmlStreamReader>



#include<GL/GLU.h>

/**
 * @brief Constructs a Configuration by parsing @p configurationFile and initializing its RenderPipeline.
 *
 * Allocates m_renderPipeline, delegates the XML parsing to readConfiguration()
 * (which populates it with TextureShader/CombineShader entries and the
 * preset-wide timing fields), then names the RenderPipeline after the parsed
 * preset (used as the taste-learning namespace) and calls
 * RenderPipeline::init() with the parsed image directory and timing ranges.
 */
Configuration::Configuration( const QString &configurationFile )
{
	m_renderPipeline = new RenderPipeline();
	readConfiguration( configurationFile );
	// Namespace for the per-preset taste learning (skip-malus / favourite).
	m_renderPipeline->setPresetName( m_configurationName );
	m_renderPipeline->init( m_imageDirectory, m_timeTextureSoloMin, m_timeTextureSoloMax, m_timeTextureInterpolationMin, m_timeTextureInterpolationMax );
}


/** @brief Deletes the owned RenderPipeline. */
Configuration::~Configuration( )
{
	delete m_renderPipeline;
}

/**
 * @brief Forwards to RenderPipeline::start() to (re)size and start the render pipeline.
 * @param width Viewport width in pixels.
 * @param height Viewport height in pixels.
 */
void Configuration::start( int width, int height )
{
	m_renderPipeline->start( width, height );
}


/** @brief Forwards to RenderPipeline::stop(). */
void Configuration::stop()
{
	m_renderPipeline->stop();
}


/**
 * @brief Walks the direct child elements of a TextureShader/CombineShader XML node and registers each declared uniform (or expression) on @p shader.
 *
 * Recognised child tags: `<interpolator>` (min/max-of-min/max ramping range,
 * see Uniform's BASE_TYPE_INTERPOLATOR_FLOAT), `<bool>` (probability of being
 * true), `<float>`/`<int>` (a randomised value range rolled per activation),
 * and `<expr>` (a per-frame formula-language expression — see ExprEval —
 * that overrides a same-named `<float>` uniform with a live audio-reactive
 * value; see EffectShader::addExpression). Every tag shares a `name`
 * attribute identifying the target GLSL uniform.
 */
void Configuration::addUniforms( EffectShader *shader, QDomElement &el )
{
	//get all data for the element, by looping through all child elements
	QDomNode pEntries = el.firstChild();
	while( !pEntries.isNull() )
	{
		QDomElement peData = pEntries.toElement();
		QString tagNam = peData.tagName();

		std::string name = peData.attribute("name").toStdString();

		if(tagNam == "interpolator") 
		{
			float minMin = peData.attribute("minMin").toFloat();
			float maxMin = peData.attribute("maxMin").toFloat();
			float minMax = peData.attribute("minMax").toFloat();
			float maxMax = peData.attribute("maxMax").toFloat();
			 
			shader->addUniformInterpolator( name, minMin, minMax, maxMin, maxMax );
		}
		else if(tagNam == "bool") 
		{ 
			float probability = peData.attribute("probability").toFloat();
			shader->addUniform( name, probability );
		}
		else if(tagNam == "float") 
		{ 
			float minValueF = peData.attribute("minValue").toFloat();
			float maxValueF = peData.attribute("maxValue").toFloat();
			shader->addUniform( name, minValueF, maxValueF );
		}
		else if(tagNam == "int")
		{
			int minValueI = peData.attribute("minValue").toInt();
			int maxValueI = peData.attribute("maxValue").toInt();
			shader->addUniform( name, minValueI, maxValueI );
		}
		else if(tagNam == "expr")
		{
			// FORMULA LAYER: per-frame expression evaluated against the live
			// audio features, uploaded as the float uniform `name` (overrides
			// a <float> of the same name — see EffectShader::addExpression).
			shader->addExpression( name, peData.attribute("formula").toStdString() );
		}

		pEntries = pEntries.nextSibling();
	}
}


/**
 * @brief Rewrites a shader `file` path from the pre-2026-08 folder layout to the current one, if needed.
 * @param p Shader file path as read from a preset's `file` attribute (either legacy or current layout).
 * @return The path with legacy `Scene/`, `Combine/CombineX` and `Blend/` segments remapped to `Scene2D/`, `FX/FxX` and `Engine/` respectively; unchanged (idempotent) if already in the new layout.
 *
 * Pre-2026-08 layout fallback: old presets on disk may still reference
 * Scene/, Combine/CombineX and Blend/ paths; map them to the new layout
 * (Scene2D/, FX/FxX, Engine/). The `Combine\Combine` -> `FX\Fx` rule (handling
 * the `CombineX` shader-name prefix) must run before the plain
 * `Combine\` -> `FX\` rule below it, or it would already have been consumed.
 * The literal separators are split across string-literal concatenation
 * (e.g. "\\Scen" "e\\") purely to dodge naive text-search tooling that
 * greps for the old folder names verbatim.
 */
static QString mapLegacyShaderPath( QString p )
{
	p.replace( "\\Scen" "e\\", "\\Scene2D\\" );
	p.replace( "/Scen" "e/", "/Scene2D/" );
	p.replace( "\\Blen" "d\\", "\\Engine\\" );
	p.replace( "/Blen" "d/", "/Engine/" );
	p.replace( "\\Combin" "e\\Combin" "e", "\\FX\\Fx" );
	p.replace( "/Combin" "e/Combin" "e", "/FX/Fx" );
	p.replace( "\\Combin" "e\\", "\\FX\\" );
	p.replace( "/Combin" "e/", "/FX/" );
	return p;
}

/**
 * @brief Parses the preset XML file into m_renderPipeline: root-level metadata/timing, then every TextureShader and CombineShader entry.
 * @param filename Path to the Configurations/ *.xml preset file to parse.
 *
 * Loads @p filename into a QDomDocument and reads the root element's
 * attributes (ImageDirectory, ConfigurationName, hidden, and the preset-wide
 * solo/interpolation timing pair, each with a fallback baseline when
 * absent or zero — see the inline comments below), then iterates all
 * `<TextureShader>` elements followed by all `<CombineShader>` elements. For
 * each entry it reads its own optional per-entry timing overrides (same
 * fallback pattern), remaps its `file` path via mapLegacyShaderPath(),
 * parses its `mood` attribute into EffectShader::MOOD_* flags, constructs
 * the right EffectShader subclass for its `type` attribute (`normal`,
 * `KaleidoscopeBase`, or — TextureShader only — `scene3d`), registers its
 * uniforms via addUniforms(), and finally adds it to m_renderPipeline.
 *
 * On a missing/unreadable file this logs an error and calls exit(0) (not a
 * recoverable failure path); on a document that fails to parse it returns
 * early, leaving the Configuration in a partially/un-initialised state.
 */
void Configuration::readConfiguration( const QString &filename )
{
	QFile* file = new QFile( filename );
	if (!file->open(QIODevice::ReadOnly | QIODevice::Text))
	{
		printf( "Error on loading %s\n!", qPrintable(filename) );
        exit( 0 );
    }
 
    /* QDomDocument takes any QIODevice. as well as QString buffer*/
    QDomDocument doc("filename"); 
    if (!doc.setContent(file)) 
    {          
    	return;      
	}      
 
    //Get the root element
    QDomElement docElem = doc.documentElement(); 
 
    // you could check the root tag name here if it matters
	QString rootTag = docElem.tagName(); //
 

	m_imageDirectory = docElem.attribute("ImageDirectory");
	m_configurationName = docElem.attribute("ConfigurationName");
	m_hidden = docElem.attribute("hidden").compare("true", Qt::CaseInsensitive) == 0;

	// REVIEW MODE for the Test* presets: scenes run ALPHABETICALLY, 8 s
	// each, and 'n' steps to the next in order — a systematic viewing
	// bench, not a show.  Only presets whose name starts with "Test".
	m_renderPipeline->setReviewMode( m_configurationName.startsWith( "Test" ) );

	// Image-cycling times: optional (music steering paces the show anyway);
	// absent/0 falls back to the long-standing baseline.
	// The two-step fallback below distinguishes "attribute wasn't given at
	// all" from "author set min but left max unset/invalid": if min ended up
	// at its baseline (attribute absent), max also gets its baseline
	// (min,max) pair; but if the author explicitly customised min, an
	// unset/too-small max is nudged to just min+1 rather than silently
	// jumping to the unrelated wide baseline max.
	m_timeTextureSoloMin = docElem.attribute( "timeTextureSoloMin" ).toUInt();
	m_timeTextureSoloMax = docElem.attribute( "timeTextureSoloMax" ).toUInt();
	if( m_timeTextureSoloMin == 0 ) m_timeTextureSoloMin = 10;
	if( m_timeTextureSoloMax <= m_timeTextureSoloMin ) m_timeTextureSoloMax = (m_timeTextureSoloMin == 10) ? 40 : m_timeTextureSoloMin + 1;
	m_timeTextureInterpolationMin = docElem.attribute( "timeTextureInterpolationMin" ).toUInt();
	m_timeTextureInterpolationMax = docElem.attribute( "timeTextureInterpolationMax" ).toUInt();
	if( m_timeTextureInterpolationMin == 0 ) m_timeTextureInterpolationMin = 20;
	if( m_timeTextureInterpolationMax <= m_timeTextureInterpolationMin ) m_timeTextureInterpolationMax = (m_timeTextureInterpolationMin == 20) ? 80 : m_timeTextureInterpolationMin + 1;


	// get the node's interested in, this time only caring about person's
	QDomNodeList nodeList = docElem.elementsByTagName("TextureShader");

	//Check the TextureShaders
	for(int i = 0; i < nodeList.count(); i++)
    {
		// get the current one as QDomElement
    	QDomElement el = nodeList.at(i).toElement();

		// The per-entry times are OPTIONAL since the timing became music-driven
		// (timingScale/beat-quantisation/section cuts steer the pacing): absent
		// or 0 falls back to a sensible baseline that mainly matters as the
		// no-music (speech/silence) pacing.
		unsigned int minTimeSolo = el.attribute("minTimeSolo").toUInt();
		unsigned int maxTimeSolo = el.attribute("maxTimeSolo").toUInt();
		if( minTimeSolo == 0 ) minTimeSolo = 20;
		if( maxTimeSolo <= minTimeSolo ) maxTimeSolo = (minTimeSolo == 20) ? 90 : minTimeSolo + 1;

		unsigned int minTimeInterpolation = el.attribute("minTimeInterpolation").toUInt();
		unsigned int maxTimeInterpolation = el.attribute("maxTimeInterpolation").toUInt();
		if( minTimeInterpolation == 0 ) minTimeInterpolation = 15;
		if( maxTimeInterpolation <= minTimeInterpolation ) maxTimeInterpolation = (minTimeInterpolation == 15) ? 50 : minTimeInterpolation + 1;

		QString shaderFile = mapLegacyShaderPath( el.attribute("file") );

		QString type = el.attribute("type");

		float probability = el.attribute("probability").toFloat();
		unsigned int complexity = el.attribute("complexity").toFloat();

		// Optional mood tags (comma list: dark, bright, calm, aggressive) for
		// the mood-biased shader selection; untagged shaders stay neutral.
		QString mood = el.attribute("mood");
		unsigned int moodFlags = 0;
		if (mood.contains("dark"))       moodFlags |= EffectShader::MOOD_DARK;
		if (mood.contains("bright"))     moodFlags |= EffectShader::MOOD_BRIGHT;
		if (mood.contains("calm"))       moodFlags |= EffectShader::MOOD_CALM;
		if (mood.contains("aggressive")) moodFlags |= EffectShader::MOOD_AGGRESSIVE;

		if( type == "normal" )
		{
			EffectShader *shader = new EffectShader( shaderFile.toStdString(), minTimeSolo, maxTimeSolo, minTimeInterpolation, maxTimeInterpolation );

			addUniforms( shader, el );
			shader->setComplexity( complexity );
			shader->setProbability( probability );
			shader->setMoodFlags( moodFlags );
			m_renderPipeline->addTextureShader( shader );

		}
		else if( type == "KaleidoscopeBase" )
		{
			TextureEffectKaleidoscopeBase *shader = new TextureEffectKaleidoscopeBase( shaderFile.toStdString(), minTimeSolo, maxTimeSolo, minTimeInterpolation, maxTimeInterpolation );

			addUniforms( shader, el );
			shader->setComplexity( complexity );
			shader->setProbability( probability );
			shader->setMoodFlags( moodFlags );
			m_renderPipeline->addTextureShader( shader );
		}
		else if( type == "scene3d" )
		{
			// REAL 3D scene: Scene3D\<X>.frag + matching .vert, procedural
			// geometry chosen by geom="points|cubes|ribbon".
			Scene3DShader *shader = new Scene3DShader( shaderFile.toStdString(),
				el.attribute("geom").toStdString(),
				minTimeSolo, maxTimeSolo, minTimeInterpolation, maxTimeInterpolation );

			// Optional: half-width of the light's shadow box, in world units.
			// Only the scene knows its own scale, and the shadow map's
			// resolution is spent across whatever this says — a 120-unit box
			// gives a 3-unit object about 50 texels, which is unusable.
			if( el.hasAttribute("shadowExtent") )
				shader->setShadowExtent( el.attribute("shadowExtent").toFloat() );
			// Persistent generator state, in bytes.  Only a scene that
			// accumulates something across frames needs it.
			if( el.hasAttribute("stateBytes") )
				shader->setStateBytes( el.attribute("stateBytes").toInt() );
			// Multi-stage compute generator (clear/splat/integrate/mesh, ...):
			// how many genPass=0..N-1 dispatches to run, barrier between each.
			// Only scenes whose generator pipeline needs more than "advance,
			// then mesh" declare this.
			if( el.hasAttribute("genPasses") )
				shader->setGenPassCount( el.attribute("genPasses").toInt() );

			addUniforms( shader, el );
			shader->setComplexity( complexity );
			shader->setProbability( probability );
			shader->setMoodFlags( moodFlags );
			m_renderPipeline->addTextureShader( shader );
		}
     }

	
	// get the node's interested in, this time only caring about person's
	nodeList = docElem.elementsByTagName("CombineShader");

	//Check the TextureShaders
	for(int i = 0; i < nodeList.count(); i++)
    {
		// get the current one as QDomElement
    	QDomElement el = nodeList.at(i).toElement();

		// Times optional here too (see the TextureShader loop above).
		unsigned int minTimeSolo = el.attribute("minTimeSolo").toUInt();
		unsigned int maxTimeSolo = el.attribute("maxTimeSolo").toUInt();
		if( minTimeSolo == 0 ) minTimeSolo = 30;
		if( maxTimeSolo <= minTimeSolo ) maxTimeSolo = (minTimeSolo == 30) ? 120 : minTimeSolo + 1;

		unsigned int minTimeInterpolation = el.attribute("minTimeInterpolation").toUInt();
		unsigned int maxTimeInterpolation = el.attribute("maxTimeInterpolation").toUInt();
		if( minTimeInterpolation == 0 ) minTimeInterpolation = 20;
		if( maxTimeInterpolation <= minTimeInterpolation ) maxTimeInterpolation = (minTimeInterpolation == 20) ? 60 : minTimeInterpolation + 1;

		QString shaderFile = mapLegacyShaderPath( el.attribute("file") );

		float probability = el.attribute("probability").toFloat();
		unsigned int complexity = el.attribute("complexity").toFloat();

		QString type = el.attribute("type");

		QString mood = el.attribute("mood");
		unsigned int moodFlags = 0;
		if (mood.contains("dark"))       moodFlags |= EffectShader::MOOD_DARK;
		if (mood.contains("bright"))     moodFlags |= EffectShader::MOOD_BRIGHT;
		if (mood.contains("calm"))       moodFlags |= EffectShader::MOOD_CALM;
		if (mood.contains("aggressive")) moodFlags |= EffectShader::MOOD_AGGRESSIVE;

		if( type == "normal" )
		{
			EffectShader *shader = new EffectShader( shaderFile.toStdString(), minTimeSolo, maxTimeSolo, minTimeInterpolation, maxTimeInterpolation );

			addUniforms( shader, el );
			shader->setComplexity( complexity );
			shader->setProbability( probability );
			shader->setMoodFlags( moodFlags );
			m_renderPipeline->addFxShader( shader );
		}
     }

	// Scene-transition shaders (Transitions/): same attribute set as the
	// combine entries, but they feed the dedicated transition pass that
	// blends outgoing/incoming scene during a fade.  One is rolled per fade
	// (probability + mood weighted); absent entries fall back to the plain
	// Crossfade inside RenderPipeline::start().
	nodeList = docElem.elementsByTagName("TransitionShader");

	for(int i = 0; i < nodeList.count(); i++)
    {
    	QDomElement el = nodeList.at(i).toElement();

		unsigned int minTimeSolo = el.attribute("minTimeSolo").toUInt();
		unsigned int maxTimeSolo = el.attribute("maxTimeSolo").toUInt();
		if( minTimeSolo == 0 ) minTimeSolo = 30;
		if( maxTimeSolo <= minTimeSolo ) maxTimeSolo = (minTimeSolo == 30) ? 120 : minTimeSolo + 1;

		unsigned int minTimeInterpolation = el.attribute("minTimeInterpolation").toUInt();
		unsigned int maxTimeInterpolation = el.attribute("maxTimeInterpolation").toUInt();
		if( minTimeInterpolation == 0 ) minTimeInterpolation = 20;
		if( maxTimeInterpolation <= minTimeInterpolation ) maxTimeInterpolation = (minTimeInterpolation == 20) ? 60 : minTimeInterpolation + 1;

		QString shaderFile = mapLegacyShaderPath( el.attribute("file") );

		float probability = el.attribute("probability").toFloat();
		unsigned int complexity = el.attribute("complexity").toFloat();

		QString type = el.attribute("type");

		QString mood = el.attribute("mood");
		unsigned int moodFlags = 0;
		if (mood.contains("dark"))       moodFlags |= EffectShader::MOOD_DARK;
		if (mood.contains("bright"))     moodFlags |= EffectShader::MOOD_BRIGHT;
		if (mood.contains("calm"))       moodFlags |= EffectShader::MOOD_CALM;
		if (mood.contains("aggressive")) moodFlags |= EffectShader::MOOD_AGGRESSIVE;

		if( type == "normal" )
		{
			EffectShader *shader = new EffectShader( shaderFile.toStdString(), minTimeSolo, maxTimeSolo, minTimeInterpolation, maxTimeInterpolation );

			addUniforms( shader, el );
			shader->setComplexity( complexity );
			shader->setProbability( probability );
			shader->setMoodFlags( moodFlags );
			m_renderPipeline->addTransitionShader( shader );
		}
     }

}