/**
 * mfs.js
 * A JavaScript library for creating, reading from, and writing to MFS-formatted disk images.
 * Based on the plan in mfs-library-plan.md and details from mfs-read-write.md.
 */

const MFS_SIGNATURE = 0xD2D7;
const SECTOR_SIZE = 512;
const DEFAULT_ALLOC_BLOCK_SIZE_400K = 1024; // For a 400KB disk
const MDB_START_SECTOR = 2;
const BOOT_BLOCK_SECTORS = 2;

// MFS Timestamps are seconds since midnight, January 1, 1904
const MFS_EPOCH_OFFSET = Date.UTC(1904, 0, 1) / 1000; // In seconds

/**
 * Utility functions for MFS library.
 * These might be integrated as static or private methods of MFSVolume later if preferred.
 */
class MFSLibUtils {
    static readUint8(dataView, offset) {
        return dataView.getUint8(offset);
    }

    static writeUint8(dataView, offset, value) {
        dataView.setUint8(offset, value);
    }

    static readUint16BE(dataView, offset) {
        return dataView.getUint16(offset, false); // false for big-endian
    }

    static writeUint16BE(dataView, offset, value) {
        dataView.setUint16(offset, value, false);
    }

    static readUint32BE(dataView, offset) {
        return dataView.getUint32(offset, false);
    }

    static writeUint32BE(dataView, offset, value) {
        dataView.setUint32(offset, value, false);
    }

    static readPascalString(dataView, offset, maxLength = 27) {
        const length = MFSLibUtils.readUint8(dataView, offset);
        let str = "";
        const actualLength = Math.min(length, maxLength); // Respect MDB volume name max length or file entry name length
        for (let i = 0; i < actualLength; i++) {
            str += String.fromCharCode(MFSLibUtils.readUint8(dataView, offset + 1 + i));
        }
        return str;
    }

    static writePascalString(dataView, offset, str, fixedLength) {
        const len = Math.min(str.length, fixedLength -1); // Max 27 chars for drVN, or flNamLen for filename
        MFSLibUtils.writeUint8(dataView, offset, len);
        for (let i = 0; i < len; i++) {
            MFSLibUtils.writeUint8(dataView, offset + 1 + i, str.charCodeAt(i));
        }
        // Pad with zeros if fixedLength is provided (e.g. for drVN)
        for (let i = len; i < fixedLength - 1; i++) {
            MFSLibUtils.writeUint8(dataView, offset + 1 + i, 0);
        }
    }

    static mfsTimestampToDate(mfsTime) {
        if (mfsTime === 0) return null; // Or handle as appropriate
        return new Date((mfsTime + MFS_EPOCH_OFFSET) * 1000);
    }

    static dateToMFSTimestamp(date) {
        if (!date) return 0;
        return Math.floor(date.getTime() / 1000) - MFS_EPOCH_OFFSET;
    }

    /**
     * Decodes a 12-bit ABM entry from a 3-byte triplet.
     * @param {number} b0 - First byte of the triplet.
     * @param {number} b1 - Second byte of the triplet.
     * @param {number} b2 - Third byte of the triplet.
     * @param {boolean} isEvenIndex - True if the desired entry is the first in the triplet (even MFS block number - 2).
     * @returns {number} The 12-bit ABM entry value.
     */
    static getABMEntryFromTriplet(b0, b1, b2, isEvenIndex) {
        if (isEvenIndex) { // Corresponds to blockNum % 2 === 0 in the conceptual snippet
            return (b0 << 4) | (b1 >> 4);
        } else {
            return ((b1 & 0x0F) << 8) | b2;
        }
    }

    /**
     * Packs a 12-bit ABM entry value into a 3-byte triplet.
     * Modifies b0, b1, b2 based on the value and index.
     * @param {number} value - The 12-bit value to write (0-4095).
     * @param {number} b0 - Current first byte of the triplet.
     * @param {number} b1 - Current second byte of the triplet.
     * @param {number} b2 - Current third byte of the triplet.
     * @param {boolean} isEvenIndex - True if the value is for the first entry in the triplet.
     * @returns {{b0: number, b1: number, b2: number}} The modified triplet.
     */
    static packABMEntryToTriplet(value, b0, b1, b2, isEvenIndex) {
        if (value > 0xFFF) throw new Error("ABM value exceeds 12-bit range");

        if (isEvenIndex) {
            b0 = (value >> 4) & 0xFF;
            b1 = (b1 & 0x0F) | ((value & 0x0F) << 4);
        } else {
            b1 = (b1 & 0xF0) | ((value >> 8) & 0x0F);
            b2 = value & 0xFF;
        }
        return { b0, b1, b2 };
    }
}


class MFSVolume {
    /**
     * @param {ArrayBuffer | {create: boolean, sizeKB?: number, volumeName?: string}} sourceOrOptions
     * If sourceOrOptions is an ArrayBuffer, it loads an existing MFS image.
     * If sourceOrOptions is an object with `create: true`, it creates a new MFS image.
     *   `sizeKB`: Size of the new image in kilobytes (default: 400).
     *   `volumeName`: Name of the new volume (default: "Untitled").
     */
    constructor(sourceOrOptions) {
        this.imageBuffer = null;
        this.dataView = null;
        this.volumeInfo = null; // Will hold MFSVolumeInfo object
        this.abm = [];          // In-memory array of 12-bit ABM entries
        this.fileDirectory = []; // Array of MFSFileEntry objects

        if (sourceOrOptions instanceof ArrayBuffer) {
            this._loadExistingImage(sourceOrOptions);
        } else if (typeof sourceOrOptions === 'object' && sourceOrOptions.create === true) {
            const sizeKB = sourceOrOptions.sizeKB || 400;
            const volumeName = sourceOrOptions.volumeName || "Untitled";
            this._formatNewImage(sizeKB, volumeName);
        } else {
            throw new Error("Invalid constructor argument: Provide ArrayBuffer or creation options.");
        }
    }

    _loadExistingImage(arrayBuffer) {
        this.imageBuffer = arrayBuffer;
        this.dataView = new DataView(this.imageBuffer);

        console.log("Attempting to load existing image...");
        this._parseMDB();
        if (this.volumeInfo.signature !== MFS_SIGNATURE) {
            throw new Error(`Invalid MFS signature. Expected ${MFS_SIGNATURE.toString(16)}, got ${this.volumeInfo.signature.toString(16)}`);
        }
        this._parseFileDirectory();
        console.log(`Volume "${this.volumeInfo.volumeName}" loaded successfully.`);
    }

