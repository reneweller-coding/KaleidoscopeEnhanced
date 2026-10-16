/*****************************************************************************\
 *                              QrCode.cpp
\*****************************************************************************/
/*! @file
 *
 *  @brief
 *  Implementation of QrCode: segment, error correction, matrix, mask -- the steps of ISO/IEC 18004 in order.
 *
 *  @author René Weller
 */
#include "QrCode.h"

#include <algorithm>
#include <climits>
#include <cstdlib>

namespace
{
/** Level M, versions 1..10: total codewords, error correction codewords per block, blocks. */
struct VersionM
{
    int total;  ///< All codewords of the version.
    int ecc;    ///< Error correction codewords in each block.
    int blocks; ///< Number of blocks.
};
/** The table, indexed by version (index 0 unused). */
const VersionM kVersions[11] = { { 0, 0, 0 },    { 26, 10, 1 },  { 44, 16, 1 },  { 70, 26, 1 },
                                 { 100, 18, 2 }, { 134, 24, 2 }, { 172, 16, 4 }, { 196, 18, 4 },
                                 { 242, 22, 4 }, { 292, 22, 5 }, { 346, 26, 5 } };
/** Alignment pattern centres per version (versions 2..10; version 1 has none). */
const int kAlign[11][3] = { { 0, 0, 0 },  { 0, 0, 0 },   { 6, 18, 0 },  { 6, 22, 0 },  { 6, 26, 0 }, { 6, 30, 0 },
                            { 6, 34, 0 }, { 6, 22, 38 }, { 6, 24, 42 }, { 6, 26, 46 }, { 6, 28, 50 } };

/**  Multiplication in GF(256) with the QR code's polynomial x^8 + x^4 + x^3 + x^2 + 1.
 *
 * @param x  A field element. (in)
 * @param y  Another. (in)
 *
 * @return
 *   Their product.
 **/
int gfMul( int x, int y )
{
    int z = 0;
    for ( int i = 7; i >= 0; --i )
    {
        z = ( z << 1 ) ^ ( ( z >> 7 ) * 0x11D );
        z ^= ( ( y >> i ) & 1 ) * x;
    }
    return z & 0xFF;
}

/**  The Reed-Solomon error correction codewords of one block.
 *
 * @param data    The block's data codewords. (in)
 * @param degree  How many error correction codewords. (in)
 *
 * @return
 *   The error correction codewords.
 **/
std::vector<unsigned char> reedSolomon( const std::vector<unsigned char> &data, int degree )
{
    // The generator polynomial (x - a^0)(x - a^1)...(x - a^(degree-1)), leading coefficient dropped.
    std::vector<int> gen( static_cast<size_t>( degree ), 0 );
    gen.back() = 1;
    int root = 1;
    for ( int i = 0; i < degree; ++i )
    {
        for ( int j = 0; j < degree; ++j )
        {
            gen[static_cast<size_t>( j )] = gfMul( gen[static_cast<size_t>( j )], root );
            if ( j + 1 < degree )
                gen[static_cast<size_t>( j )] ^= gen[static_cast<size_t>( j + 1 )];
        }
        root = gfMul( root, 0x02 );
    }
    // The remainder of data(x) * x^degree divided by the generator.
    std::vector<int> rem( static_cast<size_t>( degree ), 0 );
    for ( unsigned char b : data )
    {
        const int factor = b ^ rem.front();
        rem.erase( rem.begin() );
        rem.push_back( 0 );
        for ( int i = 0; i < degree; ++i )
            rem[static_cast<size_t>( i )] ^= gfMul( gen[static_cast<size_t>( i )], factor );
    }
    std::vector<unsigned char> out;
    for ( int r : rem )
        out.push_back( static_cast<unsigned char>( r ) );
    return out;
}
} // namespace

void QrCode::setFunction( int x, int y, bool dark )
{
    m_modules[static_cast<size_t>( y * m_size + x )] = dark;
    m_function[static_cast<size_t>( y * m_size + x )] = true;
}

void QrCode::drawFunctionPatterns()
{
    for ( int i = 0; i < m_size; ++i ) // timing patterns
    {
        setFunction( 6, i, i % 2 == 0 );
        setFunction( i, 6, i % 2 == 0 );
    }
    const int corners[3][2] = { { 3, 3 }, { m_size - 4, 3 }, { 3, m_size - 4 } }; // finders with their separators
    for ( const auto &c : corners )
        for ( int dy = -4; dy <= 4; ++dy )
            for ( int dx = -4; dx <= 4; ++dx )
            {
                const int x = c[0] + dx, y = c[1] + dy;
                const int dist = std::max( std::abs( dx ), std::abs( dy ) );
                if ( x >= 0 && y >= 0 && x < m_size && y < m_size )
                    setFunction( x, y, dist != 2 && dist != 4 );
            }
    const int *pos = kAlign[m_version];
    const int  n = pos[0] == 0 ? 0 : ( pos[2] ? 3 : 2 );
    for ( int i = 0; i < n; ++i ) // alignment patterns, not on the three finders
        for ( int j = 0; j < n; ++j )
        {
            if ( ( i == 0 && j == 0 ) || ( i == 0 && j == n - 1 ) || ( i == n - 1 && j == 0 ) )
                continue;
            for ( int dy = -2; dy <= 2; ++dy )
                for ( int dx = -2; dx <= 2; ++dx )
                    setFunction( pos[i] + dx, pos[j] + dy, std::max( std::abs( dx ), std::abs( dy ) ) != 1 );
        }
    drawFormatBits( 0 ); // reserves the area (rewritten once the mask is chosen)
    drawVersion();
}

