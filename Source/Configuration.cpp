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

Configuration::Configuration( const QString &configurationFile )
{
	m_filterShader = new FilterShader();
	readConfiguration( configurationFile );
	// Namespace for the per-preset taste learning (skip-malus / favourite).
	m_filterShader->setPresetName( m_configurationName );
	m_filterShader->init( m_imageDirectory, m_timeTextureSoloMin, m_timeTextureSoloMax, m_timeTextureInterpolationMin, m_timeTextureInterpolationMax );
}


Configuration::~Configuration( )
{
	delete m_filterShader;
}

void Configuration::start( int width, int height )
{
	m_filterShader->start( width, height );
}


void Configuration::stop()
{
	m_filterShader->stop();
}


void Configuration::addUniforms( EffectShader *shader, QDomElement &el )
{
	//get all data for the element, by looping through all child elements
	QDomNode pEntries = el.firstChild();
	while( !pEntries.isNull() )
	{
		QDomElement peData = pEntries.toElement();
		QString tagNam = peData.tagName();

		QString name = peData.attribute("name");

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
			shader->addExpression( name, peData.attribute("formula") );
		}

		pEntries = pEntries.nextSibling();
	}
}

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

	// REVIEW MODE for the Test* presets: scenes run ALPHABETICALLY, 8 s
	// each, and 'n' steps to the next in order — a systematic viewing
	// bench, not a show.  Only presets whose name starts with "Test".
	m_filterShader->setReviewMode( m_configurationName.startsWith( "Test" ) );

	// Image-cycling times: optional (music steering paces the show anyway);
	// absent/0 falls back to the long-standing baseline.
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

		QString shaderFile = el.attribute("file");

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
			EffectShader *shader = new EffectShader( shaderFile, minTimeSolo, maxTimeSolo, minTimeInterpolation, maxTimeInterpolation );

			addUniforms( shader, el );
			shader->setComplexity( complexity );
			shader->setProbability( probability );
			shader->setMoodFlags( moodFlags );
			m_filterShader->addTextureShader( shader );

		}
		else if( type == "KaleidoscopeBase" )
		{
			TextureEffectKaleidoscopeBase *shader = new TextureEffectKaleidoscopeBase( shaderFile, minTimeSolo, maxTimeSolo, minTimeInterpolation, maxTimeInterpolation );

			addUniforms( shader, el );
			shader->setComplexity( complexity );
			shader->setProbability( probability );
			shader->setMoodFlags( moodFlags );
			m_filterShader->addTextureShader( shader );
		}
		else if( type == "scene3d" )
		{
			// REAL 3D scene: Scene3D\<X>.frag + matching .vert, procedural
			// geometry chosen by geom="points|cubes|ribbon".
			Scene3DShader *shader = new Scene3DShader( shaderFile,
				el.attribute("geom"),
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

			addUniforms( shader, el );
			shader->setComplexity( complexity );
			shader->setProbability( probability );
			shader->setMoodFlags( moodFlags );
			m_filterShader->addTextureShader( shader );
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

		QString shaderFile = el.attribute("file");

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
			EffectShader *shader = new EffectShader( shaderFile, minTimeSolo, maxTimeSolo, minTimeInterpolation, maxTimeInterpolation );

			addUniforms( shader, el );
			shader->setComplexity( complexity );
			shader->setProbability( probability );
			shader->setMoodFlags( moodFlags );
			m_filterShader->addCombineShader( shader );
		}
     }

}