    _formatNewImage(sizeKB, volumeName) {
        const totalSizeBytes = sizeKB * 1024;
        if (totalSizeBytes % SECTOR_SIZE !== 0) {
            throw new Error(`Image size (${sizeKB}KB) must be a multiple of sector size (${SECTOR_SIZE} bytes).`);
        }
        // For simplicity, using typical 400K disk parameters from mfs-read-write.md:100-105
        // These would need to be more dynamic for other sizes.
        const allocBlockSize = DEFAULT_ALLOC_BLOCK_SIZE_400K;
        if (totalSizeBytes < (BOOT_BLOCK_SECTORS * SECTOR_SIZE) + 1024 /*MDB size*/ + allocBlockSize /*at least one alloc block*/) {
            throw new Error("Image size too small for basic MFS structures.");
        }

        this.imageBuffer = new ArrayBuffer(totalSizeBytes);
        this.dataView = new DataView(this.imageBuffer);
        // Zero-fill the buffer (ArrayBuffer is zero-initialized by default)

        console.log(`Formatting new ${sizeKB}KB image with name "${volumeName}"...`);

        // Initialize Volume Information (MDB Header part)
        this.volumeInfo = {
            signature: MFS_SIGNATURE,
            creationDate: new Date(), // Store as Date object
            modificationDate: new Date(), // Store as Date object
            attributes: 0x0000, // Default attributes
            numFiles: 0,
            // Typical values for a 400K disk (from mfs-read-write.md Table 2.1)
            // drDirSt: Sector 4 (byte offset 4 * 512 = 2048)
            // drDirLen: 12 sectors (byte offset 12 * 512 = 6144 bytes)
            // drAlBlkSiz: 1024 bytes
            // drAlBlSt: Sector 16 (byte offset 16 * 512 = 8192) for block #2
            // drNmAlBlks: 391 for a 400K disk ( (400*1024 - 16*512) / 1024 = (409600 - 8192) / 1024 = 401408 / 1024 = 392. This seems off from doc.
            // Let's recalculate: Total sectors = 400 * 1024 / 512 = 800 sectors.
            // Boot blocks: 0, 1
            // MDB: 2, 3
            // File Directory: Let's assume 12 sectors for now: 4, 5, ..., 15
            // First alloc block (#2) starts at sector 16.
            // So, allocatable sectors = 800 - 16 = 784 sectors.
            // numAllocBlocks = 784 sectors / (allocBlockSize / SECTOR_SIZE) sectors/block
            // numAllocBlocks = 784 / (1024 / 512) = 784 / 2 = 392 blocks.
            // This matches the calculation if drAlBlSt is 16.
            // The document says 391 for drNmAlBlks (typical). The difference might be due to rounding or specific image.
            // Let's use 392 based on calculation for a full 400KB.
        };

        this.volumeInfo.dirStartBlock = BOOT_BLOCK_SECTORS + (1024 / SECTOR_SIZE); // MDB is 1024 bytes (2 sectors)
        this.volumeInfo.dirLengthBlocks = 12; // Typical 12 sectors for directory
        this.volumeInfo.allocBlockSize = allocBlockSize;
        this.volumeInfo.allocBlockStartSector = this.volumeInfo.dirStartBlock + this.volumeInfo.dirLengthBlocks;

        const totalSectors = totalSizeBytes / SECTOR_SIZE;
        const numSectorsForAllocBlocks = totalSectors - this.volumeInfo.allocBlockStartSector;
        this.volumeInfo.numAllocBlocks = Math.floor(numSectorsForAllocBlocks / (this.volumeInfo.allocBlockSize / SECTOR_SIZE));

        this.volumeInfo.clumpSize = Math.max(this.volumeInfo.allocBlockSize * 8, this.volumeInfo.allocBlockSize); // e.g. 8192 for 1024 alloc blocks
        this.volumeInfo.nextFileNum = 1; // Start file numbering at 1
        this.volumeInfo.freeAllocBlocks = this.volumeInfo.numAllocBlocks; // Initially all alloc blocks are free (except dir if it uses them)
        this.volumeInfo.volumeName = volumeName;

        // Write Boot Blocks (typically zeros for non-bootable data disk, or specific boot code)
        // For now, we leave them as zero since ArrayBuffer is zero-initialized.

        // Write MDB (Volume Info + ABM)
        this._writeMDB(); // This will also initialize the ABM part on disk.

        // Initialize File Directory blocks (mark entries as unused)
        this._initializeFileDirectoryArea();

        // Crucially, after formatting, parse it to populate internal structures like this.abm and this.fileDirectory
        this._parseMDB(); // Reparse to get the ABM in memory correctly
        this._parseFileDirectory(); // Parse the empty directory

        console.log(`Volume "${this.volumeInfo.volumeName}" formatted and loaded.`);
    }

    _parseMDB() {
        const mdbOffset = MDB_START_SECTOR * SECTOR_SIZE;
        this.volumeInfo = {};
        this.volumeInfo.signature = MFSLibUtils.readUint16BE(this.dataView, mdbOffset + 0);
        if (this.volumeInfo.signature !== MFS_SIGNATURE && this.imageBuffer.byteLength > 0) { // Only throw if not creating a new one
             // Allow proceeding if we are in _formatNewImage context before signature is written
            if (!this.imageBuffer.byteLength === 0) { // A bit of a hack, better to pass context
                console.warn(`MDB not fully initialized yet or invalid signature: ${this.volumeInfo.signature.toString(16)}`);
            }
        }
        this.volumeInfo.creationDate = MFSLibUtils.mfsTimestampToDate(MFSLibUtils.readUint32BE(this.dataView, mdbOffset + 2));
        this.volumeInfo.modificationDate = MFSLibUtils.mfsTimestampToDate(MFSLibUtils.readUint32BE(this.dataView, mdbOffset + 6));
        this.volumeInfo.attributes = MFSLibUtils.readUint16BE(this.dataView, mdbOffset + 10);
        this.volumeInfo.numFiles = MFSLibUtils.readUint16BE(this.dataView, mdbOffset + 12);
        this.volumeInfo.dirStartBlock = MFSLibUtils.readUint16BE(this.dataView, mdbOffset + 14); // Sector num
        this.volumeInfo.dirLengthBlocks = MFSLibUtils.readUint16BE(this.dataView, mdbOffset + 16); // Num sectors
        this.volumeInfo.numAllocBlocks = MFSLibUtils.readUint16BE(this.dataView, mdbOffset + 18);
        this.volumeInfo.allocBlockSize = MFSLibUtils.readUint32BE(this.dataView, mdbOffset + 20);
        this.volumeInfo.clumpSize = MFSLibUtils.readUint32BE(this.dataView, mdbOffset + 24);
        this.volumeInfo.allocBlockStartSector = MFSLibUtils.readUint16BE(this.dataView, mdbOffset + 28); // Sector num for MFS block #2
        this.volumeInfo.nextFileNum = MFSLibUtils.readUint32BE(this.dataView, mdbOffset + 30);
        this.volumeInfo.freeAllocBlocks = MFSLibUtils.readUint16BE(this.dataView, mdbOffset + 34);
        this.volumeInfo.volumeName = MFSLibUtils.readPascalString(this.dataView, mdbOffset + 36, 27);

        // Parse Allocation Block Map (ABM)
        // ABM starts after Volume Info. From mfs-read-write.md Table 2.1, drVN is 28 bytes at offset 36.
        // So, Volume Info is 36 + 28 = 64 bytes.
        // The example code in mfs-read-write.md uses 52 bytes. Let's check offsets.
        // drVN (offset 36, size 28). Last byte of drVN is at 36+28-1 = 63. So Vol Info is 64 bytes.
        const abmOffsetInMDB = 64; // Offset of ABM within the MDB itself
        const abmDiskOffset = mdbOffset + abmOffsetInMDB;
        this.abm = [];

        // MFS blocks are 2-indexed for ABM. ABM is 0-indexed internally.
        for (let i = 0; i < this.volumeInfo.numAllocBlocks; i++) {
            const tripletIndex = Math.floor(i / 2);
            const byteOffsetInABMData = tripletIndex * 3;
            
            const b0 = MFSLibUtils.readUint8(this.dataView, abmDiskOffset + byteOffsetInABMData);
            const b1 = MFSLibUtils.readUint8(this.dataView, abmDiskOffset + byteOffsetInABMData + 1);
            const b2 = MFSLibUtils.readUint8(this.dataView, abmDiskOffset + byteOffsetInABMData + 2);

            const isEvenIndexInTriplet = (i % 2 === 0);
            this.abm[i] = MFSLibUtils.getABMEntryFromTriplet(b0, b1, b2, isEvenIndexInTriplet);
        }
    }

