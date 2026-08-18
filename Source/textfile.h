// textfile.h: interface for reading and writing text files
// www.lighthouse3d.com
//
// You may use these functions freely.
// they are provided as is, and no warranties, either implicit,
// or explicit are given
//////////////////////////////////////////////////////////////////////
/**
 * @file textfile.h
 * @brief Tiny C-style helpers to slurp a whole text file into a heap-allocated
 *        buffer / write a string out to a text file. Used across the engine to load
 *        GLSL shader source from disk.
 */

/**
 * @brief Reads an entire text file into a newly malloc'd, NUL-terminated buffer.
 * @param fn Path of the file to read.
 * @return Pointer to a malloc'd buffer with the file's contents (caller must free()
 *         it), or NULL if @p fn is NULL, the file could not be opened, or it was empty.
 */
char *textFileRead( const char *fn );
/**
 * @brief Writes a NUL-terminated string out to a text file, overwriting it.
 * @param fn Path of the file to write.
 * @param s String to write (written as-is, without an added terminator).
 * @return 1 on success (the full string was written), 0 on failure (including a NULL
 *         @p fn or a file that could not be opened).
 */
int textFileWrite( const char *fn, const char *s );

