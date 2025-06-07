/**
 * @typedef {Object} ImageDataObject
 * @property {number} width - The width of the image in pixels.
 * @property {number} height - The height of the image in pixels.
 * @property {Uint8ClampedArray} data - The raw pixel data (RGBA).
 */

/**
 * @typedef {Object} GrayscaleDataObject
 * @property {Uint8Array | Float32Array} data - Grayscale pixel data.
 * @property {number} width - The width of the image in pixels.
 * @property {number} height - The height of the image in pixels.
 */

/**
 * @typedef {Object} OneBitDataObject
 * @property {Uint8Array} data - 1-bit pixel data (packed or boolean array).
 * @property {number} width - The width of the image in pixels.
 * @property {number} height - The height of the image in pixels.
 */

/**
 * @typedef {Object} CropOptions
 * @property {number} x
 * @property {number} y
 * @property {number} width
 * @property {number} height
 */

/**
 * @typedef {Object} PaddingOptions
 * @property {number} [x=0]
 * @property {number} [y=0]
 * @property {'white' | 'black'} [color='white']
 */

/**
 * @typedef {Object} MacPaintWriteOptions
 * @property {Uint8Array[]} [patterns] - Array of 38 8-byte Uint8Arrays.
 * @property {CropOptions} [crop]
 * @property {PaddingOptions} [padding]
 * @property {IDitheringStrategy} [ditheringStrategy]
 */

/**
 * @interface IDitheringStrategy
 */
/**
 * Applies a dithering algorithm to grayscale image data.
 * @function
 * @name IDitheringStrategy#apply
 * @param {GrayscaleDataObject} grayscaleData - The grayscale image data.
 * @returns {OneBitDataObject} The 1-bit dithered image data.
 */

// Forward declaration for AtkinsonDitheringStrategy to be used as default
// class AtkinsonDitheringStrategy { /* Implementation later */ } // Will be defined properly below

/**
 * @implements {IDitheringStrategy}
 */
class ThresholdStrategy {
    /** @type {number} */
    thresholdValue;

    /**
     * @param {Object} [options]
     * @param {number} [options.thresholdValue=128]
     */
    constructor(options = {}) {
        this.thresholdValue = options.thresholdValue === undefined ? 128 : options.thresholdValue;
    }

    /**
     * @param {GrayscaleDataObject} grayscaleData
     * @returns {OneBitDataObject}
     */
    apply(grayscaleData) {
        const { data: gsData, width, height } = grayscaleData;
        const oneBitData = new Uint8Array(Math.ceil(width * height / 8));
        let bitPosition = 0;
        let currentByte = 0;

        for (let i = 0; i < gsData.length; i++) {
            const isBlack = gsData[i] < this.thresholdValue; // MacPaint: 1 is black, 0 is white
            if (isBlack) {
                currentByte |= (1 << (7 - bitPosition));
            }

            bitPosition++;
            if (bitPosition === 8) {
                oneBitData[Math.floor((i / 8))] = currentByte;
                bitPosition = 0;
                currentByte = 0;
            }
        }
        // If height*width is not a multiple of 8, the last byte might be partial
        if (bitPosition > 0) {
             oneBitData[Math.floor(((gsData.length -1) / 8))] = currentByte;
        }

        return { data: oneBitData, width, height };
    }
}

/**
 * @implements {IDitheringStrategy}
 */
class AtkinsonDitheringStrategy {
    constructor() { /* No options for now */ }
    /**
     * @param {GrayscaleDataObject} grayscaleData
     * @returns {OneBitDataObject}
     */
    apply(grayscaleData) {
        const { data: gsDataInput, width, height } = grayscaleData;

        // Create a mutable copy of grayscale data, possibly as Float32Array for precision
        const gsData = new Float32Array(gsDataInput);

        const oneBitDataArray = new Uint8Array(Math.ceil(width * height / 8));
        let oneBitDataIndex = 0;
        let currentByte = 0;
        let bitPosition = 0;

        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const currentIndex = y * width + x;
                const oldPixel = Math.max(0, Math.min(255, gsData[currentIndex])); // Clamp before processing

                const newPixelValue = oldPixel < 128 ? 0 : 255; // Quantize to black (0) or white (255)
                const pntgBit = oldPixel < 128 ? 1 : 0; // MacPaint: 1 is black, 0 is white

                if (pntgBit === 1) { // Black pixel
                    currentByte |= (1 << (7 - bitPosition));
                }

                bitPosition++;
                if (bitPosition === 8) {
                    oneBitDataArray[oneBitDataIndex++] = currentByte;
                    currentByte = 0;
                    bitPosition = 0;
                }

                const quantError = oldPixel - newPixelValue;
                const errorPortion = quantError / 8.0;

                // Distribute error (Atkinson)
                // (x+1, y)
                if (x + 1 < width) {
                    gsData[(y * width) + (x + 1)] += errorPortion;
                }
                // (x+2, y)
                if (x + 2 < width) {
                    gsData[(y * width) + (x + 2)] += errorPortion;
                }
                // (x-1, y+1)
                if (x - 1 >= 0 && y + 1 < height) {
                    gsData[((y + 1) * width) + (x - 1)] += errorPortion;
                }
                // (x, y+1)
                if (y + 1 < height) {
                    gsData[((y + 1) * width) + x] += errorPortion;
                }
                // (x+1, y+1)
                if (x + 1 < width && y + 1 < height) {
                    gsData[((y + 1) * width) + (x + 1)] += errorPortion;
                }
                // (x, y+2)
                if (y + 2 < height) {
                    gsData[((y + 2) * width) + x] += errorPortion;
                }
            }
        }

        // If the last byte wasn't filled
        if (bitPosition > 0) {
            oneBitDataArray[oneBitDataIndex++] = currentByte;
        }
        
        // Ensure the output array is the correct size, even if oneBitDataIndex didn't reach the end
        // (e.g. if width*height wasn't a multiple of 8, Math.ceil handled allocation)
        const finalOneBitData = new Uint8Array(Math.ceil(width * height / 8));
        finalOneBitData.set(oneBitDataArray.slice(0, finalOneBitData.length));


        return { data: finalOneBitData, width, height };
    }
}