void QrCode::drawFormatBits( int mask )
{
    const int data = ( 0 << 3 ) | mask; // level M is 00
    int       rem = data;
    for ( int i = 0; i < 10; ++i )
        rem = ( rem << 1 ) ^ ( ( rem >> 9 ) * 0x537 );
    const int bits = ( ( data << 10 ) | rem ) ^ 0x5412;
    auto      bit = [bits]( int i )
    { return ( ( bits >> i ) & 1 ) != 0; };
    for ( int i = 0; i <= 5; ++i ) // around the top-left finder
        setFunction( 8, i, bit( i ) );
    setFunction( 8, 7, bit( 6 ) );
    setFunction( 8, 8, bit( 7 ) );
    setFunction( 7, 8, bit( 8 ) );
    for ( int i = 9; i < 15; ++i )
        setFunction( 14 - i, 8, bit( i ) );
    for ( int i = 0; i < 8; ++i ) // the second copy, split between the other two finders
        setFunction( m_size - 1 - i, 8, bit( i ) );
    for ( int i = 8; i < 15; ++i )
        setFunction( 8, m_size - 15 + i, bit( i ) );
    setFunction( 8, m_size - 8, true ); // the dark module
}

void QrCode::drawVersion()
{
    if ( m_version < 7 )
        return;
    int rem = m_version;
    for ( int i = 0; i < 12; ++i )
        rem = ( rem << 1 ) ^ ( ( rem >> 11 ) * 0x1F25 );
    const long bits = ( static_cast<long>( m_version ) << 12 ) | rem;
    for ( int i = 0; i < 18; ++i )
    {
        const bool d = ( ( bits >> i ) & 1 ) != 0;
        const int  a = m_size - 11 + i % 3, b = i / 3;
        setFunction( a, b, d );
        setFunction( b, a, d );
    }
}

void QrCode::drawCodewords( const std::vector<unsigned char> &data )
{
    size_t i = 0;
    for ( int right = m_size - 1; right >= 1; right -= 2 ) // column pairs from the right, zigzag up and down
    {
        if ( right == 6 )
            right = 5; // the vertical timing pattern
        for ( int vert = 0; vert < m_size; ++vert )
            for ( int j = 0; j < 2; ++j )
            {
                const int  x = right - j;
                const bool upward = ( ( right + 1 ) & 2 ) == 0;
                const int  y = upward ? m_size - 1 - vert : vert;
                if ( !m_function[static_cast<size_t>( y * m_size + x )] && i < data.size() * 8 )
                {
                    m_modules[static_cast<size_t>( y * m_size + x )] = ( ( data[i >> 3] >> ( 7 - ( i & 7 ) ) ) & 1 )
                                                                       != 0;
                    ++i;
                }
            }
    }
}

void QrCode::applyMask( int mask )
{
    for ( int y = 0; y < m_size; ++y )
        for ( int x = 0; x < m_size; ++x )
        {
            bool inv = false;
            switch ( mask )
            {
                case 0: inv = ( x + y ) % 2 == 0; break;
                case 1: inv = y % 2 == 0; break;
                case 2: inv = x % 3 == 0; break;
                case 3: inv = ( x + y ) % 3 == 0; break;
                case 4: inv = ( x / 3 + y / 2 ) % 2 == 0; break;
                case 5: inv = x * y % 2 + x * y % 3 == 0; break;
                case 6: inv = ( x * y % 2 + x * y % 3 ) % 2 == 0; break;
                default: inv = ( ( x + y ) % 2 + x * y % 3 ) % 2 == 0; break;
            }
            const size_t k = static_cast<size_t>( y * m_size + x );
            if ( inv && !m_function[k] )
                m_modules[k] = !m_modules[k];
        }
}

