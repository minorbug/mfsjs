# Technical Specification of the MacPaint (PNTG) File Format and Associated Monochrome Image Processing Algorithms for JavaScript Library Development

## I. Overview of the MacPaint (PNTG) File Format

### A. Historical Context and Significance

MacPaint, developed by Bill Atkinson, was a seminal raster graphics editor released by Apple Computer alongside the original Macintosh personal computer on January 24, 1984.1 It played a crucial role in demonstrating the capabilities of a graphical user interface, familiarizing users with mouse interaction, the concept of a clipboard for transferring data between applications, and the underlying QuickDraw graphics library.1 Pictures created in MacPaint could be seamlessly integrated into other applications, such as MacWrite, showcasing early software interoperability.1

The design choices inherent in the MacPaint file format were heavily influenced by the hardware limitations of the early Macintosh platform, which featured 128KB of RAM, relatively slow floppy disk drives, and a compact monochrome display.3 Consequently, the format prioritized simplicity and efficiency. This inherent simplicity—manifested in fixed image dimensions, a monochrome color palette, and a straightforward compression scheme—facilitated its adoption and made it a de facto standard for transferring graphic information between Macintosh applications in its era.3 The fixed image size of 576x720 pixels was a pragmatic compromise, offering a canvas larger than the 512x342 pixel screen while managing file size and memory demands.3 The enduring legacy of MacPaint means that a modern JavaScript library capable of reading and writing these files would be valuable for accessing and preserving historical graphical data.

### B. Core Characteristics

The MacPaint (PNTG) file format is defined by several key characteristics:

*   Fixed Image Dimensions: All MacPaint images are precisely 576 pixels wide by 720 pixels tall.1 The standard resolution is 72 dots per inch (dpi).1 This fixed-size constraint significantly simplifies the parsing process and memory allocation for image data, as the dimensions do not need to be dynamically read from the file header.
*   Monochrome Color Depth: The format is strictly 1-bit monochrome, meaning each pixel can only be black or white.3 A bit value of '1' represents a black pixel, while a bit value of '0' signifies a white pixel.3 This binary color representation is fundamental for data interpretation and for conversion to and from more complex color models like JavaScript's ImageData.
*   PackBits Compression: Image data within MacPaint files is compressed using the PackBits algorithm.3 PackBits is a form of Run-Length Encoding (RLE).7 Each uncompressed scanline, which is 72 bytes long (576 pixels / 8 bits per byte), is compressed individually.3
*   File Type Identification: MacPaint files are identified by the Macintosh file type code 'PNTG'.1 Common filename extensions associated with the format include .mac, .pntg, and .pic.5

The rigid 576x720 pixel, 1-bit structure presents both advantages and challenges when interfacing with the flexible JavaScript ImageData object. When reading a PNTG file, the known uncompressed size (576 pixels x 720 lines x 1 bit/pixel = 51,840 bytes, or 6,480 bytes) simplifies buffer allocation, and the target ImageData object will always have dimensions of 576x720. However, when writing to a PNTG file, an input ImageData object can have arbitrary dimensions and color depths. Therefore, the library must perform normalization: converting the input ImageData to 1-bit monochrome (using appropriate dithering or thresholding algorithms) and resizing or cropping the input to the mandatory 576x720 dimensions. If the input image is smaller, it should be padded with white space (bit value 0); if larger, it should be clipped (e.g., taking the top-left 576x720 region).3 The process of expanding 1-bit MacPaint pixels to the 4-byte RGBA format of ImageData (e.g., a black PNTG pixel (bit '1') becomes R=0, G=0, B=0, A=255, and a white PNTG pixel (bit '0') becomes R=255, G=255, B=255, A=255) must be clearly defined for the reading process.

## II. Detailed PNTG File Structure

### A. Optional MacBinary Header (128 Bytes)

MacPaint files may optionally begin with a 128-byte MacBinary header.5 This header was primarily used to encapsulate Macintosh files, with their dual-fork structure (data fork and resource fork), for transport to and storage on non-Macintosh systems that did not natively support this file system architecture.6 For MacPaint files, the resource fork is typically empty or non-existent, with all relevant data residing in the data fork.

The presence of a MacBinary header alters the starting offset of the subsequent MacPaint-specific data. If a MacBinary header is present, the 512-byte MacPaint application header begins at file offset 128, and thus the compressed pixel data starts at offset 640 (128 + 512 bytes).5 If the MacBinary header is absent, the MacPaint application header starts at offset 0, and the pixel data begins at offset 512.5

A JavaScript library designed to read PNTG files should be capable of detecting and skipping this MacBinary header. For writing PNTG files, including a MacBinary header is generally unnecessary for modern systems and applications, unless specific compatibility with legacy transfer protocols or systems is a requirement. The focus of the library should be on the PNTG data stream itself.

Detecting the MacBinary header can be achieved pragmatically. Given that MacPaint files have a close association with the MacBinary wrapper 9, a few key checks can suffice:

1.  The file size should be at least 128 bytes.
2.  The byte at offset 0 (Old\_Version\_Byte) should be 0x00.9
3.  The byte at offset 1 (Filename\_Length) should be within the range of 1 to 63, inclusive.6
4.  Critically for MacPaint, the File Type field (4 bytes at offset 65) should contain the ASCII characters 'PNTG'.6
5.  The File Creator field (4 bytes at offset 69) is typically 'MPNT' for MacPaint files.6

If these conditions, particularly the 'PNTG' signature at offset 65, are met, it is reasonable to assume the presence of a MacBinary header.

Table 1: MacBinary Header Key Fields for PNTG Identification

|     |     |     |     |     |
| --- | --- | --- | --- | --- |
| Offset (from file start) | Size (bytes) | Field Name | Expected Value/Range for PNTG | Source Snippet(s) |
| 0   | 1   | Old\_Version\_Byte | 0x00 | 9   |
| 1   | 1   | Filename\_Length | 1-63 | 6   |
| 65  | 4   | File\_Type | 'PNTG' (ASCII) | 6   |
| 69  | 4   | File\_Creator | 'MPNT' (ASCII) | 6   |

This table provides a concise reference for implementing MacBinary detection logic, focusing on the most indicative fields for MacPaint files.

### B. Main PNTG Data Stream (512-Byte Application Header)