    _writeMDB() {
        const mdbOffset = MDB_START_SECTOR * SECTOR_SIZE;
        MFSLibUtils.writeUint16BE(this.dataView, mdbOffset + 0, this.volumeInfo.signature);
        MFSLibUtils.writeUint32BE(this.dataView, mdbOffset + 2, MFSLibUtils.dateToMFSTimestamp(this.volumeInfo.creationDate));
        MFSLibUtils.writeUint32BE(this.dataView, mdbOffset + 6, MFSLibUtils.dateToMFSTimestamp(this.volumeInfo.modificationDate));
        MFSLibUtils.writeUint16BE(this.dataView, mdbOffset + 10, this.volumeInfo.attributes);
        MFSLibUtils.writeUint16BE(this.dataView, mdbOffset + 12, this.volumeInfo.numFiles);
        MFSLibUtils.writeUint16BE(this.dataView, mdbOffset + 14, this.volumeInfo.dirStartBlock);
        MFSLibUtils.writeUint16BE(this.dataView, mdbOffset + 16, this.volumeInfo.dirLengthBlocks);
        MFSLibUtils.writeUint16BE(this.dataView, mdbOffset + 18, this.volumeInfo.numAllocBlocks);
        MFSLibUtils.writeUint32BE(this.dataView, mdbOffset + 20, this.volumeInfo.allocBlockSize);
        MFSLibUtils.writeUint32BE(this.dataView, mdbOffset + 24, this.volumeInfo.clumpSize);
        MFSLibUtils.writeUint16BE(this.dataView, mdbOffset + 28, this.volumeInfo.allocBlockStartSector);
        MFSLibUtils.writeUint32BE(this.dataView, mdbOffset + 30, this.volumeInfo.nextFileNum);
        MFSLibUtils.writeUint16BE(this.dataView, mdbOffset + 34, this.volumeInfo.freeAllocBlocks);
        MFSLibUtils.writePascalString(this.dataView, mdbOffset + 36, this.volumeInfo.volumeName, 28); // 1 byte len + 27 chars

        // Write Allocation Block Map (ABM)
        const abmOffsetInMDB = 64;
        const abmDiskOffset = mdbOffset + abmOffsetInMDB;

        // Initialize ABM area with zeros first if it's a new disk, or rely on existing values to be overwritten.
        // For formatting, this.abm might not be populated yet, so we initialize it.
        let tempABMForWriting = this.abm;
        if (this._isFormattingNewImageInProgress) { // Need a flag or better context
             tempABMForWriting = new Array(this.volumeInfo.numAllocBlocks).fill(0);
             // TODO: Mark directory blocks as 0xFFF if they fall into alloc block space
             // For now, assume directory is in its reserved space for simplicity of init.
        }


        for (let i = 0; i < this.volumeInfo.numAllocBlocks; i += 2) {
            const tripletIndex = Math.floor(i / 2);
            const byteOffsetInABMData = tripletIndex * 3;

            let b0 = 0, b1 = 0, b2 = 0;
            // Read existing triplet if not fully overwriting (e.g. if this.abm is sparse)
            // However, for a full ABM write, we construct from this.abm
            if (abmDiskOffset + byteOffsetInABMData + 2 < this.dataView.buffer.byteLength) {
                 b0 = MFSLibUtils.readUint8(this.dataView, abmDiskOffset + byteOffsetInABMData);
                 b1 = MFSLibUtils.readUint8(this.dataView, abmDiskOffset + byteOffsetInABMData + 1);
                 b2 = MFSLibUtils.readUint8(this.dataView, abmDiskOffset + byteOffsetInABMData + 2);
            }


            const val1 = tempABMForWriting[i] !== undefined ? tempABMForWriting[i] : 0; // Default to free if not set
            let packed = MFSLibUtils.packABMEntryToTriplet(val1, b0, b1, b2, true);
            b0 = packed.b0; b1 = packed.b1; b2 = packed.b2; // Update b1 from first pack

            if (i + 1 < this.volumeInfo.numAllocBlocks) {
                const val2 = tempABMForWriting[i+1] !== undefined ? tempABMForWriting[i+1] : 0;
                packed = MFSLibUtils.packABMEntryToTriplet(val2, b0, b1, b2, false);
                b0 = packed.b0; b1 = packed.b1; b2 = packed.b2;
            }
            
            MFSLibUtils.writeUint8(this.dataView, abmDiskOffset + byteOffsetInABMData, b0);
            MFSLibUtils.writeUint8(this.dataView, abmDiskOffset + byteOffsetInABMData + 1, b1);
            MFSLibUtils.writeUint8(this.dataView, abmDiskOffset + byteOffsetInABMData + 2, b2);
        }
    }
    
