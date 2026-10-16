/*****************************************************************************\
 *                              QrCode.h
\*****************************************************************************/
/*! @file
 *
 *  @brief
 *  A small QR code encoder (ISO/IEC 18004): byte mode, error correction level M, versions 1 to 10 -- enough for the
 *  web remote's address on screen (http://192.168.178.20:18091/ is version 3).
 *
 *  Written for this program rather than taken in: one function, no dependency, checked against an independent
 *  decoder (OpenCV's) and pinned by a self-test.
 *
 *  @author René Weller
 */
#ifndef QRCODE_H
#define QRCODE_H

#include <string>
#include <vector>

/** @class QrCode
 *
 * The module matrix of one QR code: size x size modules, true = dark.
 **/
class QrCode
{
public:
    /**  Encodes a text (as UTF-8 bytes) at error correction level M, in the smallest version from 1 to 10 that holds
     * it.
     *
     * @param text  The text. (in)
     *
     * @return
     *   The code; size() is 0 when the text is too long for version 10 (213 bytes).
     **/
    static QrCode encode( const std::string &text );

    /**  The side length in modules (21 for version 1, 4 more per version); 0 for an empty code.
     *
     * @return
     *   The size.
     **/
    int size() const { return m_size; }
    /**  Whether a module is dark.
     *
     * @param x  Column, 0..size()-1. (in)
     * @param y  Row, 0..size()-1. (in)
     *
     * @return
     *   True for a dark module (false outside the code).
     **/
    bool dark( int x, int y ) const
    {
        return x >= 0 && y >= 0 && x < m_size && y < m_size && m_modules[static_cast<size_t>( y * m_size + x )];
    }
    /**  The version the text needed, 1..10 (0 for an empty code).
     *
     * @return
     *   The version.
     **/
    int version() const { return m_version; }
    /**  The mask pattern chosen, 0..7.
     *
     * @return
     *   The mask.
     **/
    int mask() const { return m_mask; }

private:
    /**  Sets a module and marks it as part of a function pattern.
     *
     * @param x     Column. (in)
     * @param y     Row. (in)
     * @param dark  Dark or light. (in)
     **/
    void setFunction( int x, int y, bool dark );
    /**  Draws the finder, timing and alignment patterns, the dark module and reserves the format and version areas. */
    void drawFunctionPatterns();
    /**  Writes the 15 format bits (level M and the mask) in both places.
     *
     * @param mask  The mask, 0..7. (in)
     **/
    void drawFormatBits( int mask );
    /**  Writes the 18 version bits in both places (versions 7 and up). */
    void drawVersion();
    /**  Places the codewords in the zigzag order, skipping the function modules.
     *
     * @param data  The interleaved data and error correction codewords. (in)
     **/
    void drawCodewords( const std::vector<unsigned char> &data );
    /**  Inverts the data modules under a mask pattern (applying it twice undoes it).
     *
     * @param mask  The mask, 0..7. (in)
     **/
    void applyMask( int mask );
    /**  The penalty of the current matrix (the four rules of the standard): lower reads better.
     *
     * @return
     *   The penalty score.
     **/
    long penalty() const;

    int               m_size = 0;    ///< Side length in modules.
    int               m_version = 0; ///< Version 1..10.
    int               m_mask = 0;    ///< Mask pattern 0..7.
    std::vector<bool> m_modules;     ///< Row-major, true = dark.
    std::vector<bool> m_function;    ///< Row-major, true = a function pattern module (never masked).
public:
    /** An empty code (size 0), as encode() starts from and returns for a text too long. */
    QrCode() = default;
    /// @brief Member-wise copy; instances are copied by value (CGVR template: always declared).
    QrCode( const QrCode & ) = default;
    /**  Member-wise copy assignment.
     *
     * @return
     *   This code.
     **/
    QrCode &operator=( const QrCode & ) = default;
    /// @brief Member-wise move; declared because a declared copy would suppress it.
    QrCode( QrCode && ) = default;
    /**  Member-wise move assignment.
     *
     * @return
     *   This code.
     **/
    QrCode &operator=( QrCode && ) = default;
};

#endif // QRCODE_H