Following the optional 128-byte MacBinary header (or starting at the beginning of the file if no MacBinary header is present), is the 512-byte MacPaint application-specific header.3 This header has a fixed structure.

The structure of this 512-byte header is detailed as follows 6:

1.  PNTG Marker / Version (4 bytes): The first four bytes of this header are 0x00, 0x00, 0x00, 0x02. This sequence serves as a marker for the MacPaint data stream and can be interpreted as indicating a version (e.g., version 2). Early MacPaint documentation mentions a "version number" in the header; if this version is zero, default patterns are used, otherwise patterns from the header are used.3 Given the 0x00000002 marker, the version is non-zero, implying that the pattern data stored in the header should always be utilized. For reading, the library should expect this marker and proceed to load the subsequent patterns. For writing, this marker should be written, followed by the pattern data.
2.  Pattern Data Block (304 bytes): Immediately following the 4-byte marker is a 304-byte block dedicated to pattern definitions.6 This block contains data for 38 distinct patterns, with each pattern occupying 8 bytes. Each 8-byte pattern represents an 8x8 pixel monochrome bitmap. These patterns are the fill patterns accessible within the MacPaint application. Each of the 8 bytes corresponds to one row of 8 pixels in the pattern. Consistent with QuickDraw's bitmap representation, the most significant bit (MSB) of a pattern byte represents the leftmost pixel of that pattern row, with a set bit (1) being black and a clear bit (0) being white.6 While this pattern data is primarily used by paint applications for their tool palettes and is not strictly necessary for the mere reconstruction or display of the main image 6, a comprehensive reader/writer library should handle this data to ensure full fidelity. For writing, a default set of 38 patterns should be available, or the library should allow users to provide custom patterns.
3.  Padding (204 bytes): The final 204 bytes of the 512-byte application header consist of zero-byte padding.6 This padding ensures that the compressed image data begins at a consistent offset: 512 bytes from the start of this application header, which corresponds to file offset 512 if no MacBinary header is present, or file offset 640 (128 + 512) if a MacBinary header is present. When reading, this padding should be skipped. When writing, this area must be filled with 204 zero bytes.

Table 2: MacPaint 512-Byte Application Header Structure

|     |     |     |     |     |
| --- | --- | --- | --- | --- |
| Offset (from start of 512B header) | Size (bytes) | Description | Value/Content | Source Snippet(s) |
| 0   | 4   | PNTG Marker / Version | 0x00000002 | 6   |
| 4   | 304 | Pattern Data | 38 patterns, 8 bytes each (8x8 pixels each) | 6   |
| 308 | 204 | Padding | All zero bytes | 6   |

This table clearly delineates the structure of the MacPaint-specific header, providing essential information for parsing and serialization logic.

### C. Compressed Image Data

The actual image pixel data follows the 512-byte application header. As established, this data commences at file offset 512 (if no MacBinary header) or offset 640 (if a MacBinary header is present).5

The uncompressed image is invariably 576 pixels wide by 720 pixels tall.3 This resolution translates to 72 bytes per uncompressed scanline (576 pixels / 8 bits per byte = 72 bytes).3 The image comprises 720 such scanlines.3 Each of these 720 scanlines is individually compressed using the PackBits algorithm before being written to the file.

Pixel Bit Order: The pixel data within each byte is organized with the most significant bit (MSB) representing the leftmost pixel in a horizontal group of 8 pixels. This is consistent with the QuickDraw bitmap conventions of the original Macintosh and the big-endian numerical format of the system.6 A bit value of '1' denotes a black pixel, and a '0' denotes a white pixel.3 For example, the byte 0xC0 (binary 11000000) would represent two black pixels followed by six white pixels.

Byte Order: All numerical data in MacPaint files, where applicable (primarily in the optional MacBinary header), is stored in big-endian format.6 While PackBits itself operates on byte streams, making endianness less of a direct concern for the compression algorithm, this confirms the overall data environment of the original Macintosh and reinforces the MSB-first interpretation for pixel data within bytes.

The compression of each 72-byte raw scanline independently using PackBits is a key architectural feature.3 This approach simplified implementation on the memory-constrained original Macintosh, as the compressor or decompressor only needed to buffer data for a single scanline at a time. There is no explicit end-of-stream marker for the entire compressed image data block; the reading process knows to decompress data until 720 scanlines, each yielding 72 bytes of uncompressed data, have been processed. The PackBits algorithm itself does not inherently know the total uncompressed size of the data it is processing 7; this knowledge is imposed by the MacPaint format's fixed dimensions.

For reading, the decompression loop must iterate 720 times. In each iteration, it reads PackBits-encoded data from the file stream and decodes it until exactly 72 bytes of raw pixel data for that scanline are produced. Conversely, for writing, the compression loop also iterates 720 times. Each 72-byte raw scanline is compressed using PackBits, and the resulting variable-length compressed data is written to the file.

## III. PackBits Decompression and Compression Algorithm

### A. Algorithm Explanation

PackBits is a lossless compression algorithm based on Run-Length Encoding (RLE), designed by Apple and used in MacPaint, as well as other formats like TIFF and ILBM.7 It functions by identifying and compressing sequences (runs) of identical bytes and efficiently representing sequences of non-repeating (literal) bytes.3

### B. Control Byte Specification

A PackBits data stream is composed of packets, each beginning with a single control byte (or header byte), followed by data bytes. The control byte is interpreted as a signed 8-bit integer.7 Its value dictates how the subsequent data bytes are to be processed:

*   Literal Run (0 to 127): If the control byte n is in the range (hex 0x00 to 0x7F), it signifies a literal run. The decompressor should copy the next (n + 1) bytes directly from the input stream to the output.
*   Repeat Run (-1 to -127): If the control byte n is in the range \[-1, -127\] (hex 0xFF down to 0x81), it signifies a repeat run. The decompressor should read the single byte immediately following the control byte and write that byte (1 - n) times to the output. For example, if n = -2 (hex 0xFE), the next byte is repeated 1 - (-2) = 3 times.
*   No Operation (-128): If the control byte n is -128 (hex 0x80), it is a no-operation (NOP) instruction. This byte is skipped, and the decompressor proceeds to interpret the very next byte in the input stream as a new control byte.

It is crucial to adhere to this standard PackBits interpretation, particularly for the repeat run calculation (1 - n), as documented in.7 Some alternative descriptions of MacPaint's RLE 6 present a slightly different repeat count calculation, but the PackBits ROM routine used by MacPaint would follow the 7 specification.