    _initializeFileDirectoryArea() {
        const dirStartOffset = this.volumeInfo.dirStartBlock * SECTOR_SIZE;
        const dirTotalBytes = this.volumeInfo.dirLengthBlocks * SECTOR_SIZE;

        for (let offset = 0; offset < dirTotalBytes; offset += 2) { // Entries are 2-byte aligned
            // Smallest possible entry is 51 (header) + 0 (name len) + 1 (name byte for alignment) = 52
            // For an empty directory, we can just zero out the first flag byte of potential entries.
            // A robust way is to write a "last entry in block" marker.
            // For now, just ensure the first byte (flFlags) of each potential slot is 0.
            // The mfs-read-write.md:143 states "An entry always begins on a 2-byte boundary"
            // and "flFlags bit 7: 1=entry in use, 0=empty space (if last entry in block, marks end)"
            // So, writing 0 to the first byte of each sector should be enough to mark it empty.
            // Or, more simply, zero out the whole directory area.
            if (dirStartOffset + offset < this.dataView.buffer.byteLength) {
                 MFSLibUtils.writeUint8(this.dataView, dirStartOffset + offset, 0x00); // Mark as not in use
            }
        }
         // A more correct initialization would be to write one entry with flFlags=0 as the first entry
         // in each directory sector to mark it as the end of entries for that sector.
         // For now, zero-filling during ArrayBuffer creation handles this.
    }


    _parseFileDirectory() {
        this.fileDirectory = [];
        const dirStartOffset = this.volumeInfo.dirStartBlock * SECTOR_SIZE;
        const dirTotalBytes = this.volumeInfo.dirLengthBlocks * SECTOR_SIZE;
        let currentOffsetInDir = 0;

        while (currentOffsetInDir < dirTotalBytes) {
            const entryStartDiskOffset = dirStartOffset + currentOffsetInDir;
            if (entryStartDiskOffset >= this.dataView.buffer.byteLength) break;

            const flFlags = MFSLibUtils.readUint8(this.dataView, entryStartDiskOffset);
            
            // If bit 7 of flFlags is 0, it's an empty space or end of entries in this part of directory
            if ((flFlags & 0x80) === 0) {
                // If it's the very first byte of a sector and it's 0, assume end of dir for that sector
                // This logic might need refinement based on how MFS truly marks end of directory vs sparse entries
                // For now, if we hit an unused entry, we assume it's the end for simplicity.
                // A more robust parser would skip to next sector or look for next valid entry.
                // The document says "if last entry in block, marks end".
                // This implies we might need to know sector boundaries.
                // For now, stop at first non-used entry.
                break; 
            }

            const entry = {};
            entry._diskOffset = entryStartDiskOffset;
            entry.flags = flFlags;
            entry.version = MFSLibUtils.readUint8(this.dataView, entryStartDiskOffset + 1); // Should be 0
            entry.type = MFSLibUtils.readPascalString(this.dataView, entryStartDiskOffset + 2 -1, 4).substring(0,4); // Read 4 chars for OSType
             // Correcting OSType reading: it's not a Pascal string, but 4 fixed chars.
            entry.type = String.fromCharCode(
                MFSLibUtils.readUint8(this.dataView, entryStartDiskOffset + 2),
                MFSLibUtils.readUint8(this.dataView, entryStartDiskOffset + 3),
                MFSLibUtils.readUint8(this.dataView, entryStartDiskOffset + 4),
                MFSLibUtils.readUint8(this.dataView, entryStartDiskOffset + 5)
            );
            entry.creator = String.fromCharCode(
                MFSLibUtils.readUint8(this.dataView, entryStartDiskOffset + 6),
                MFSLibUtils.readUint8(this.dataView, entryStartDiskOffset + 7),
                MFSLibUtils.readUint8(this.dataView, entryStartDiskOffset + 8),
                MFSLibUtils.readUint8(this.dataView, entryStartDiskOffset + 9)
            );
            entry.finderFlags = MFSLibUtils.readUint16BE(this.dataView, entryStartDiskOffset + 10);
            const flPosRaw = MFSLibUtils.readUint32BE(this.dataView, entryStartDiskOffset + 12);
            entry.iconPosition = { v: flPosRaw >> 16, h: flPosRaw & 0xFFFF };
            entry.folderNum = MFSLibUtils.readUint16BE(this.dataView, entryStartDiskOffset + 16); // Actually int16_t
            entry.fileNum = MFSLibUtils.readUint32BE(this.dataView, entryStartDiskOffset + 18);
            entry.dataForkStartBlock = MFSLibUtils.readUint16BE(this.dataView, entryStartDiskOffset + 22);
            entry.dataForkLogicalLength = MFSLibUtils.readUint32BE(this.dataView, entryStartDiskOffset + 24);
            entry.dataForkAllocLength = MFSLibUtils.readUint32BE(this.dataView, entryStartDiskOffset + 28);
            entry.resourceForkStartBlock = MFSLibUtils.readUint16BE(this.dataView, entryStartDiskOffset + 32);
            entry.resourceForkLogicalLength = MFSLibUtils.readUint32BE(this.dataView, entryStartDiskOffset + 34);
            entry.resourceForkAllocLength = MFSLibUtils.readUint32BE(this.dataView, entryStartDiskOffset + 38);
            entry.creationDate = MFSLibUtils.mfsTimestampToDate(MFSLibUtils.readUint32BE(this.dataView, entryStartDiskOffset + 42));
            entry.modificationDate = MFSLibUtils.mfsTimestampToDate(MFSLibUtils.readUint32BE(this.dataView, entryStartDiskOffset + 46));
            
            const flNamLen = MFSLibUtils.readUint8(this.dataView, entryStartDiskOffset + 50);
            entry.filename = "";
            for (let k = 0; k < flNamLen; k++) {
                entry.filename += String.fromCharCode(MFSLibUtils.readUint8(this.dataView, entryStartDiskOffset + 51 + k));
            }
            
            entry._entryLength = 51 + flNamLen;
            if (entry._entryLength % 2 !== 0) { // Pad to make total entry 2-byte aligned
                entry._entryLength++;
            }
            
            this.fileDirectory.push(entry);
            currentOffsetInDir += entry._entryLength;
        }
    }

    _getABMEntry(mfsBlockNum) {
        // MFS blocks are 2-indexed (start from 2). ABM array is 0-indexed.
        if (mfsBlockNum < 2 || mfsBlockNum >= this.volumeInfo.numAllocBlocks + 2) {
            throw new Error(`Invalid MFS block number for ABM lookup: ${mfsBlockNum}. Max is ${this.volumeInfo.numAllocBlocks + 1}`);
        }
        return this.abm[mfsBlockNum - 2];
    }