long QrCode::penalty() const
{
    long score = 0;
    int  darkCount = 0;
    for ( int pass = 0; pass < 2; ++pass ) // rows, then columns
        for ( int a = 0; a < m_size; ++a )
        {
            int  run = 0;
            bool prev = false;
            int  window = 0; // the last 11 modules as bits, for the finder-like pattern
            for ( int b = 0; b < m_size; ++b )
            {
                const bool d = pass == 0 ? dark( b, a ) : dark( a, b );
                if ( pass == 0 && d )
                    ++darkCount;
                run = ( b > 0 && d == prev ) ? run + 1 : 1; // rule 1: runs of five and more
                if ( run == 5 )
                    score += 3;
                else if ( run > 5 )
                    score += 1;
                prev = d;
                window = ( ( window << 1 ) | ( d ? 1 : 0 ) ) & 0x7FF; // rule 3: 1:1:3:1:1 with four light beside
                if ( b >= 10 && ( window == 0x5D0 || window == 0x05D ) )
                    score += 40;
            }
        }
    for ( int y = 0; y + 1 < m_size; ++y ) // rule 2: 2x2 blocks of one colour
        for ( int x = 0; x + 1 < m_size; ++x )
        {
            const bool d = dark( x, y );
            if ( d == dark( x + 1, y ) && d == dark( x, y + 1 ) && d == dark( x + 1, y + 1 ) )
                score += 3;
        }
    const int total = m_size * m_size; // rule 4: the share of dark modules away from half
    const int k = ( std::abs( darkCount * 20 - total * 10 ) + total - 1 ) / total - 1;
    score += 10L * std::max( 0, k );
    return score;
}

QrCode QrCode::encode( const std::string &text )
{
    QrCode    q;
    const int len = static_cast<int>( text.size() );
    int       version = 1;
    for ( ; version <= 10; ++version )
    {
        const VersionM &v = kVersions[version];
        const int       cap_bits = ( v.total - v.ecc * v.blocks ) * 8;
        const int       need = 4 + ( version < 10 ? 8 : 16 ) + 8 * len;
        if ( need <= cap_bits )
            break;
    }
    if ( version > 10 )
        return q;
    const VersionM &v = kVersions[version];
    const int       data_cw = v.total - v.ecc * v.blocks;

    // The segment: byte mode, the length, the bytes; terminator, padding to a byte, pad codewords.
    std::vector<bool> bits;
    auto              put = [&bits]( unsigned value, int n )
    {
        for ( int i = n - 1; i >= 0; --i )
            bits.push_back( ( ( value >> i ) & 1 ) != 0 );
    };
    put( 0x4, 4 );
    put( static_cast<unsigned>( len ), version < 10 ? 8 : 16 );
    for ( unsigned char c : text )
        put( c, 8 );
    put( 0, std::min( 4, data_cw * 8 - static_cast<int>( bits.size() ) ) );
    while ( bits.size() % 8 )
        bits.push_back( false );
    std::vector<unsigned char> data;
    for ( size_t i = 0; i < bits.size(); i += 8 )
    {
        unsigned char c = 0;
        for ( int j = 0; j < 8; ++j )
            c = static_cast<unsigned char>( ( c << 1 ) | ( bits[i + static_cast<size_t>( j )] ? 1 : 0 ) );
        data.push_back( c );
    }
    for ( unsigned char pad = 0xEC; static_cast<int>( data.size() ) < data_cw; pad ^= 0xEC ^ 0x11 )
        data.push_back( pad );

    // Blocks: the short ones first, each with its error correction; then interleaved column by column.
    const int short_len = v.total / v.blocks; // codewords of a short block, data and error correction
    const int                               num_short = v.blocks - v.total % v.blocks;
    std::vector<std::vector<unsigned char>> blocks;
    for ( int i = 0, k = 0; i < v.blocks; ++i )
    {
        const int                  dlen = short_len - v.ecc + ( i < num_short ? 0 : 1 );
        std::vector<unsigned char> blk( data.begin() + k, data.begin() + k + dlen );
        k += dlen;
        const std::vector<unsigned char> ecc = reedSolomon( blk, v.ecc );
        if ( i < num_short )
            blk.push_back( 0 ); // a hole where the long blocks have their extra data codeword
        blk.insert( blk.end(), ecc.begin(), ecc.end() );
        blocks.push_back( blk );
    }
    std::vector<unsigned char> stream;
    for ( size_t i = 0; i < blocks[0].size(); ++i )
        for ( int j = 0; j < v.blocks; ++j )
            if ( i != static_cast<size_t>( short_len - v.ecc ) || j >= num_short )
                stream.push_back( blocks[static_cast<size_t>( j )][i] );

    q.m_version = version;
    q.m_size = 17 + 4 * version;
    q.m_modules.assign( static_cast<size_t>( q.m_size * q.m_size ), false );
    q.m_function.assign( static_cast<size_t>( q.m_size * q.m_size ), false );
    q.drawFunctionPatterns();
    q.drawCodewords( stream );
    // The mask that reads best.
    long best = LONG_MAX;
    for ( int m = 0; m < 8; ++m )
    {
        q.applyMask( m );
        q.drawFormatBits( m );
        const long p = q.penalty();
        if ( p < best )
        {
            best = p;
            q.m_mask = m;
        }
        q.applyMask( m ); // undo
    }
    q.applyMask( q.m_mask );
    q.drawFormatBits( q.m_mask );
    return q;
}