/**
 * @implements {IDitheringStrategy}
 */
class FloydSteinbergDitheringStrategy {
    constructor() { /* No options for now */ }
    /**
     * @param {GrayscaleDataObject} grayscaleData
     * @returns {OneBitDataObject}
     */
    apply(grayscaleData) {
        const { data: gsDataInput, width, height } = grayscaleData;
        const gsData = new Float32Array(gsDataInput); // Mutable copy for error diffusion

        const oneBitDataArray = new Uint8Array(Math.ceil(width * height / 8));
        let oneBitDataIndex = 0;
        let currentByte = 0;
        let bitPosition = 0;

        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const currentIndex = y * width + x;
                const oldPixel = Math.max(0, Math.min(255, gsData[currentIndex])); // Clamp before processing

                const newPixelValue = oldPixel < 128 ? 0 : 255; // Quantize
                const pntgBit = oldPixel < 128 ? 1 : 0; // MacPaint: 1 is black

                if (pntgBit === 1) { // Black pixel
                    currentByte |= (1 << (7 - bitPosition));
                }

                bitPosition++;
                if (bitPosition === 8) {
                    oneBitDataArray[oneBitDataIndex++] = currentByte;
                    currentByte = 0;
                    bitPosition = 0;
                }

                const quantError = oldPixel - newPixelValue;

                // Distribute error (Floyd-Steinberg)
                // To pixel (x+1, y) (right): add quant_error * 7/16
                if (x + 1 < width) {
                    gsData[currentIndex + 1] += quantError * (7 / 16);
                }
                // To pixel (x-1, y+1) (bottom-left): add quant_error * 3/16
                if (x - 1 >= 0 && y + 1 < height) {
                    gsData[((y + 1) * width) + (x - 1)] += quantError * (3 / 16);
                }
                // To pixel (x, y+1) (bottom): add quant_error * 5/16
                if (y + 1 < height) {
                    gsData[((y + 1) * width) + x] += quantError * (5 / 16);
                }
                // To pixel (x+1, y+1) (bottom-right): add quant_error * 1/16
                if (x + 1 < width && y + 1 < height) {
                    gsData[((y + 1) * width) + (x + 1)] += quantError * (1 / 16);
                }
            }
        }

        // If the last byte wasn't filled
        if (bitPosition > 0) {
            oneBitDataArray[oneBitDataIndex++] = currentByte;
        }
        
        const finalOneBitData = new Uint8Array(Math.ceil(width * height / 8));
        finalOneBitData.set(oneBitDataArray.slice(0, finalOneBitData.length));

        return { data: finalOneBitData, width, height };
    }
}

/**
 * @implements {IDitheringStrategy}
 */
class BayerDitheringStrategy {
    /** @type {2 | 4 | 8} */
    matrixSize;
    /** @type {number[][]} */
    _bayerMatrix;
    /** @type {number} */
    _normalizationFactor;

    /**
     * @param {Object} [options]
     * @param {2 | 4 | 8} [options.matrixSize=4]
     */
    constructor(options = {}) {
        this.matrixSize = options.matrixSize || 4;
        this._initializeBayerMatrix();
    }