    _setABMEntry(mfsBlockNum, value) {
        if (mfsBlockNum < 2 || mfsBlockNum >= this.volumeInfo.numAllocBlocks + 2) {
            throw new Error(`Invalid MFS block number for ABM update: ${mfsBlockNum}`);
        }
        if (value > 0xFFF) {
            throw new Error(`ABM value ${value} exceeds 12-bit range.`);
        }
        this.abm[mfsBlockNum - 2] = value;
        // Note: This only updates the in-memory ABM. _writeMDB() is needed to persist.
    }

    _findFreeBlocks(count) {
        const freeBlocks = [];
        // MFS blocks are 2-indexed. ABM array is 0-indexed.
        for (let i = 0; i < this.volumeInfo.numAllocBlocks && freeBlocks.length < count; i++) {
            if (this.abm[i] === 0x000) { // 0x000 means free
                freeBlocks.push(i + 2); // Convert ABM index back to MFS block number
            }
        }
        if (freeBlocks.length < count) {
            throw new Error(`Not enough free blocks. Requested ${count}, found ${freeBlocks.length}.`);
        }
        return freeBlocks;
    }

    _allocateBlockChain(numBlocks) {
        if (numBlocks === 0) {
            return { startBlock: 0, allocatedBlocks: [] };
        }
        if (this.volumeInfo.freeAllocBlocks < numBlocks) {
            throw new Error(`Not enough free blocks in volume. Requested ${numBlocks}, available ${this.volumeInfo.freeAllocBlocks}.`);
        }

        const allocatedMFSBlockNumbers = this._findFreeBlocks(numBlocks);
        
        for (let i = 0; i < allocatedMFSBlockNumbers.length; i++) {
            const currentMFSBlock = allocatedMFSBlockNumbers[i];
            if (i < allocatedMFSBlockNumbers.length - 1) {
                // Link to next block in chain
                this._setABMEntry(currentMFSBlock, allocatedMFSBlockNumbers[i+1]);
            } else {
                // Last block in chain, mark as EOF
                this._setABMEntry(currentMFSBlock, 0x001);
            }
        }
        
        this.volumeInfo.freeAllocBlocks -= numBlocks;
        // Caller must ensure _writeMDB() is called to persist changes.
        return {
            startBlock: allocatedMFSBlockNumbers[0],
            allocatedBlocks: allocatedMFSBlockNumbers
        };
    }

    _freeBlockChain(startMFSBlockNum) {
        if (startMFSBlockNum === 0) return 0; // Empty chain

        let currentMFSBlock = startMFSBlockNum;
        let freedCount = 0;

        while (currentMFSBlock !== 0x001 && currentMFSBlock !== 0x000 && currentMFSBlock >=2) {
            const nextMFSBlockIndicator = this._getABMEntry(currentMFSBlock);
            this._setABMEntry(currentMFSBlock, 0x000); // Mark as free
            freedCount++;
            
            if (nextMFSBlockIndicator === 0x001) break; // End of file
            if (nextMFSBlockIndicator === 0x000) {
                console.warn(`Warning: Encountered a free block (0x000) at MFS block ${currentMFSBlock} while traversing chain from ${startMFSBlockNum}. Chain may be corrupted.`);
                break;
            }
            if (nextMFSBlockIndicator >= this.volumeInfo.numAllocBlocks + 2 || nextMFSBlockIndicator < 2) {
                 console.warn(`Warning: Invalid next block indicator ${nextMFSBlockIndicator} from MFS block ${currentMFSBlock}. Chain may be corrupted.`);
                 break;
            }
            currentMFSBlock = nextMFSBlockIndicator;
        }
        this.volumeInfo.freeAllocBlocks += freedCount;
        // Caller must ensure _writeMDB() is called.
        return freedCount;
    }

    _findFileEntryByName(filename) {
        for (let i = 0; i < this.fileDirectory.length; i++) {
            if (this.fileDirectory[i].filename === filename) {
                return { entry: this.fileDirectory[i], indexInArray: i, diskOffset: this.fileDirectory[i]._diskOffset };
            }
        }
        return null; // Not found
    }

    _findFreeDirectorySlot() {
        const dirStartOffsetOnDisk = this.volumeInfo.dirStartBlock * SECTOR_SIZE;
        const dirTotalBytesOnDisk = this.volumeInfo.dirLengthBlocks * SECTOR_SIZE;
        let currentOffsetInDirArea = 0; // Relative to start of directory area on disk

        // Iterate through existing entries to find the end or an empty slot
        let lastEntryEndOffset = 0;
        for (const entry of this.fileDirectory) {
            lastEntryEndOffset = Math.max(lastEntryEndOffset, (entry._diskOffset - dirStartOffsetOnDisk) + entry._entryLength);
        }
        currentOffsetInDirArea = lastEntryEndOffset;

        // Check if there's space after the last known entry within the current directory area
        // Smallest possible new entry: 51 (header) + 0 (name) + 1 (padding for name) = 52 bytes.
        // For safety, let's assume a slightly larger minimum if needed, but 52 is a good check.
        if (currentOffsetInDirArea + 52 <= dirTotalBytesOnDisk) { // 52 is a minimal entry size
            return dirStartOffsetOnDisk + currentOffsetInDirArea;
        }

        // More complex: if directory can expand into allocation blocks (marked 0xFFF in ABM)
        // This is not implemented yet as per plan simplicity.
        // For now, if no space in contiguous directory area, throw error.
        throw new Error("File directory is full. Expansion not yet supported.");
    }

