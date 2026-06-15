#ifndef Utils_H
#define Utils_H

#include <QtGui/QImage>

class NanoTimer
{
public:

	NanoTimer();

	void start( void );
	double elapsed( void ) const;

	static bool usesHighFrequ( void );
	static double frequ( void );

private:

	unsigned long long int m_time_stamp;

	static bool		M_Use_High_Frequ;
	static double	M_GHz;
	static bool		M_FrequencyChecked;

	static long long unsigned int getTimeStamp( void );
	static void checkFrequency( void );
};

QImage prepareImage( const QImage &image);

#endif