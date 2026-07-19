#include <float.h>

#include "shader_setup.h"
#include "Configuration.h"
#include "EffectShader.h"
#include "TextureEffectKaleidoscopeBase.h"
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

	m_timeTextureSoloMin = docElem.attribute( "timeTextureSoloMin" ).toUInt();
	m_timeTextureSoloMax = docElem.attribute( "timeTextureSoloMax" ).toUInt();
	m_timeTextureInterpolationMin = docElem.attribute( "timeTextureInterpolationMin" ).toUInt();
	m_timeTextureInterpolationMax = docElem.attribute( "timeTextureInterpolationMax" ).toUInt();


	// get the node's interested in, this time only caring about person's
	QDomNodeList nodeList = docElem.elementsByTagName("TextureShader");
 
	//Check the TextureShaders
	for(int i = 0; i < nodeList.count(); i++)
    {
		// get the current one as QDomElement
    	QDomElement el = nodeList.at(i).toElement();
 
		unsigned int minTimeSolo = el.attribute("minTimeSolo").toUInt();
		unsigned int maxTimeSolo = el.attribute("maxTimeSolo").toUInt();

		unsigned int minTimeInterpolation = el.attribute("minTimeInterpolation").toUInt();
		unsigned int maxTimeInterpolation = el.attribute("maxTimeInterpolation").toUInt();

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
     }

	
	// get the node's interested in, this time only caring about person's
	nodeList = docElem.elementsByTagName("CombineShader");
 
	//Check the TextureShaders
	for(int i = 0; i < nodeList.count(); i++)
    {
		// get the current one as QDomElement
    	QDomElement el = nodeList.at(i).toElement();
 
		unsigned int minTimeSolo = el.attribute("minTimeSolo").toUInt();
		unsigned int maxTimeSolo = el.attribute("maxTimeSolo").toUInt();

		unsigned int minTimeInterpolation = el.attribute("minTimeInterpolation").toUInt();
		unsigned int maxTimeInterpolation = el.attribute("maxTimeInterpolation").toUInt();

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