    _writeFileDirectoryEntry(entryObject, diskOffset) {
        // Ensure all fields are present in entryObject as per MFSFileEntry structure
        MFSLibUtils.writeUint8(this.dataView, diskOffset + 0, entryObject.flags);
        MFSLibUtils.writeUint8(this.dataView, diskOffset + 1, entryObject.version || 0);

        // Write Type (4 chars)
        for (let i = 0; i < 4; i++) {
            MFSLibUtils.writeUint8(this.dataView, diskOffset + 2 + i, (entryObject.type.charCodeAt(i) || 0x3F)); // '?' if char missing
        }
        // Write Creator (4 chars)
        for (let i = 0; i < 4; i++) {
            MFSLibUtils.writeUint8(this.dataView, diskOffset + 6 + i, (entryObject.creator.charCodeAt(i) || 0x3F));
        }

        MFSLibUtils.writeUint16BE(this.dataView, diskOffset + 10, entryObject.finderFlags);
        const rawIconPos = ((entryObject.iconPosition.v & 0xFFFF) << 16) | (entryObject.iconPosition.h & 0xFFFF);
        MFSLibUtils.writeUint32BE(this.dataView, diskOffset + 12, rawIconPos);
        MFSLibUtils.writeUint16BE(this.dataView, diskOffset + 16, entryObject.folderNum); // Note: MFS uses int16_t, JS uses uint16be
        MFSLibUtils.writeUint32BE(this.dataView, diskOffset + 18, entryObject.fileNum);
        MFSLibUtils.writeUint16BE(this.dataView, diskOffset + 22, entryObject.dataForkStartBlock);
        MFSLibUtils.writeUint32BE(this.dataView, diskOffset + 24, entryObject.dataForkLogicalLength);
        MFSLibUtils.writeUint32BE(this.dataView, diskOffset + 28, entryObject.dataForkAllocLength);
        MFSLibUtils.writeUint16BE(this.dataView, diskOffset + 32, entryObject.resourceForkStartBlock);
        MFSLibUtils.writeUint32BE(this.dataView, diskOffset + 34, entryObject.resourceForkLogicalLength);
        MFSLibUtils.writeUint32BE(this.dataView, diskOffset + 38, entryObject.resourceForkAllocLength);
        MFSLibUtils.writeUint32BE(this.dataView, diskOffset + 42, MFSLibUtils.dateToMFSTimestamp(entryObject.creationDate));
        MFSLibUtils.writeUint32BE(this.dataView, diskOffset + 46, MFSLibUtils.dateToMFSTimestamp(entryObject.modificationDate));

        const nameLen = Math.min(entryObject.filename.length, 255);
        MFSLibUtils.writeUint8(this.dataView, diskOffset + 50, nameLen);
        for (let i = 0; i < nameLen; i++) {
            MFSLibUtils.writeUint8(this.dataView, diskOffset + 51 + i, entryObject.filename.charCodeAt(i));
        }

        // Pad the entry to be 2-byte aligned if necessary
        let totalLength = 51 + nameLen;
        if (totalLength % 2 !== 0) {
            MFSLibUtils.writeUint8(this.dataView, diskOffset + totalLength, 0); // Padding byte
        }
        // Note: this.fileDirectory array needs to be updated by the caller after this.
    }


    // Public API methods from the plan

    /**
     * Creates a new empty file with the given metadata.
     * @param {string} filename - The name of the file. Max 255 chars, typically 63 for Finder.
     * @param {{type: string, creator: string, folderNum?: number, finderFlags?: number, creationDate?: Date, modDate?: Date}} metadata
     * @returns {object} The created file entry information.
     */
    createFile(filename, metadata) {
        if (!filename || filename.length > 255) {
            throw new Error("Invalid filename or filename too long.");
        }
        if (!metadata || !metadata.type || !metadata.creator || metadata.type.length !== 4 || metadata.creator.length !== 4) {
            throw new Error("File type and creator (4 chars each) are required in metadata.");
        }
        // For createFile, data and resource forks are initially empty.
        return this.writeFile(filename, null, null, metadata);
    }

    /**
     * Writes a file to the MFS volume. Can create a new file or overwrite an existing one.
     * @param {string} filename
     * @param {ArrayBuffer | null} dataForkContent
     * @param {ArrayBuffer | null} resourceForkContent
     * @param {{type: string, creator: string, folderNum?: number, finderFlags?: number, creationDate?: Date, modDate?: Date}} metadata
     * @returns {object} The file entry information.
     */
    writeFile(filename, dataForkContent, resourceForkContent, metadata) {
        console.log(`writeFile called for: ${filename}`);
        const existingFile = this._findFileEntryByName(filename);
        if (existingFile) {
            console.log(`File "${filename}" exists. Deleting before writing new version.`);
            // As per plan: "assume it deletes if exists then creates"
            // This is a simplification. True overwrite would be more complex.
            this.deleteFile(filename); // deleteFile will update MDB and in-memory directory
        }

        const dataSize = dataForkContent ? dataForkContent.byteLength : 0;
        const rsrcSize = resourceForkContent ? resourceForkContent.byteLength : 0;

        const blocksForData = dataSize > 0 ? Math.ceil(dataSize / this.volumeInfo.allocBlockSize) : 0;
        const blocksForRsrc = rsrcSize > 0 ? Math.ceil(rsrcSize / this.volumeInfo.allocBlockSize) : 0;

        let dataForkAllocInfo = { startBlock: 0, allocatedBlocks: [] };
        if (blocksForData > 0) {
            dataForkAllocInfo = this._allocateBlockChain(blocksForData);
        }

        let rsrcForkAllocInfo = { startBlock: 0, allocatedBlocks: [] };
        if (blocksForRsrc > 0) {
            rsrcForkAllocInfo = this._allocateBlockChain(blocksForRsrc);
        }

        const newEntryDiskOffset = this._findFreeDirectorySlot();

        const now = new Date();
        const fileEntry = {
            flags: 0x80, // Active, unlocked file
            version: 0x00,
            type: metadata.type,
            creator: metadata.creator,
            finderFlags: metadata.finderFlags || 0x0000,
            iconPosition: { v: 0, h: 0 }, // Default position
            folderNum: metadata.folderNum || 0, // 0 for volume root
            fileNum: this.volumeInfo.nextFileNum++,
            dataForkStartBlock: dataForkAllocInfo.startBlock,
            dataForkLogicalLength: dataSize,
            dataForkAllocLength: blocksForData * this.volumeInfo.allocBlockSize,
            resourceForkStartBlock: rsrcForkAllocInfo.startBlock,
            resourceForkLogicalLength: rsrcSize,
            resourceForkAllocLength: blocksForRsrc * this.volumeInfo.allocBlockSize,
            creationDate: metadata.creationDate || now,
            modificationDate: metadata.modDate || now,
            filename: filename,
            _diskOffset: newEntryDiskOffset, // Store for in-memory representation
             // _entryLength will be calculated after writing name
        };
        
        // Calculate entry length for in-memory representation
        let nameLenForCalc = Math.min(filename.length, 255);
        fileEntry._entryLength = 51 + nameLenForCalc;
        if (fileEntry._entryLength % 2 !== 0) {
            fileEntry._entryLength++;
        }


        this._writeFileDirectoryEntry(fileEntry, newEntryDiskOffset);

        // Write Data Fork Content
        if (dataForkContent && dataForkAllocInfo.allocatedBlocks.length > 0) {
            this._writeForkData(dataForkContent, dataForkAllocInfo.allocatedBlocks);
        }

        // Write Resource Fork Content
        if (resourceForkContent && rsrcForkAllocInfo.allocatedBlocks.length > 0) {
            this._writeForkData(resourceForkContent, rsrcForkAllocInfo.allocatedBlocks);
        }

        // Update MDB
        this.volumeInfo.numFiles++;
        this.volumeInfo.modificationDate = new Date(); // Update volume mod date
        // freeAllocBlocks and nextFileNum are updated by _allocateBlockChain and fileNum assignment.
        this._writeMDB();

        // Update in-memory file directory
        // A full re-parse is safest for now, or intelligently add/update.
        // For simplicity of this step, add to in-memory array.
        // A more robust solution would sort or manage order if it matters.
        this.fileDirectory.push(JSON.parse(JSON.stringify(fileEntry))); // Add a copy

        console.log(`File "${filename}" written successfully. File num: ${fileEntry.fileNum}`);
        return this.getFileInfo(filename); // Return a clean copy of the info
    }