    _initializeBayerMatrix() {
        if (this.matrixSize === 2) {
            this._bayerMatrix = [
                [0, 2],
                [3, 1]
            ];
            this._normalizationFactor = 4;
        } else if (this.matrixSize === 4) {
            this._bayerMatrix = [
                [0, 8, 2, 10],
                [12, 4, 14, 6],
                [3, 11, 1, 9],
                [15, 7, 13, 5]
            ];
            this._normalizationFactor = 16;
        } else if (this.matrixSize === 8) {
            this._bayerMatrix = [
                [0, 32, 8, 40, 2, 34, 10, 42],
                [48, 16, 56, 24, 50, 18, 58, 26],
                [12, 44, 4, 36, 14, 46, 6, 38],
                [60, 28, 52, 20, 62, 30, 54, 22],
                [3, 35, 11, 43, 1, 33, 9, 41],
                [51, 19, 59, 27, 49, 17, 57, 25],
                [15, 47, 7, 39, 13, 45, 5, 37],
                [63, 31, 55, 23, 61, 29, 53, 21]
            ];
            this._normalizationFactor = 64;
        } else {
            // As per plan, stick to predefined. Could throw error or default.
            console.warn(`Unsupported Bayer matrix size: ${this.matrixSize}. Defaulting to 4x4.`);
            this.matrixSize = 4;
            this._initializeBayerMatrix(); // Recurse to set default
            return;
        }
    }

    /**
     * @param {GrayscaleDataObject} grayscaleData
     * @returns {OneBitDataObject}
     */
    apply(grayscaleData) {
        const { data: gsData, width, height } = grayscaleData;
        const n = this.matrixSize;

        const oneBitDataArray = new Uint8Array(Math.ceil(width * height / 8));
        let oneBitDataIndex = 0;
        let currentByte = 0;
        let bitPosition = 0;

        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const grayscaleValue = gsData[y * width + x];
                // Normalize grayscale value to 0-1 range (input gsData is 0-255)
                const grayscaleNormalized = grayscaleValue / 255.0;
                
                // Get threshold from Bayer matrix (normalized)
                // The matrix stores M_n values, normalized by n^2
                // threshold = M_n[y % n][x % n] / n^2
                // To better align with typical thresholding (value < threshold = black),
                // and considering PNTG 1=black, 0=white:
                // if (gs_normalized <= bayer_threshold_normalized) -> black (PNTG bit 1)
                // else -> white (PNTG bit 0)
                // The doc says: "If grayscale_normalized > threshold, the output PNTG bit is 0 (White).
                // Else (grayscale_normalized <= threshold), the output PNTG bit is 1 (Black)."
                // This matches my logic.
                const bayerMatrixValue = this._bayerMatrix[y % n][x % n];
                const bayerThresholdNormalized = bayerMatrixValue / this._normalizationFactor;


                const pntgBit = grayscaleNormalized <= bayerThresholdNormalized ? 1 : 0;

                if (pntgBit === 1) { // Black pixel
                    currentByte |= (1 << (7 - bitPosition));
                }

                bitPosition++;
                if (bitPosition === 8) {
                    oneBitDataArray[oneBitDataIndex++] = currentByte;
                    currentByte = 0;
                    bitPosition = 0;
                }
            }
        }

        if (bitPosition > 0) {
            oneBitDataArray[oneBitDataIndex++] = currentByte;
        }

        const finalOneBitData = new Uint8Array(Math.ceil(width * height / 8));
        finalOneBitData.set(oneBitDataArray.slice(0, finalOneBitData.length));
        
        return { data: finalOneBitData, width, height };
    }
}


class ImageUtils {
    /**
     * Converts RGBA ImageData to Grayscale.
     * @param {ImageDataObject} imageDataObject
     * @returns {GrayscaleDataObject}
     */
    static toGrayscale(imageDataObject) {
        const { data: rgbaData, width, height } = imageDataObject;
        const grayscaleData = new Uint8Array(width * height);
        for (let i = 0; i < rgbaData.length; i += 4) {
            const r = rgbaData[i];
            const g = rgbaData[i + 1];
            const b = rgbaData[i + 2];
            // Using Rec.709 luma coefficients
            // Y = 0.2126R + 0.7152G + 0.0722B
            const gray = Math.round(0.2126 * r + 0.7152 * g + 0.0722 * b);
            grayscaleData[i / 4] = gray;
        }
        return { data: grayscaleData, width, height };
    }

