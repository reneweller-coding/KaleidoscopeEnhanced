// textfile.cpp
//
// simple reading and writing for text files
//
// www.lighthouse3d.com
//
// You may use these functions freely.
// they are provided as is, and no warranties, either implicit,
// or explicit are given
//////////////////////////////////////////////////////////////////////
/**
 * @file textfile.cpp
 * @brief Implements textFileRead()/textFileWrite() -- plain C file-slurp/write
 *        helpers (see textfile.h), historically used to load GLSL shader sources.
 */


#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "Platform.h"


/**
 * @brief Reads an entire text file into a newly malloc'd, NUL-terminated buffer.
 *
 * Opens @p fn in text mode ("rt"), seeks to the end to determine its size, rewinds,
 * reads the whole file in one fread(), and NUL-terminates the result.
 * @param fn Path of the file to read.
 * @return Pointer to a malloc'd buffer with the file's contents (caller must free()
 *         it), or NULL if @p fn is NULL, the file could not be opened, or its size
 *         was 0.
 */
char *textFileRead( const char *fn )
{
	FILE *fp;
	char *content = NULL;

	int count=0;

	if ( fn != NULL )
	{
		// Every shader in the catalogue arrives here with Windows separators,
		// from the C++ call sites ("..\\Engine\\CfxFlame.comp") and from the
		// preset XML alike. assetPath() is a pass-through on Windows and
		// rewrites the separators elsewhere -- one place, rather than
		// rewriting 831 generated catalogue entries that both platforms share.
#ifdef _WIN32
		fp = fopen(fn,"rt");
#else
		const std::string fnHost = Platform::assetPath( fn );
		fp = fopen(fnHost.c_str(),"rt");
#endif

		if (fp != NULL)
		{
			fseek(fp, 0, SEEK_END);
			count = ftell(fp);
			rewind(fp);

			if (count > 0)
			{
				content = (char *)malloc(sizeof(char) * (count+1));
				count = static_cast<int>(fread(content,sizeof(char),count,fp));
				content[count] = '\0';
			}
			fclose(fp);
		}
	}
	return content;
}


/**
 * @brief Writes a NUL-terminated string out to a text file, overwriting it.
 *
 * Opens @p fn in write mode ("w"), writes @p s with a single fwrite(), and reports
 * success only if the full string (by strlen()) was written.
 * @param fn Path of the file to write.
 * @param s String to write.
 * @return 1 on success, 0 on failure (including a NULL @p fn or a file that could
 *         not be opened).
 */
int textFileWrite( const char *fn, const char *s )
{
	FILE *fp;
	int status = 0;

	if ( fn != NULL )
	{
		fp = fopen(fn,"w");

		if (fp != NULL)
		{
			if ( fwrite(s,sizeof(char),strlen(s),fp) == strlen(s) )
				status = 1;
			fclose(fp);
		}
	}
	return(status);
}