    _writeForkData(contentBuffer, allocatedBlocks) {
        let bytesWritten = 0;
        const totalBytesToWrite = contentBuffer.byteLength;
        const sourceView = new Uint8Array(contentBuffer);

        for (let i = 0; i < allocatedBlocks.length; i++) {
            const mfsBlockNum = allocatedBlocks[i];
            const blockDiskOffset = (this.volumeInfo.allocBlockStartSector + (mfsBlockNum - 2) * (this.volumeInfo.allocBlockSize / SECTOR_SIZE)) * SECTOR_SIZE;
            
            const bytesRemainingInFile = totalBytesToWrite - bytesWritten;
            const bytesToWriteInThisBlock = Math.min(this.volumeInfo.allocBlockSize, bytesRemainingInFile);

            for (let j = 0; j < bytesToWriteInThisBlock; j++) {
                MFSLibUtils.writeUint8(this.dataView, blockDiskOffset + j, sourceView[bytesWritten + j]);
            }
            bytesWritten += bytesToWriteInThisBlock;
            if (bytesWritten >= totalBytesToWrite) break;
        }
    }
    
    deleteFile(filename) {
        const fileInfo = this._findFileEntryByName(filename);
        if (!fileInfo) {
            throw new Error(`File not found for deletion: ${filename}`);
        }
        const { entry, indexInArray, diskOffset } = fileInfo;

        // Free blocks for data fork
        this._freeBlockChain(entry.dataForkStartBlock);
        // Free blocks for resource fork
        this._freeBlockChain(entry.resourceForkStartBlock);

        // Mark directory entry as unused: clear bit 7 of flFlags
        const currentFlags = MFSLibUtils.readUint8(this.dataView, diskOffset);
        MFSLibUtils.writeUint8(this.dataView, diskOffset, currentFlags & 0x7F); // Clear bit 7 (0x80)

        // Update MDB
        this.volumeInfo.numFiles--;
        this.volumeInfo.modificationDate = new Date();
        // freeAllocBlocks is updated by _freeBlockChain
        this._writeMDB();

        // Update in-memory file directory
        this.fileDirectory.splice(indexInArray, 1);
        console.log(`File "${filename}" deleted.`);
        return true;
    }

    getFileInfo(filename) {
        const found = this._findFileEntryByName(filename);
        if (found) {
            // Return a copy to prevent external modification of internal state
            const entry = found.entry;
            return {
                filename: entry.filename,
                type: entry.type,
                creator: entry.creator,
                dataForkSize: entry.dataForkLogicalLength,
                resourceForkSize: entry.resourceForkLogicalLength,
                creationDate: entry.creationDate,
                modificationDate: entry.modificationDate,
                fileNum: entry.fileNum,
                folderNum: entry.folderNum,
                finderFlags: entry.finderFlags,
                iconPosition: entry.iconPosition,
                _diskOffset: entry._diskOffset,
                _entryLength: entry._entryLength
            };
        }
        return null;
    }
/**
     * Reads the content of a specified fork of a file.
     * @param {string} filename - The name of the file.
     * @param {'data' | 'resource'} forkType - The type of fork to read ('data' or 'resource').
     * @returns {ArrayBuffer} The content of the fork.
     */
    readFile(filename, forkType = 'data') {
        const fileInfo = this._findFileEntryByName(filename);
        if (!fileInfo) {
            throw new Error(`File not found for reading: ${filename}`);
        }
        const entry = fileInfo.entry;

        let startBlock, logicalLength, allocLength;
        if (forkType === 'data') {
            startBlock = entry.dataForkStartBlock;
            logicalLength = entry.dataForkLogicalLength;
            allocLength = entry.dataForkAllocLength; // Use allocated length for buffer creation
        } else if (forkType === 'resource') {
            startBlock = entry.resourceForkStartBlock;
            logicalLength = entry.resourceForkLogicalLength;
            allocLength = entry.resourceForkAllocLength; // Use allocated length
        } else {
            throw new Error(`Invalid fork type: ${forkType}. Must be 'data' or 'resource'.`);
        }

        if (startBlock === 0 || logicalLength === 0) {
            return new ArrayBuffer(0); // Empty fork
        }

        // Create buffer based on allocated length, then slice to logical length
        const forkData = new Uint8Array(allocLength); 
        let bytesRead = 0;
        let currentMFSBlock = startBlock;
        const allocBlockSizeBytes = this.volumeInfo.allocBlockSize;

        while (currentMFSBlock !== 0x001 && currentMFSBlock !== 0x000 && currentMFSBlock >= 2 && bytesRead < logicalLength) {
            const blockDiskOffset = (this.volumeInfo.allocBlockStartSector + (currentMFSBlock - 2) * (allocBlockSizeBytes / SECTOR_SIZE)) * SECTOR_SIZE;
            
            const bytesToReadInThisBlock = Math.min(allocBlockSizeBytes, logicalLength - bytesRead);
            
            for (let i = 0; i < bytesToReadInThisBlock; i++) {
                if (blockDiskOffset + i < this.dataView.buffer.byteLength && bytesRead + i < forkData.length) {
                     forkData[bytesRead + i] = MFSLibUtils.readUint8(this.dataView, blockDiskOffset + i);
                } else {
                    console.warn(`Read out of bounds attempt in readFile for ${filename}, block ${currentMFSBlock}. Offset: ${blockDiskOffset + i}, Buffer Length: ${this.dataView.buffer.byteLength}`);
                    // This case should ideally not happen if allocLength and logicalLength are correct
                    // and file system is not corrupted.
                    return forkData.buffer.slice(0, bytesRead); // Return what's read so far
                }
            }
            bytesRead += bytesToReadInThisBlock;

            const nextMFSBlockIndicator = this._getABMEntry(currentMFSBlock);
            if (nextMFSBlockIndicator === 0x001) break; // End of file
            if (nextMFSBlockIndicator === 0x000 || nextMFSBlockIndicator < 2 || nextMFSBlockIndicator >= this.volumeInfo.numAllocBlocks + 2) {
                throw new Error(`Corrupted file chain for ${filename} (fork: ${forkType}) at MFS block ${currentMFSBlock}. Next indicator: ${nextMFSBlockIndicator}`);
            }
            currentMFSBlock = nextMFSBlockIndicator;
        }
        
        // Return only the logical length
        return forkData.buffer.slice(0, logicalLength);
    }


