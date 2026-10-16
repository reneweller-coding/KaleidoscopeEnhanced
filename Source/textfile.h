//---------------------------------------------------------------------------
//                              textfile
//---------------------------------------------------------------------------
//  Copyright (C): www.lighthouse3d.com; changes 2026 reneweller, MIT License (see LICENSE)
//---------------------------------------------------------------------------
/*! @file
 *
 *  @brief
 *  Tiny helpers to read a whole text file into a std::string / write a string out to a text file. Used across the
 *  engine to load GLSL shader source from disk.
 *
 *  Interface for reading and writing text files
 *  www.lighthouse3d.com
 *
 *  You may use these functions freely.
 *  they are provided as is, and no warranties, either implicit,
 *  or explicit are given
 *
 *  @author www.lighthouse3d.com ("You may use these functions freely"); adapted by René Weller
 */

#ifndef TEXTFILE_H
#define TEXTFILE_H

#include <string>

/**  Reads an entire text file.
 *
 * @param fn  Path of the file to read (Windows separators; mapped on other platforms). (in)
 *
 * @return
 *   The file's contents; empty if @p fn is NULL, the file could not be opened, or it was empty.
 **/
std::string textFileRead( const char *fn );
/**  Writes a NUL-terminated string out to a text file, overwriting it.
 *
 * @param fn  Path of the file to write. (in)
 * @param s   String to write (written as-is, without an added terminator). (in)
 *
 * @return
 *   1 on success (the full string was written), 0 on failure (including a NULL @p fn or a file that could not be
 *   opened).
 **/
int textFileWrite( const char *fn, const char *s );

#endif // TEXTFILE_H