    /**
     * Crops an ImageDataObject.
     * @param {ImageDataObject} imageDataObject
     * @param {CropOptions} cropOpts - {x, y, width, height} of the crop area.
     * @returns {ImageDataObject} - The new cropped ImageDataObject.
     */
    static crop(imageDataObject, cropOpts) {
        const { data: sourceData, width: sourceWidth, height: sourceHeight } = imageDataObject;
        const { x, y, width: cropWidth, height: cropHeight } = cropOpts;

        if (x < 0 || y < 0 || x + cropWidth > sourceWidth || y + cropHeight > sourceHeight) {
            console.error("Crop dimensions are out of bounds.", {sourceWidth, sourceHeight, cropOpts});
            throw new Error("Crop dimensions are out of bounds.");
        }
        if (cropWidth <= 0 || cropHeight <= 0) {
            throw new Error("Crop width and height must be greater than 0.");
        }

        const croppedData = new Uint8ClampedArray(cropWidth * cropHeight * 4);
        let targetIndex = 0;
        for (let r = 0; r < cropHeight; r++) {
            for (let c = 0; c < cropWidth; c++) {
                const sourceIndex = ((y + r) * sourceWidth + (x + c)) * 4;
                croppedData[targetIndex++] = sourceData[sourceIndex];     // R
                croppedData[targetIndex++] = sourceData[sourceIndex + 1]; // G
                croppedData[targetIndex++] = sourceData[sourceIndex + 2]; // B
                croppedData[targetIndex++] = sourceData[sourceIndex + 3]; // A
            }
        }
        return { width: cropWidth, height: cropHeight, data: croppedData };
    }

    /**
     * Pads an ImageDataObject to target dimensions.
     * The source image is placed at (padOpts.x, padOpts.y) within the new canvas.
     * @param {ImageDataObject} imageDataObject - The source image.
     * @param {PaddingOptions} padOpts - {x, y, color}
     * @param {number} targetWidth
     * @param {number} targetHeight
     * @returns {ImageDataObject} - The new padded ImageDataObject.
     */
    static pad(imageDataObject, padOpts, targetWidth, targetHeight) {
        const { data: sourceData, width: sourceWidth, height: sourceHeight } = imageDataObject;
        const { x = 0, y = 0, color = 'white' } = padOpts || {}; // Ensure padOpts exists

        // It's possible the source image after cropping/scaling is already the target size or larger
        // This function primarily handles cases where source is smaller or needs placement.
        // If source is larger, it will be clipped by the placement logic if x/y are non-zero.

        const paddedData = new Uint8ClampedArray(targetWidth * targetHeight * 4);
        const fillColorR = color === 'white' ? 255 : 0;
        const fillColorG = color === 'white' ? 255 : 0;
        const fillColorB = color === 'white' ? 255 : 0;
        const fillColorA = 255; // Always opaque

        // Fill with padding color
        for (let i = 0; i < paddedData.length; i += 4) {
            paddedData[i] = fillColorR;
            paddedData[i + 1] = fillColorG;
            paddedData[i + 2] = fillColorB;
            paddedData[i + 3] = fillColorA;
        }

        // Draw the source image onto the padded canvas
        // Iterate over the source image pixels
        for (let r_src = 0; r_src < sourceHeight; r_src++) {
            for (let c_src = 0; c_src < sourceWidth; c_src++) {
                const targetPixelX = x + c_src;
                const targetPixelY = y + r_src;

                // Check if the target pixel is within the bounds of the target canvas
                if (targetPixelX >= 0 && targetPixelX < targetWidth && targetPixelY >= 0 && targetPixelY < targetHeight) {
                    const sourceIndex = (r_src * sourceWidth + c_src) * 4;
                    const targetIndex = (targetPixelY * targetWidth + targetPixelX) * 4;
                    
                    paddedData[targetIndex]     = sourceData[sourceIndex];
                    paddedData[targetIndex + 1] = sourceData[sourceIndex + 1];
                    paddedData[targetIndex + 2] = sourceData[sourceIndex + 2];
                    paddedData[targetIndex + 3] = sourceData[sourceIndex + 3];
                }
            }
        }
        return { width: targetWidth, height: targetHeight, data: paddedData };
    }