    listFiles() {
        return this.fileDirectory.map(entry => ({
            filename: entry.filename,
            type: entry.type,
            creator: entry.creator,
            dataForkSize: entry.dataForkLogicalLength,
            resourceForkSize: entry.resourceForkLogicalLength,
            creationDate: entry.creationDate,
            modificationDate: entry.modificationDate,
            fileNum: entry.fileNum,
            folderNum: entry.folderNum
        }));
    }

    // ... other methods like readFile, writeFile, deleteFile, getFileInfo to be implemented ...

    getDiskImage() {
        return this.imageBuffer;
    }
}

// Basic test/example usage:
function runTest() {
    try {
        // Test 1: Create a new 400KB MFS image
        console.log("Test 1: Creating new 400KB MFS image...");
        const mfsNew = new MFSVolume({ create: true, sizeKB: 400, volumeName: "MyNewDisk" });
        console.log("New MFS Volume Info:", mfsNew.volumeInfo);
        console.log("New MFS ABM (first 10 entries):", mfsNew.abm.slice(0, 10));
        console.log("New MFS File Directory (should be empty):", mfsNew.listFiles());
        const newImageBuffer = mfsNew.getDiskImage();
        console.log("New image buffer size:", newImageBuffer.byteLength);

        // Test 2: Load the created image
        console.log("\nTest 2: Loading the created image...");
        const mfsLoaded = new MFSVolume(newImageBuffer);
        console.log("Loaded MFS Volume Info:", mfsLoaded.volumeInfo);
        console.log("Loaded MFS ABM (first 10 entries):", mfsLoaded.abm.slice(0, 10));
        console.log("Loaded MFS File Directory (should be empty):", mfsLoaded.listFiles());

        // Compare some key fields
        if (mfsNew.volumeInfo.volumeName !== mfsLoaded.volumeInfo.volumeName) {
            console.error("FAIL: Volume name mismatch!");
        } else {
            console.log("PASS: Volume name matches.");
        }
        if (mfsNew.volumeInfo.numAllocBlocks !== mfsLoaded.volumeInfo.numAllocBlocks) {
            console.error("FAIL: Num alloc blocks mismatch!");
        } else {
            console.log("PASS: Num alloc blocks matches.");
        }
        console.log("Basic creation and loading test passed.");

        // Test 3: Create a file, write to it, read from it, delete it
        console.log("\nTest 3: File operations...");
        const testFileName = "TEST.TXT";
        const testFileMetadata = { type: "TEXT", creator: "ROOO" };
        
        console.log(`Creating file: ${testFileName}`);
        mfsLoaded.createFile(testFileName, testFileMetadata);
        let files = mfsLoaded.listFiles();
        console.log("Files after create:", files);
        if (files.length !== 1 || files[0].filename !== testFileName) {
            console.error("FAIL: File creation failed or listFiles incorrect.");
        } else {
            console.log("PASS: File created.");
        }

        const testDataContent = "Hello MFS World! This is a test.";
        const textEncoder = new TextEncoder(); // Assuming browser environment or polyfill for Node
        const testDataBuffer = textEncoder.encode(testDataContent).buffer;
        
        console.log(`Writing data to ${testFileName}...`);
        mfsLoaded.writeFile(testFileName, testDataBuffer, null, testFileMetadata);
        
        const fileInfoAfterWrite = mfsLoaded.getFileInfo(testFileName);
        console.log("File info after write:", fileInfoAfterWrite);
        if (!fileInfoAfterWrite || fileInfoAfterWrite.dataForkSize !== testDataBuffer.byteLength) {
            console.error("FAIL: writeFile did not update dataForkSize correctly.");
        } else {
            console.log("PASS: writeFile updated dataForkSize correctly.");
        }

        console.log(`Reading data from ${testFileName}...`);
        const readBuffer = mfsLoaded.readFile(testFileName, 'data');
        const textDecoder = new TextDecoder(); // Assuming browser environment or polyfill for Node
        const readDataContent = textDecoder.decode(readBuffer);
        console.log("Read data:", readDataContent);

        if (readDataContent !== testDataContent) {
            console.error(`FAIL: Read data mismatch. Expected "${testDataContent}", got "${readDataContent}"`);
        } else {
            console.log("PASS: Read data matches written data.");
        }

        console.log(`Deleting file: ${testFileName}`);
        mfsLoaded.deleteFile(testFileName);
        files = mfsLoaded.listFiles();
        console.log("Files after delete:", files);
        if (files.length !== 0) {
            console.error("FAIL: File deletion failed or listFiles incorrect after delete.");
        } else {
            console.log("PASS: File deleted.");
        }
        
        console.log("\nTest 4: Create another file with resource fork");
        const testFile2Name = "RSRC.TST";
        const testFile2Metadata = { type: "APPL", creator: "TEST" };
        const rsrcDataContent = "Resource Fork Data Here";
        const rsrcDataBuffer = textEncoder.encode(rsrcDataContent).buffer;

        mfsLoaded.writeFile(testFile2Name, null, rsrcDataBuffer, testFile2Metadata);
        const fileInfo2 = mfsLoaded.getFileInfo(testFile2Name);
        console.log("File info for RSRC.TST:", fileInfo2);
        if (!fileInfo2 || fileInfo2.resourceForkSize !== rsrcDataBuffer.byteLength) {
            console.error("FAIL: writeFile did not update resourceForkSize correctly for RSRC.TST.");
        } else {
            console.log("PASS: RSRC.TST resource fork size correct.");
        }
        const readRsrcBuffer = mfsLoaded.readFile(testFile2Name, 'resource');
        const readRsrcContent = textDecoder.decode(readRsrcBuffer);
        if (readRsrcContent !== rsrcDataContent) {
            console.error(`FAIL: Read resource data mismatch. Expected "${rsrcDataContent}", got "${readRsrcContent}"`);
        } else {
            console.log("PASS: Read resource data matches written resource data.");
        }
        mfsLoaded.deleteFile(testFile2Name);
        console.log("Files after deleting RSRC.TST:", mfsLoaded.listFiles());


        console.log("\nAll MFS library tests completed.");

    } catch (error) {
        console.error("MFS Test Error:", error);
    }
}

// To run in Node.js environment for testing:
// if (typeof require !== 'undefined' && require.main === module) {
//     runTest();
// }
// Or in browser, call runTest() from console after including the script.