Table 3: PackBits Control Byte Interpretation 7

|     |     |     |     |     |
| --- | --- | --- | --- | --- |
| Header Byte (Signed Value) | Header Byte (Hex Range) | Description | Action | Number of Data Bytes Following Header |
| 0 to 127 | 0x00 to 0x7F | Literal Run | Copy next (1 + header\_byte) bytes directly | 1 + header\_byte |
| \-1 to -127 | 0xFF to 0x81 | Repeat Run | Repeat the next byte (1 - header\_byte) times | 1   |
| \-128 | 0x80 | No Operation (NOP) | Skip this byte, treat next byte as new header byte | 0   |

This table is fundamental for correctly implementing the PackBits (de)compression logic.

### C. Per-Scanline Application

As previously noted, PackBits compression and decompression in the MacPaint format are applied independently to each of the 720 scanlines.3 Each uncompressed scanline consists of exactly 72 bytes. Therefore, the decompressor must read and decode PackBits data for each scanline until 72 bytes of uncompressed data are generated. Similarly, the compressor takes a 72-byte uncompressed scanline as input for each operation.

### D. Implementation Considerations

*   End of Data: The PackBits algorithm itself does not include an end-of-stream marker. The decompressor must rely on external knowledge of the expected uncompressed data size.7 For MacPaint, this is 72 bytes for each of the 720 scanlines.
*   Compression Strategy: When compressing, runs of two identical bytes that are adjacent to literal (non-run) data are often more efficiently encoded as part of a literal run rather than as a separate two-byte repeat packet.7 This is an optimization hint for the compressor to potentially achieve better compression ratios.
*   Buffer Management:

*   Decompression: An output buffer of at least 72 bytes is required for each scanline.
*   Compression: An input buffer of 72 bytes is processed. The output buffer for compressed data must accommodate potential worst-case scenarios where PackBits might slightly expand the data. For instance, a 72-byte scanline consisting entirely of unique bytes would be encoded as one control byte (0x47, decimal 71, signifying 72 bytes follow) plus 72 data bytes, totaling 73 bytes. A common rule of thumb for the maximum size of PackBits compressed data is input\_size + ceil(input\_size / 128). For a 72-byte input, this is 72 + ceil(72/128) = 72 + 1 = 73 bytes. A slightly more generous buffer (e.g., 100 bytes or input\_size + 16) provides a safe margin.

## IV. JavaScript ImageData Integration

The JavaScript library will use the ImageData object as the primary means of handling pixel data for both reading MacPaint files and preparing data for writing them.

### A. ImageData Object Overview

The ImageData object is a standard Web API for representing and manipulating pixel data in a canvas context. Its key properties are 12:

*   width: A read-only number indicating the width of the image in pixels.
*   height: A read-only number indicating the height of the image in pixels.
*   data: A Uint8ClampedArray containing the raw pixel data. This array is a one-dimensional representation of the image, storing height × width × 4 bytes. Each pixel is represented by four consecutive bytes in the order: Red (R), Green (G), Blue (B), and Alpha (A). Each color component is an integer value between 0 and 255, inclusive.12

ImageData objects can be created programmatically using CanvasRenderingContext2D.createImageData(width, height) or by capturing pixel data from an existing canvas using CanvasRenderingContext2D.getImageData(left, top, width, height).12 Pixel data can be painted onto a canvas using CanvasRenderingContext2D.putImageData(imageData, dx, dy).12 The library will primarily use createImageData when constructing an image from a PNTG file and will accept an ImageData object as input when writing a PNTG file.

### B. Mapping PNTG 1-bit Data to ImageData (Reading)

When reading a MacPaint file, the 1-bit monochrome pixel data must be translated into the RGBA format of an ImageData object. The output ImageData object will always have dimensions of 576x720. The process for each decompressed 72-byte scanline (representing 576 pixels) is as follows:

1.  Iterate through the 72 bytes of the uncompressed scanline.
2.  For each byte, iterate through its 8 bits, from the most significant bit (MSB) to the least significant bit (LSB). The MSB corresponds to the leftmost pixel in the 8-pixel group.
3.  For each bit:

*   If the bit is 1 (black in PNTG), the corresponding pixel in the ImageData object's data array is set to R=0, G=0, B=0, A=255 (opaque black).
*   If the bit is 0 (white in PNTG), the corresponding pixel is set to R=255, G=255, B=255, A=255 (opaque white).

4.  This process is repeated for all 720 scanlines.

### C. Converting ImageData to 1-bit PNTG Data (Writing)

Writing a PNTG file from an ImageData object involves several preprocessing steps before the data can be packed and compressed:

1.  Input: An ImageData object of any dimensions and color depth, and an option specifying the desired monochrome conversion algorithm.
2.  Preprocessing:

*   Resizing/Cropping: The input ImageData must be conformed to the PNTG standard of 576x720 pixels.

*   If the input ImageData is larger than 576x720, it should be cropped. A common strategy is to take the top-left 576x720 portion.
*   If the input ImageData is smaller, it should be padded to 576x720. The padding color should be white, which translates to bit '0' in the PNTG format.3

*   Monochrome Conversion: The RGBA pixels of the (now 576x720) ImageData are converted to 1-bit black/white values. This critical step utilizes one of the specified dithering or thresholding algorithms (detailed in Section V). The choice of algorithm should be configurable.

3.  Packing and Compression:

*   The resulting 576x720 1-bit monochrome image data is processed scanline by scanline.
*   For each of the 720 scanlines, the 576 1-bit pixels are packed into 72 bytes. The MSB of the first byte of a scanline corresponds to the leftmost pixel of that scanline.
*   Each 72-byte raw scanline is then compressed using the PackBits algorithm.
*   The compressed data for each scanline is written sequentially to the output file stream.

These preprocessing steps are mandatory due to the rigid structure of the PNTG format versus the flexibility of ImageData. The library must gracefully handle these conversions to produce valid MacPaint files. A default monochrome conversion algorithm (e.g., simple thresholding) should be applied if the user does not specify one.

## V. Monochrome Conversion and Dithering Algorithms for ImageData

Converting an arbitrary color ImageData object to the 1-bit monochrome format required by MacPaint is a critical step in the writing process. This involves an initial conversion to grayscale, followed by a quantization step to black or white, often using dithering to preserve detail and reduce banding.