    static scaleBilinear(imageDataObject, targetWidth, targetHeight) {
        const { data: sourceData, width: sourceWidth, height: sourceHeight } = imageDataObject;

        if (sourceWidth === targetWidth && sourceHeight === targetHeight) {
            return imageDataObject;
        }

        // Try browser canvas approach first
        if (typeof document !== 'undefined' && typeof document.createElement === 'function') {
            try {
                const sourceCanvas = document.createElement('canvas');
                sourceCanvas.width = sourceWidth;
                sourceCanvas.height = sourceHeight;
                const sourceCtx = sourceCanvas.getContext('2d');
                
                // Create ImageData from sourceData
                const sourceImgData = sourceCtx.createImageData(sourceWidth, sourceHeight);
                sourceImgData.data.set(sourceData);
                sourceCtx.putImageData(sourceImgData, 0, 0);

                const targetCanvas = document.createElement('canvas');
                targetCanvas.width = targetWidth;
                targetCanvas.height = targetHeight;
                const targetCtx = targetCanvas.getContext('2d');

                // Set imageSmoothingEnabled for potentially better quality (though 'bilinear' is often default)
                // Note: Different browsers might have prefixes or different names in the past.
                // For modern browsers, this should generally work.
                targetCtx.imageSmoothingEnabled = true;
                // targetCtx.mozImageSmoothingEnabled = true; // Firefox
                // targetCtx.webkitImageSmoothingEnabled = true; // WebKit
                // targetCtx.msImageSmoothingEnabled = true; // IE

                targetCtx.drawImage(sourceCanvas, 0, 0, sourceWidth, sourceHeight, 0, 0, targetWidth, targetHeight);
                
                const scaledImageData = targetCtx.getImageData(0, 0, targetWidth, targetHeight);
                return { width: targetWidth, height: targetHeight, data: new Uint8ClampedArray(scaledImageData.data) };

            } catch (e) {
                console.error("Canvas-based scaling failed in browser-like environment:", e);
                // Fallback to manual if canvas fails for some reason, or just warn and return original.
            }
        }

        // Fallback for Node.js or if canvas failed:
        // Manual Bilinear Interpolation (simplified, can be optimized)
        // This is a basic implementation. For high quality/performance, a library or node-canvas is better.
        console.warn("ImageUtils.scaleBilinear: Using manual bilinear interpolation. For Node.js, consider node-canvas. For browsers, ensure canvas is available.");
        
        const targetData = new Uint8ClampedArray(targetWidth * targetHeight * 4);
        const x_ratio = sourceWidth / targetWidth;
        const y_ratio = sourceHeight / targetHeight;

        for (let i = 0; i < targetHeight; i++) {
            for (let j = 0; j < targetWidth; j++) {
                const px = Math.floor(j * x_ratio);
                const py = Math.floor(i * y_ratio);
                const fx = (j * x_ratio) - px;
                const fy = (i * y_ratio) - py;

                const C1_idx = (py * sourceWidth + px) * 4;
                const C2_idx = (py * sourceWidth + (px + 1 < sourceWidth ? px + 1 : px)) * 4;
                const C3_idx = ((py + 1 < sourceHeight ? py + 1 : py) * sourceWidth + px) * 4;
                const C4_idx = ((py + 1 < sourceHeight ? py + 1 : py) * sourceWidth + (px + 1 < sourceWidth ? px + 1 : px)) * 4;
                
                const targetIdx = (i * targetWidth + j) * 4;

                for (let k = 0; k < 4; k++) { // R, G, B, A
                    const C1 = sourceData[C1_idx + k];
                    const C2 = sourceData[C2_idx + k];
                    const C3 = sourceData[C3_idx + k];
                    const C4 = sourceData[C4_idx + k];

                    const P1 = C1 * (1 - fx) + C2 * fx;
                    const P2 = C3 * (1 - fx) + C4 * fx;
                    targetData[targetIdx + k] = Math.round(P1 * (1 - fy) + P2 * fy);
                }
            }
        }
        return { width: targetWidth, height: targetHeight, data: targetData };
    }

    static createImageDataObject(width, height, data) {
        return { width, height, data: data || new Uint8ClampedArray(width * height * 4) };
    }
}


class MacPaintImage {
    /** @type {ImageDataObject} */
    imageData;
    /** @type {Uint8Array[]} */
    patterns;
    /** @type {MacPaintWriteOptions} */
    _writeOptions;


    /**
     * Creates an instance of MacPaintImage.
     * @param {ImageDataObject} imageDataObject
     * @param {MacPaintWriteOptions} [options={}]
     */
    constructor(imageDataObject, options = {}) {
        this.imageData = imageDataObject; // This will be processed further in toArrayBuffer
        this._writeOptions = options;
        this.patterns = options.patterns || this._getDefaultPatterns();

        if (!this._writeOptions.ditheringStrategy) {
            this._writeOptions.ditheringStrategy = new AtkinsonDitheringStrategy();
        }
    }