### A. Grayscale Conversion (from RGBA ImageData)

Most dithering algorithms operate on grayscale intensity values.18 Therefore, the first step in monochrome conversion is to transform the RGBA pixels from the input ImageData (after resizing/cropping to 576x720) into a 2D array of single-channel grayscale values. A common and perceptually accurate method uses luma coefficients based on Rec. 709:

Y=0.2126×R+0.7152×G+0.0722×B

.20

The R, G, and B values are typically in the range , resulting in a grayscale value Y also in . An optimized integer arithmetic version is (R \* 6966 + G \* 23436 + B \* 2366) >> 15.21 This intermediate 576x720 grayscale image is then used as input for the chosen dithering or thresholding algorithm.

### B. Simple Thresholding Algorithm

Simple thresholding is the most basic method for converting a grayscale image to a binary (1-bit) image.18

Algorithm:

1.  Obtain the 576x720 grayscale representation GS(x,y) (values from 0 to 255) of the input ImageData.
2.  Select a threshold value, typically 128 for a 0-255 range. This threshold can be a configurable parameter.
3.  For each grayscale pixel GS(x,y):

*   If GS(x,y) < threshold\_value, the output PNTG pixel bit is 1 (Black).
*   Else (GS(x,y) >= threshold\_value), the output PNTG pixel bit is 0 (White).

While computationally inexpensive, simple thresholding can lead to significant loss of detail and harsh, posterized transitions, especially in images with smooth gradients.19

### C. Floyd-Steinberg Dithering

Floyd-Steinberg dithering is an error diffusion technique that generally produces superior visual results compared to simple thresholding by distributing the quantization error of each pixel to its unprocessed neighbors.19

Algorithm Steps:

1.  Create a mutable copy of the 576x720 grayscale image GS(x,y) (values 0-255). This array will be modified during the process.
2.  Iterate through the image pixels row by row (y from 0 to height-1), and within each row, column by column (x from 0 to width-1).
3.  For each pixel (x,y): a. Let current\_pixel\_gs = GS(x,y). b. Determine the output PNTG bit: output\_pntg\_bit = (current\_pixel\_gs < 128)? 1 (Black) : 0 (White). c. Calculate the effective grayscale value of the chosen PNTG bit: quantized\_gs\_equivalent = (output\_pntg\_bit == 1)? 0 : 255. d. Calculate the quantization error: quant\_error = current\_pixel\_gs - quantized\_gs\_equivalent. e. Distribute this quant\_error to neighboring pixels in the GS array, applying specific fractions. Crucially, error is only added to pixels that have not yet been processed. Boundary checks are essential to ensure error is not propagated outside image bounds.

Error Distribution Matrix: The quant\_error is distributed as follows 24:

*   To pixel (x+1, y) (right): add quant\_error \* 7/16
*   To pixel (x-1, y+1) (bottom-left): add quant\_error \* 3/16
*   To pixel (x, y+1) (bottom): add quant\_error \* 5/16
*   To pixel (x+1, y+1) (bottom-right): add quant\_error \* 1/16

The \* denotes the current pixel being processed.

Table 4: Floyd-Steinberg Error Diffusion Coefficients

|     |     |
| --- | --- |
| Neighbor Relative to Current Pixel (\*) | Coefficient |
| (x+1, y) | 7/16 |
| (x-1, y+1) | 3/16 |
| (x, y+1) | 5/16 |
| (x+1, y+1) | 1/16 |

The mutable nature of the grayscale image buffer is key here; the error diffused from one pixel affects the input values for subsequent pixels.

### D. Atkinson Dithering

Atkinson dithering, developed by Bill Atkinson for the original Macintosh, is a variation of Floyd-Steinberg.23 It is known for producing higher contrast, particularly in very light or dark areas, by diffusing only a portion (typically 3/4) of the quantization error and spreading it to a slightly different set of neighbors.

Algorithm Steps: Similar to Floyd-Steinberg:

1.  Create a mutable copy of the 576x720 grayscale image GS(x,y).
2.  Iterate y then x.
3.  For each pixel (x,y): a. current\_pixel\_gs = GS(x,y). b. output\_pntg\_bit = (current\_pixel\_gs < 128)? 1 (Black) : 0 (White). c. quantized\_gs\_equivalent = (output\_pntg\_bit == 1)? 0 : 255. d. quant\_error = current\_pixel\_gs - quantized\_gs\_equivalent. e. Distribute quant\_error to 6 neighboring pixels, each receiving 1/8 of the error.23 Perform boundary checks.

Error Distribution Matrix: The quant\_error is distributed as follows 23:

*   To pixel (x+1, y) (right): add quant\_error \* 1/8
*   To pixel (x+2, y) (right by two): add quant\_error \* 1/8
*   To pixel (x-1, y+1) (bottom-left): add quant\_error \* 1/8
*   To pixel (x, y+1) (bottom): add quant\_error \* 1/8
*   To pixel (x+1, y+1) (bottom-right): add quant\_error \* 1/8
*   To pixel (x, y+2) (bottom by two): add quant\_error \* 1/8

Table 5: Atkinson Dithering Error Diffusion Coefficients

|     |     |
| --- | --- |
| Neighbor Relative to Current Pixel (\*) | Coefficient |
| (x+1, y) | 1/8 |
| (x+2, y) | 1/8 |
| (x-1, y+1) | 1/8 |
| (x, y+1) | 1/8 |
| (x+1, y+1) | 1/8 |
| (x, y+2) | 1/8 |

The "lost" 1/4 of the error (since only 6 \* 1/8 = 3/4 is diffused) contributes to the characteristic appearance of Atkinson-dithered images.

### E. Bayer (Ordered) Dithering

Bayer dithering, also known as ordered dithering, uses a predefined threshold matrix (the Bayer matrix) that is tiled across the image to determine the output pixel value.19 Unlike error diffusion methods, Bayer dithering is stateless for each pixel; the decision for one pixel does not affect others.

Bayer Matrix Definition:

Bayer matrices are typically square, with side lengths n that are powers of two (e.g., 2x2, 4x4, 8x8). They contain integer values ranging from 0 to n^2 - 1.32 For dithering, these integer values are normalized by dividing by n^2, resulting in threshold values in the range Given ann x nmatrixM\_n, the2n x 2nmatrixM\_{2n}\` is formed as:

$M\_{2n} = \\begin{pmatrix} 4M\_n & 4M\_n + 2U\_n \\ 4M\_n + 3U\_n & 4M\_n + U\_n \\end{pmatrix}$

where $U\_n$ is an $n \\times n$ matrix of all ones.

The base 2x2 integer Bayer matrix is:

$M\_2 = \\begin{pmatrix} 0 & 2 \\ 3 & 1 \\end{pmatrix}$

Common Bayer Matrices (Integer Values, before normalization by $n^2$):

*   2x2 (M2): As above. (Normalized: divide by 4)
*   4x4 (M4): $\\begin{pmatrix} 0 & 8 & 2 & 10 \\ 12 & 4 & 14 & 6 \\ 3 & 11 & 1 & 9 \\ 15 & 7 & 13 & 5 \\end{pmatrix}$ (Normalized: divide by 16) 33
*   8x8 (M8): $\\begin{pmatrix} 0 & 32 & 8 & 40 & 2 & 34 & 10 & 42 \\ 48 & 16 & 56 & 24 & 50 & 18 & 58 & 26 \\ 12 & 44 & 4 & 36 & 14 & 46 & 6 & 38 \\ 60 & 28 & 52 & 20 & 62 & 30 & 54 & 22 \\ 3 & 35 & 11 & 43 & 1 & 33 & 9 & 41 \\ 51 & 19 & 59 & 27 & 49 & 17 & 57 & 25 \\ 15 & 47 & 7 & 39 & 13 & 45 & 5 & 37 \\ 63 & 31 & 55 & 23 & 61 & 29 & 53 & 21 \\end{pmatrix}$ (Normalized: divide by 64) 34

Algorithm Steps:

1.  Obtain the 576x720 grayscale representation GS(x,y) (values 0-255) of the input ImageData.
2.  Select or generate a Bayer matrix M of size n x n. Normalize it by dividing each element by n^2 to get M\_norm. The matrix size n (e.g., 2, 4, or 8) can be a parameter.
3.  For each pixel (x,y) in the grayscale image: a. Determine the corresponding threshold from the tiled Bayer matrix: threshold = M\_norm\[y \\pmod n\]\[x \\pmod n\]. b. Normalize the pixel's grayscale value to the range \`\`: grayscale\_normalized = GS(x,y) / 255.0. c. Compare: If grayscale\_normalized > threshold, the output PNTG bit is 0 (White). d. Else (grayscale\_normalized <= threshold), the output PNTG bit is 1 (Black).

Bayer dithering is computationally less intensive than error diffusion methods and produces characteristic crosshatch patterns.

Table 6: Common Bayer Matrices (Integer Values)

|     |     |     |
| --- | --- | --- |
| Matrix Size (n) | Integer Matrix $M\_n$ | Normalization Factor ($n^2$) |
| 2x2 | $\\begin{pmatrix} 0 & 2 \\ 3 & 1 \\end{pmatrix}$ | 4   |
| 4x4 | $\\begin{pmatrix} 0 & 8 & 2 & 10 \\ 12 & 4 & 14 & 6 \\ 3 & 11 & 1 & 9 \\ 15 & 7 & 13 & 5 \\end{pmatrix}$ | 16  |
| 8x8 | $\\begin{pmatrix} 0 & 32 & 8 & 40 & 2 & 34 & 10 & 42 \\ 48 & 16 & 56 & 24 & 50 & 18 & 58 & 26 \\ 12 & 44 & 4 & 36 & 14 & 46 & 6 & 38 \\ 60 & 28 & 52 & 20 & 62 & 30 & 54 & 22 \\ 3 & 35 & 11 & 43 & 1 & 33 & 9 & 41 \\ 51 & 19 & 59 & 27 & 49 & 17 & 57 & 25 \\ 15 & 47 & 7 & 39 & 13 & 45 & 5 & 37 \\ 63 & 31 & 55 & 23 & 61 & 29 & 53 & 21 \\end{pmatrix}$ | 64  |

This table provides the integer matrices; for use in the algorithm, each element should be divided by the respective normalization factor.

## VI. Recommendations for LLM Prompt Construction

To effectively guide an LLM in generating the desired JavaScript library for MacPaint PNTG file handling, the prompt should be structured, detailed, and unambiguous. The following recommendations address key aspects of prompt construction:

*   Modular Design: The prompt should encourage a modular structure for the JavaScript library. This involves requesting separate functions or classes for distinct responsibilities, such as:

*   A main parsing function: e.g., parseMacPaint(arrayBuffer): ImageData.
*   A main serialization function: e.g., createMacPaint(imageData, options): ArrayBuffer, where options can specify the dithering algorithm and any related parameters (like threshold value or Bayer matrix size).
*   Internal helper functions for PackBits: e.g., decompressPackBitsScanline(inputArrayView, outputArray) and compressPackBitsScanline(inputArray): Uint8Array.
*   Separate, clearly defined functions for each monochrome conversion algorithm: e.g., applyThresholding(grayscalePixels, width, height, threshold): oneBitPixelArray, applyFloydSteinberg(grayscalePixels, width, height): oneBitPixelArray, etc. This approach facilitates cleaner, more testable, and maintainable code generation.

*   File Format Parsing:

*   Clearly specify that the input for reading a PNTG file will be a JavaScript ArrayBuffer or Uint8Array.
*   Provide explicit instructions for detecting and skipping the optional 128-byte MacBinary header, referencing the checks outlined in Table 1 and Section II.A.
*   Detail the fixed 512-byte MacPaint application header structure, using the information from Table 2 (PNTG marker, pattern data block, padding). Emphasize that the 38 patterns (8 bytes each) should be read, though their direct use in image rendering might be optional for a basic viewer. For writing, these patterns should be written (either a default set or user-provided).

*   PackBits Logic:

*   Provide the PackBits control byte interpretation table (Table 3) and stress adherence to the standard 7 definition, especially the (1 - n) calculation for repeat runs.
*   Explain that decompression is performed on a per-scanline basis, with each operation targeting exactly 72 uncompressed output bytes.
*   Similarly, compression takes 72 uncompressed input bytes per scanline. Advise on a safe output buffer size for compressed scanline data (e.g., 73 bytes or slightly more).

*   ImageData Input/Output Contracts:

*   Reading PNTG: The output of the PNTG parsing function must be a JavaScript ImageData object with dimensions 576x720. Detail the pixel mapping: a PNTG bit '1' (black) maps to RGBA (0,0,0,255), and a PNTG bit '0' (white) maps to RGBA (255,255,255,255).
*   Writing PNTG: The input to the PNTG creation function is an ImageData object (which can be of any size and color depth) and an options object specifying the monochrome conversion algorithm (e.g., 'threshold', 'atkinson', 'bayer', 'floydSteinberg') and any relevant parameters (e.g., thresholdValue: 128, bayerMatrixSize: 4).

*   Mandatory preprocessing steps must be detailed:

1.  Resize/crop the input ImageData to 576x720 (clip if larger, taking the top-left portion; pad with white if smaller).
2.  Convert the 576x720 RGBA ImageData to an internal grayscale representation (e.g., using the Rec. 709 luma formula: $Y = 0.2126R + 0.7152G + 0.0722B$).
3.  Apply the chosen dithering/thresholding algorithm to the grayscale data to produce a 1-bit (black/white) representation.
4.  Pack these 1-bit pixels into 72-byte scanlines (MSB = leftmost pixel, PNTG '1' = black, '0' = white).
5.  Compress each 72-byte scanline using PackBits.
6.  Assemble the MacPaint file structure (512-byte header with patterns, then concatenated compressed scanlines).

*   Algorithm Implementation Details:

*   For each monochrome conversion and dithering algorithm (Threshold, Floyd-Steinberg, Atkinson, Bayer):

*   Provide clear, step-by-step procedural logic.
*   Include the specific error diffusion matrices/coefficients (Tables 4, 5) or Bayer matrix definitions/generation logic (Table 6 and recursive formula).
*   Emphasize robust boundary condition handling for error diffusion algorithms to prevent errors at image edges.
*   For Bayer dithering, specify options for matrix size (e.g., 2, 4, 8) and how these matrices should be generated or selected (e.g., hardcoded or generated recursively). Clarify the normalization of Bayer matrix values and grayscale pixel values before comparison.
*   For simple thresholding, allow the threshold value (e.g., 128) to be a configurable parameter.
*   For error diffusion algorithms, clearly state that they operate on a mutable 2D array of grayscale pixel values, which is modified in-place. For ordered dithering, the grayscale image can be treated as read-only.

*   Error Handling and Edge Cases:

*   Instruct the LLM to consider potential error conditions, such as:

*   Input file being too short to be a valid PNTG file.
*   Errors during PackBits decompression (e.g., corrupted data preventing the generation of exactly 72 bytes for a scanline).
*   Invalid input parameters to library functions (e.g., an unrecognized dithering algorithm name).

*   Suggest appropriate error reporting mechanisms (e.g., throwing exceptions).

## VII. Summary and Key Implementation Notes

The MacPaint (PNTG) file format, despite its age, possesses a well-defined and relatively simple structure, characterized by fixed image dimensions of 576x720 pixels, a 1-bit monochrome color depth (where bit '1' is black and '0' is white), and per-scanline PackBits compression. Each of the 720 scanlines, when uncompressed, yields 72 bytes of pixel data, with the most significant bit of each byte representing the leftmost pixel of an 8-pixel group.

A JavaScript library for reading and writing PNTG files must accurately implement the PackBits algorithm and handle the potential presence of an initial 128-byte MacBinary header. The core 512-byte MacPaint application header contains a version/marker, 38 8x8 pixel patterns (304 bytes total), and 204 bytes of padding. While the patterns may not be essential for basic image viewing, they are integral to the format's fidelity and should be handled by a comprehensive library, particularly for writing files.

Interfacing with JavaScript's ImageData object requires careful conversion. When reading, 1-bit PNTG pixels are expanded to RGBA values. When writing, a multi-stage process is necessary: the input ImageData must first be resized/cropped to 576x720, then converted to grayscale, then quantized to 1-bit monochrome using a selected algorithm (simple thresholding, Floyd-Steinberg, Atkinson, or Bayer dithering), and finally, these 1-bit scanlines are packed into bytes and compressed with PackBits.

The successful generation of a robust JavaScript library via an LLM hinges on providing a prompt that is meticulous in its specification of these file structures, algorithms, data transformations, and error handling considerations. A modular API design will further enhance the quality and usability of the generated code.

#### Works cited

1.  MacPaint - Wikipedia, accessed May 9, 2025, [https://en.wikipedia.org/wiki/MacPaint](https://www.google.com/url?q=https://en.wikipedia.org/wiki/MacPaint&sa=D&source=editors&ust=1746850777589294&usg=AOvVaw2F0Q2YEp9Un7GXaVwh4cCi)
2.  MacPaint (Version 1.5) : Bill Atkinson / Apple Computer - Internet Archive, accessed May 9, 2025, [https://archive.org/details/mac\_Paint\_2](https://www.google.com/url?q=https://archive.org/details/mac_Paint_2&sa=D&source=editors&ust=1746850777590150&usg=AOvVaw2oN3l6KDQ85NURgAyRi48O)
3.  MacPaint file format - MacTech | The journal of Apple technology., accessed May 9, 2025, [http://preserve.mactech.com/articles/mactech/Vol.01/01.07/MacPaintfiles/index.html](https://www.google.com/url?q=http://preserve.mactech.com/articles/mactech/Vol.01/01.07/MacPaintfiles/index.html&sa=D&source=editors&ust=1746850777591192&usg=AOvVaw1IZr-zZKijrjk51_C5bFWI)
4.  Display graphic FULL SCREEN on Mac SE? | Page 3 - TinkerDifferent, accessed May 9, 2025, [https://tinkerdifferent.com/threads/display-graphic-full-screen-on-mac-se.1607/page-3](https://www.google.com/url?q=https://tinkerdifferent.com/threads/display-graphic-full-screen-on-mac-se.1607/page-3&sa=D&source=editors&ust=1746850777592626&usg=AOvVaw0C625htD2F5qJJ8i9H1Ytm)
5.  MacPaint - Just Solve the File Format Problem, accessed May 9, 2025, [http://justsolve.archiveteam.org/wiki/MacPaint](https://www.google.com/url?q=http://justsolve.archiveteam.org/wiki/MacPaint&sa=D&source=editors&ust=1746850777593481&usg=AOvVaw3UZ2ZSXI1QeymSvmShYq8z)
6.  GFF Format Summary: Macintosh Paint, accessed May 9, 2025, [https://netghost.narod.ru/gff/graphics/summary/macpaint.htm](https://www.google.com/url?q=https://netghost.narod.ru/gff/graphics/summary/macpaint.htm&sa=D&source=editors&ust=1746850777594444&usg=AOvVaw2sd3vg3XGCuGeC98LQiQmz)
7.  PackBits - Wikipedia, accessed May 9, 2025, [https://en.wikipedia.org/wiki/PackBits](https://www.google.com/url?q=https://en.wikipedia.org/wiki/PackBits&sa=D&source=editors&ust=1746850777595217&usg=AOvVaw1dC_oH8t8zEL76O01pt7A3)
8.  Run-length encoding - Wikipedia, accessed May 9, 2025, [https://en.wikipedia.org/wiki/Run-length\_encoding](https://www.google.com/url?q=https://en.wikipedia.org/wiki/Run-length_encoding&sa=D&source=editors&ust=1746850777596035&usg=AOvVaw2pfE_lsdjulcgF2pkftYkI)
9.  Detecting MacBinary format - Entropymine - WordPress.com, accessed May 9, 2025, [https://entropymine.wordpress.com/2019/02/13/detecting-macbinary-format/](https://www.google.com/url?q=https://entropymine.wordpress.com/2019/02/13/detecting-macbinary-format/&sa=D&source=editors&ust=1746850777597039&usg=AOvVaw3f4nDwTnecgiilPylt7ft1)
10.  Convert JPG or PNG to MacPaint - 68kMLA, accessed May 9, 2025, [https://68kmla.org/bb/index.php?threads/convert-jpg-or-png-to-macpaint.18745/](https://www.google.com/url?q=https://68kmla.org/bb/index.php?threads/convert-jpg-or-png-to-macpaint.18745/&sa=D&source=editors&ust=1746850777597996&usg=AOvVaw0QsA1IHG5r08LohLLZJZHn)
11.  old MacPaint Images to a modern format - 68kMLA, accessed May 9, 2025, [https://68kmla.org/bb/index.php?threads/old-macpaint-images-to-a-modern-format.14350/](https://www.google.com/url?q=https://68kmla.org/bb/index.php?threads/old-macpaint-images-to-a-modern-format.14350/&sa=D&source=editors&ust=1746850777599067&usg=AOvVaw09UowClHx6ZaDDQ7Zupovz)
12.  Pixel manipulation with canvas - Web APIs | MDN, accessed May 9, 2025, [https://developer.mozilla.org/en-US/docs/Web/API/Canvas\_API/Tutorial/Pixel\_manipulation\_with\_canvas](https://www.google.com/url?q=https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API/Tutorial/Pixel_manipulation_with_canvas&sa=D&source=editors&ust=1746850777600272&usg=AOvVaw0pgSZ8eGWXyY2sqL54H_9G)
13.  Imaging API - Adobe Developer, accessed May 9, 2025, [https://developer.adobe.com/photoshop/uxp/2022/ps\_reference/media/imaging/](https://www.google.com/url?q=https://developer.adobe.com/photoshop/uxp/2022/ps_reference/media/imaging/&sa=D&source=editors&ust=1746850777601265&usg=AOvVaw0lS2ebPrr8ZA_h6CFF7P8-)
14.  ImageData() constructor - Web APIs - MDN Web Docs - Mozilla, accessed May 9, 2025, [https://developer.mozilla.org/en-US/docs/Web/API/ImageData/ImageData](https://www.google.com/url?q=https://developer.mozilla.org/en-US/docs/Web/API/ImageData/ImageData&sa=D&source=editors&ust=1746850777602293&usg=AOvVaw11Q8wHplEmY3qfdtwDqZfM)
15.  ImageData: data property - Web APIs - MDN Web Docs, accessed May 9, 2025, [https://developer.mozilla.org/en-US/docs/Web/API/ImageData/data](https://www.google.com/url?q=https://developer.mozilla.org/en-US/docs/Web/API/ImageData/data&sa=D&source=editors&ust=1746850777603188&usg=AOvVaw1mQS07gxKaSpLqjg45adHn)
16.  Manipulating Canvas Pixel Data with JavaScript - Ken Halbert, accessed May 9, 2025, [https://kenhalbert.com/posts/manipulate-canvas-data](https://www.google.com/url?q=https://kenhalbert.com/posts/manipulate-canvas-data&sa=D&source=editors&ust=1746850777604076&usg=AOvVaw0DwHo2y3vlfXwPuUQwoPln)
17.  CanvasRenderingContext2D: getImageData() method - Web APIs | MDN, accessed May 9, 2025, [https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/getImageData](https://www.google.com/url?q=https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/getImageData&sa=D&source=editors&ust=1746850777605206&usg=AOvVaw3bTtfgKGL5Tuuz6hpFX3Eg)
18.  Thresholding (image processing) - Wikipedia, accessed May 9, 2025, [https://en.wikipedia.org/wiki/Thresholding\_(image\_processing)](https://www.google.com/url?q=https://en.wikipedia.org/wiki/Thresholding_(image_processing)&sa=D&source=editors&ust=1746850777606157&usg=AOvVaw1hL_ZVGrE-o0AKYRf0Jqed)
19.  Dithering applications - Jimp JavaScript Image Processing: From ..., accessed May 9, 2025, [https://app.studyraid.com/en/read/12495/404079/dithering-applications](https://www.google.com/url?q=https://app.studyraid.com/en/read/12495/404079/dithering-applications&sa=D&source=editors&ust=1746850777607221&usg=AOvVaw3qKvUaCAe8H7OeS_aLv4TI)
20.  Writing My Own Dithering Algorithm in Racket - Amanvir Parhar, accessed May 9, 2025, [https://amanvir.com/blog/writing-my-own-dithering-algorithm-in-racket](https://www.google.com/url?q=https://amanvir.com/blog/writing-my-own-dithering-algorithm-in-racket&sa=D&source=editors&ust=1746850777608261&usg=AOvVaw3P4Ky99orzLtTD36_3IsxR)
21.  How to Convert an Image to Grayscale with JavaScript | Dynamsoft Developers Blog, accessed May 9, 2025, [https://www.dynamsoft.com/codepool/convert-image-to-grayscale-with-javascript.html](https://www.google.com/url?q=https://www.dynamsoft.com/codepool/convert-image-to-grayscale-with-javascript.html&sa=D&source=editors&ust=1746850777609402&usg=AOvVaw1b326rcb43cST77WU1Jyuy)
22.  Image Thresholding Techniques in Computer Vision | GeeksforGeeks, accessed May 9, 2025, [https://www.geeksforgeeks.org/image-thresholding-techniques-in-computer-vision/](https://www.google.com/url?q=https://www.geeksforgeeks.org/image-thresholding-techniques-in-computer-vision/&sa=D&source=editors&ust=1746850777610448&usg=AOvVaw0Z5IPTUlEtZLf8NgSdS-KB)
23.  Atkinson dithering - Wikipedia, accessed May 9, 2025, [https://en.wikipedia.org/wiki/Atkinson\_dithering](https://www.google.com/url?q=https://en.wikipedia.org/wiki/Atkinson_dithering&sa=D&source=editors&ust=1746850777611229&usg=AOvVaw13-Ql0lp-tVxinFoDR-bpp)
24.  Floyd–Steinberg dithering - Robert Bruce, accessed May 9, 2025, [https://www.robertjamesbruce.com/lectures/cs116b/cs116b\_lecture\_week\_14-floyd%E2%80%93steinberg\_dithering.pdf](https://www.google.com/url?q=https://www.robertjamesbruce.com/lectures/cs116b/cs116b_lecture_week_14-floyd%25E2%2580%2593steinberg_dithering.pdf&sa=D&source=editors&ust=1746850777612503&usg=AOvVaw0d9sghbsR8zwHc3LYrplku)
25.  Floyd-Steinberg Dithering - Cloudinary, accessed May 9, 2025, [https://cloudinary.com/glossary/floyd-steinberg-dithering](https://www.google.com/url?q=https://cloudinary.com/glossary/floyd-steinberg-dithering&sa=D&source=editors&ust=1746850777613445&usg=AOvVaw2Mt4DVlQB3e0zSROfveWN2)
26.  Atkinson Dithering - Beyond Loom, accessed May 9, 2025, [https://beyondloom.com/blog/dither.html](https://www.google.com/url?q=https://beyondloom.com/blog/dither.html&sa=D&source=editors&ust=1746850777614070&usg=AOvVaw1antNzFGsDh8VcBrppDaAF)
27.  A Modified Error Diffusion Scheme Based on the Human Visual Model, accessed May 9, 2025, [https://www.imaging.org/common/uploaded%20files/pdfs/Papers/1999/RP-0-93/1750.pdf](https://www.google.com/url?q=https://www.imaging.org/common/uploaded%2520files/pdfs/Papers/1999/RP-0-93/1750.pdf&sa=D&source=editors&ust=1746850777614797&usg=AOvVaw3-uoKfUrkoplJD2DIFzvwc)
28.  Optimized Error Diffusion for Image Display - Purdue Engineering, accessed May 9, 2025, [https://engineering.purdue.edu/~bouman/publications/pdf/jei1.pdf](https://www.google.com/url?q=https://engineering.purdue.edu/~bouman/publications/pdf/jei1.pdf&sa=D&source=editors&ust=1746850777615669&usg=AOvVaw0Qg8unLpKDO9U1hPp8-SHV)
29.  en.wikipedia.org, accessed May 9, 2025, [https://en.wikipedia.org/wiki/Atkinson\_dithering#:~:text=The%20algorithm%20scans%20the%20image,that%20already%20have%20been%20quantized.](https://www.google.com/url?q=https://en.wikipedia.org/wiki/Atkinson_dithering%23:~:text%3DThe%2520algorithm%2520scans%2520the%2520image,that%2520already%2520have%2520been%2520quantized.&sa=D&source=editors&ust=1746850777616509&usg=AOvVaw0AiDfQ__TicAT_bFnqN-DK)
30.  14.11. Bayer Matrix - GIMP Documentation, accessed May 9, 2025, [https://docs.gimp.org/en/gimp-filter-bayer-matrix.html](https://www.google.com/url?q=https://docs.gimp.org/en/gimp-filter-bayer-matrix.html&sa=D&source=editors&ust=1746850777617260&usg=AOvVaw0kS9BH4prOo2gy_xA1h9Yt)
31.  14.11. Bayer Matrix, accessed May 9, 2025, [https://docs.gimp.org/2.10/sv/gimp-filter-bayer-matrix.html](https://www.google.com/url?q=https://docs.gimp.org/2.10/sv/gimp-filter-bayer-matrix.html&sa=D&source=editors&ust=1746850777617811&usg=AOvVaw0da_t-wHcY4nK0zYFv0PIs)
32.  Ordered Dithering | Of Shaders & Triangles, accessed May 9, 2025, [https://blog.42yeah.is/rendering/2023/02/18/dithering.html](https://www.google.com/url?q=https://blog.42yeah.is/rendering/2023/02/18/dithering.html&sa=D&source=editors&ust=1746850777618464&usg=AOvVaw2jNrd_5f3mcXByLcYab068)
33.  Dithering & Shaders - Ray Ferric, accessed May 9, 2025, [https://rayferric.xyz/posts/dithering-&-shaders](https://www.google.com/url?q=https://rayferric.xyz/posts/dithering-%26-shaders&sa=D&source=editors&ust=1746850777619055&usg=AOvVaw3butqSMAcUowX7b7JiMeFF)
34.  Ordered dithering - Wikipedia, accessed May 9, 2025, [https://en.wikipedia.org/wiki/Ordered\_dithering](https://www.google.com/url?q=https://en.wikipedia.org/wiki/Ordered_dithering&sa=D&source=editors&ust=1746850777619561&usg=AOvVaw14CrhPCJQz84npWcIDWJy7)
35.  How to generate Bayer matrix of arbitrary size? - Game Development Stack Exchange, accessed May 9, 2025, [https://gamedev.stackexchange.com/questions/130696/how-to-generate-bayer-matrix-of-arbitrary-size](https://www.google.com/url?q=https://gamedev.stackexchange.com/questions/130696/how-to-generate-bayer-matrix-of-arbitrary-size&sa=D&source=editors&ust=1746850777620435&usg=AOvVaw04tOB92GlpWdkoeNa2o010)