    /**
     * Parses an ArrayBuffer containing PNTG file data.
     * @param {ArrayBuffer} arrayBuffer
     * @returns {MacPaintImage}
     * @static
     */
    static fromArrayBuffer(arrayBuffer) {
        const PNTG_WIDTH = 576;
        const PNTG_HEIGHT = 720;
        const BYTES_PER_SCANLINE_UNCOMPRESSED = PNTG_WIDTH / 8; // 72 bytes

        const view = new DataView(arrayBuffer);
        let offset = 0;

        // 1. MacBinary Header Detection (Optional 128 bytes)
        // Ref: macpaint-doc.md#Table 1
        // Offset 0: Old_Version_Byte (0x00)
        // Offset 1: Filename_Length (1-63)
        // Offset 65: File_Type ('PNTG')
        // Offset 69: File_Creator ('MPNT')
        if (arrayBuffer.byteLength >= 128 &&
            view.getUint8(0) === 0x00 &&
            view.getUint8(1) >= 1 && view.getUint8(1) <= 63 &&
            view.getUint32(65, false) === 0x504E5447 // 'PNTG' in big-endian
            // view.getUint32(69, false) === 0x4D504E54 // 'MPNT' - can be more flexible
        ) {
            // Check if file type is PNTG specifically
            const fileType = String.fromCharCode(view.getUint8(65), view.getUint8(66), view.getUint8(67), view.getUint8(68));
            if (fileType === 'PNTG') {
                 offset = 128;
                 console.log("MacBinary header detected and skipped.");
            }
        }

        // 2. Application Header (512 bytes)
        // Ref: macpaint-doc.md#Table 2
        if (offset + 512 > arrayBuffer.byteLength) {
            throw new Error("File too short to contain MacPaint application header.");
        }

        // PNTG Marker / Version (4 bytes: 0x00, 0x00, 0x00, 0x02)
        const marker1 = view.getUint32(offset, false); // Big-endian
        if (marker1 !== 0x00000002) {
            // Some sources say it can be 0x00000000 for version 1, but doc focuses on 0x02
            console.warn(`Unexpected MacPaint marker/version: 0x${marker1.toString(16)}. Expected 0x00000002.`);
        }
        offset += 4;

        // Pattern Data (304 bytes: 38 patterns, 8 bytes each)
        const parsedPatterns = [];
        for (let i = 0; i < 38; i++) {
            const pattern = new Uint8Array(8);
            for (let j = 0; j < 8; j++) {
                pattern[j] = view.getUint8(offset++);
            }
            parsedPatterns.push(pattern);
        }

        // Padding (204 bytes) - skip
        offset += 204;

        // 3. Compressed Image Data
        const imageDataArray = new Uint8ClampedArray(PNTG_WIDTH * PNTG_HEIGHT * 4);
        let imageDataIndex = 0;

        for (let y = 0; y < PNTG_HEIGHT; y++) {
            const decompressedScanlineResult = PackBits.decompressScanline(view, offset);
            if (decompressedScanlineResult.error) {
                throw new Error(`Error decompressing scanline ${y}: ${decompressedScanlineResult.error}`);
            }
            const scanlineData = decompressedScanlineResult.data;
            offset += decompressedScanlineResult.bytesRead;

            if (scanlineData.length !== BYTES_PER_SCANLINE_UNCOMPRESSED) {
                throw new Error(`Decompressed scanline ${y} has incorrect length: ${scanlineData.length}, expected ${BYTES_PER_SCANLINE_UNCOMPRESSED}`);
            }

            for (let byteIndex = 0; byteIndex < BYTES_PER_SCANLINE_UNCOMPRESSED; byteIndex++) {
                const byte = scanlineData[byteIndex];
                for (let bit = 7; bit >= 0; bit--) { // MSB is leftmost pixel
                    const isBlack = (byte >> bit) & 1;
                    const colorVal = isBlack ? 0 : 255;
                    imageDataArray[imageDataIndex++] = colorVal; // R
                    imageDataArray[imageDataIndex++] = colorVal; // G
                    imageDataArray[imageDataIndex++] = colorVal; // B
                    imageDataArray[imageDataIndex++] = 255;     // A (opaque)
                }
            }
        }

        const finalImageData = {
            width: PNTG_WIDTH,
            height: PNTG_HEIGHT,
            data: imageDataArray
        };

        const instance = new MacPaintImage(finalImageData);
        instance.patterns = parsedPatterns; // Set the parsed patterns
        return instance;
    }

    /**
     * Serializes the MacPaintImage instance into a PNTG file format within an ArrayBuffer.
     * @returns {ArrayBuffer}
     */
    toArrayBuffer() {
        // Assumes this.imageData is 576x720 RGBA for this basic version
        const PNTG_WIDTH = 576;
        const PNTG_HEIGHT = 720;
        const BYTES_PER_SCANLINE_UNCOMPRESSED = PNTG_WIDTH / 8;

        // 1. Image Preprocessing
        let currentImageData = { ...this.imageData, data: new Uint8ClampedArray(this.imageData.data) }; // Work on a copy

        // Apply cropping if specified
        if (this._writeOptions.crop) {
            if (this._writeOptions.crop.width <= 0 || this._writeOptions.crop.height <= 0) {
                throw new Error("Crop dimensions (width and height) must be greater than 0.");
            }
            console.log("Applying crop:", this._writeOptions.crop);
            currentImageData = ImageUtils.crop(currentImageData, this._writeOptions.crop);
        }

        // If the current image (after potential crop) is smaller than PNTG dimensions
        // AND padding options are provided, pad it onto a PNTG_WIDTH x PNTG_HEIGHT canvas.
        // This is for placing a smaller image onto the larger canvas using specified offsets and fill.
        if ((currentImageData.width < PNTG_WIDTH || currentImageData.height < PNTG_HEIGHT) && this._writeOptions.padding) {
            console.log(`Padding image of size ${currentImageData.width}x${currentImageData.height} onto ${PNTG_WIDTH}x${PNTG_HEIGHT} canvas with options:`, this._writeOptions.padding);
            currentImageData = ImageUtils.pad(currentImageData, this._writeOptions.padding, PNTG_WIDTH, PNTG_HEIGHT);
        }

        // If, after potential crop and optional padding, dimensions are still not PNTG_WIDTH x PNTG_HEIGHT, scale it.
        // This handles cases where the image was larger, or smaller and no specific padding was applied to bring it to size.
        if (currentImageData.width !== PNTG_WIDTH || currentImageData.height !== PNTG_HEIGHT) {
            console.log(`Scaling image from ${currentImageData.width}x${currentImageData.height} to ${PNTG_WIDTH}x${PNTG_HEIGHT}`);
            currentImageData = ImageUtils.scaleBilinear(currentImageData, PNTG_WIDTH, PNTG_HEIGHT);
        }

        // Final check: if processing somehow didn't result in the exact dimensions, fallback.
        if (currentImageData.width !== PNTG_WIDTH || currentImageData.height !== PNTG_HEIGHT) {
            console.error(`Image processing failed to result in ${PNTG_WIDTH}x${PNTG_HEIGHT}. Current: ${currentImageData.width}x${currentImageData.height}. Using fallback blank white image.`);
            currentImageData = ImageUtils.createImageDataObject(PNTG_WIDTH, PNTG_HEIGHT, new Uint8ClampedArray(PNTG_WIDTH * PNTG_HEIGHT * 4).fill(255));
        }
        
        const processedImageData = currentImageData; // Final name for clarity

        // 2. Grayscale Conversion
        const grayscaleObject = ImageUtils.toGrayscale(processedImageData);

        // 3. Monochrome Conversion (Dithering)
        const ditherStrategy = this._writeOptions.ditheringStrategy || new AtkinsonDitheringStrategy();
        const oneBitObject = ditherStrategy.apply(grayscaleObject);
        const oneBitData = oneBitObject.data; // This is packed 1-bit data (72 bytes per scanline)

        if (oneBitData.length !== (PNTG_WIDTH * PNTG_HEIGHT / 8)) {
            throw new Error(`Dithered data length is incorrect. Expected ${PNTG_WIDTH * PNTG_HEIGHT / 8}, got ${oneBitData.length}`);
        }

        // 4. Application Header (512 bytes)
        const headerBuffer = new ArrayBuffer(512);
        const headerView = new DataView(headerBuffer);
        let headerOffset = 0;

        headerView.setUint32(headerOffset, 0x00000002, false); // PNTG Marker/Version
        headerOffset += 4;

        const patternsToUse = this._writeOptions.patterns || this.patterns; // Use provided or instance patterns
        for (let i = 0; i < 38; i++) {
            const pattern = patternsToUse[i] || new Uint8Array(8); // Fallback if a pattern is missing
            for (let j = 0; j < 8; j++) {
                headerView.setUint8(headerOffset++, pattern[j]);
            }
        }
        // Padding (remaining 204 bytes) is implicitly zeros due to ArrayBuffer initialization

        // 5. Image Data (PackBits compression)
        const compressedScanlines = [];
        let totalCompressedSize = 0;

        for (let y = 0; y < PNTG_HEIGHT; y++) {
            const scanline1Bit = new Uint8Array(BYTES_PER_SCANLINE_UNCOMPRESSED);
            const startIndexInOneBitData = y * BYTES_PER_SCANLINE_UNCOMPRESSED;
            
            // Extract the 72 bytes for the current scanline from oneBitData
            for(let i=0; i < BYTES_PER_SCANLINE_UNCOMPRESSED; i++) {
                scanline1Bit[i] = oneBitData[startIndexInOneBitData + i];
            }
            
            const compressedScanline = PackBits.compressScanline(scanline1Bit);
            compressedScanlines.push(compressedScanline);
            totalCompressedSize += compressedScanline.length;
        }

        // Assemble final ArrayBuffer
        const finalBuffer = new ArrayBuffer(512 + totalCompressedSize);
        const finalView = new Uint8Array(finalBuffer);

        finalView.set(new Uint8Array(headerBuffer), 0); // Copy header

        let currentDataOffset = 512;
        for (const cs of compressedScanlines) {
            finalView.set(cs, currentDataOffset);
            currentDataOffset += cs.length;
        }
        console.log(`Serialization complete. Total size: ${finalBuffer.byteLength} bytes.`);
        return finalBuffer;
    }

    _getDefaultPatterns() {
        // Placeholder for default MacPaint patterns
        // For now, 38 empty 8-byte patterns
        return Array(38).fill(null).map(() => new Uint8Array(8));
    }
}

// Other classes (Dithering Strategies, PackBits, ImageUtils) will be defined later or in separate files.

// Example Dithering Strategy (to be fully implemented later)
// class AtkinsonDitheringStrategy { // Already forward-declared
//     apply(grayscaleData) {
//         console.log("Applying Atkinson Dithering...");
//         // Placeholder
//         return { data: new Uint8Array(grayscaleData.width * grayscaleData.height / 8), width: grayscaleData.width, height: grayscaleData.height };
//     }
// }

// Export the main class if using modules
// export { MacPaintImage };
// For now, assuming a single file script or manual namespacing if needed.

class PackBits {
    /**
     * Decompresses a PackBits-encoded scanline.
     * Each scanline in MacPaint is 72 bytes uncompressed.
     * @param {DataView} inputView - The DataView containing the compressed data.
     * @param {number} initialOffset - The offset to start reading from in the inputView.
     * @returns {{data: Uint8Array, bytesRead: number, error?: string}} - Decompressed 72-byte scanline and bytes read.
     */
    static decompressScanline(inputView, initialOffset) {
        const output = new Uint8Array(72);
        let outputIndex = 0;
        let currentOffset = initialOffset;

        try {
            while (outputIndex < 72) {
                if (currentOffset >= inputView.byteLength) {
                    return { data: output, bytesRead: currentOffset - initialOffset, error: "Unexpected end of input during decompression." };
                }

                const headerByte = inputView.getInt8(currentOffset++);
                
                if (headerByte >= 0) { // Literal run: 0 to 127
                    const count = headerByte + 1;
                    if (outputIndex + count > 72) {
                        return { data: output, bytesRead: currentOffset - initialOffset, error: "Literal run exceeds scanline boundary." };
                    }
                    if (currentOffset + count > inputView.byteLength) {
                        return { data: output, bytesRead: currentOffset - initialOffset, error: "Literal run reads past input buffer." };
                    }
                    for (let i = 0; i < count; i++) {
                        output[outputIndex++] = inputView.getUint8(currentOffset++);
                    }
                } else if (headerByte >= -127 && headerByte <= -1) { // Repeat run: -1 to -127
                    const count = 1 - headerByte;
                    if (outputIndex + count > 72) {
                        return { data: output, bytesRead: currentOffset - initialOffset, error: "Repeat run exceeds scanline boundary." };
                    }
                    if (currentOffset >= inputView.byteLength) {
                        return { data: output, bytesRead: currentOffset - initialOffset, error: "Repeat run reads past input buffer for byte to repeat." };
                    }
                    const byteToRepeat = inputView.getUint8(currentOffset++);
                    for (let i = 0; i < count; i++) {
                        output[outputIndex++] = byteToRepeat;
                    }
                } else if (headerByte === -128) { // No-op
                    // Do nothing, skip this byte.
                }
            }

            if (outputIndex !== 72) {
                 return { data: output, bytesRead: currentOffset - initialOffset, error: `Scanline decompression did not yield 72 bytes, got ${outputIndex}` };
            }
            return { data: output, bytesRead: currentOffset - initialOffset };

        } catch (e) {
            return { data: output, bytesRead: currentOffset - initialOffset, error: `Exception during decompression: ${e.message}` };
        }
    }

    /**
     * Compresses a 72-byte scanline using PackBits.
     * @param {Uint8Array} scanlineData - 72-byte uncompressed scanline.
     * @returns {Uint8Array} - Compressed data.
     */
    static compressScanline(scanlineData) {
        if (scanlineData.length !== 72) {
            throw new Error("Scanline data must be 72 bytes long for PackBits compression.");
        }

        const compressed = [];
        let i = 0;
        const n = scanlineData.length;

        while (i < n) {
            let runLength = 1;
            // Find repeat run
            while (i + runLength < n && scanlineData[i] === scanlineData[i + runLength] && runLength < 128) {
                runLength++;
            }

            if (runLength > 1) {
                compressed.push(-(runLength - 1)); // Control byte for repeat run
                compressed.push(scanlineData[i]);
                i += runLength;
            } else {
                // Find literal run
                let literalStart = i;
                i++; // Current byte is part of literal run
                while (i < n) {
                    if (i + 1 < n && scanlineData[i] === scanlineData[i+1]) {
                        // If a repeat of 2 or more starts, end literal run here
                        break;
                    }
                    if (i - literalStart >= 127) { // Max literal run length (128 bytes = header + 127 data)
                        break;
                    }
                    i++;
                }
                const literalLength = i - literalStart;
                compressed.push(literalLength - 1); // Control byte for literal run
                for (let j = 0; j < literalLength; j++) {
                    compressed.push(scanlineData[literalStart + j]);
                }
            }
        }
        return new Uint8Array(compressed);
    }
}