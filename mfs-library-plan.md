# Plan: JavaScript MFS Library Development

**I. Introduction**

*   **Purpose**: To create a JavaScript library capable of creating new MFS-formatted disk images, and reading from/writing to existing MFS disk images. The library will manage files, their data/resource forks, and associated MFS metadata.
*   **Scope**:
    *   Operate on `ArrayBuffer` representations of MFS disk images.
    *   Create new, blank, MFS-formatted disk images of configurable size (default 400KB).
    *   Parse and understand MFS on-disk structures: Boot Blocks, Master Directory Block (MDB) including Volume Information and Allocation Block Map (ABM), and File Directory Blocks.
    *   Perform file operations: list files, read file (data/resource fork), write file (data/resource fork), create file, delete file.
    *   Handle MFS metadata: filenames, timestamps, Type/Creator codes, Finder flags, etc.
    *   All multi-byte numerical values will be handled as big-endian.
    *   The library will be file-format agnostic.
*   **Primary Reference**: The `mfs-read-write.md` document.

**II. Library Architecture**

*   **Main Class**: `MFSVolume`
    *   **Constructor**: `constructor(sourceOrOptions)`
        *   If `sourceOrOptions` is an `ArrayBuffer`: Initializes the volume by parsing this existing image.
        *   If `sourceOrOptions` is an object (e.g., `{ create: true, sizeKB: 400, volumeName: "Untitled" }`): Initializes by creating and formatting a new blank disk image.
    *   **Key Properties**:
        *   `imageBuffer`: The `ArrayBuffer` holding the raw disk image bytes.
        *   `dataView`: A `DataView` instance for reading/writing big-endian data from/to `imageBuffer`.
        *   `volumeInfo`: An object representing the parsed MDB Volume Information (see Section IV).
        *   `abm`: An in-memory array representing the parsed 12-bit Allocation Block Map entries.
        *   `fileDirectory`: An array of objects, each representing a parsed MFS File Directory Entry (see Section IV).
*   **Utility Functions/Methods (Internal or Static)**:
    *   Functions for reading/writing various integer types (`Uint8`, `Uint16BE`, `Uint32BE`, `Int16BE`) from/to the `DataView`.
    *   Functions for reading/writing Pascal strings.
    *   Functions for decoding a 12-bit ABM entry from 3 bytes and encoding a 12-bit ABM entry into 3 bytes (as per `mfs-read-write.md:291-315`).
    *   Functions to convert between MFS timestamps (seconds since Jan 1, 1904) and JavaScript `Date` objects.

**III. Core Functionalities (Methods of `MFSVolume`)**

1.  **Initialization & Formatting**:
    *   `_loadExistingImage(arrayBuffer)`: (Internal)
        *   Sets `this.imageBuffer` and `this.dataView`.
        *   Calls `_parseMDB()` and `_parseFileDirectory()`.
    *   `_formatNewImage(sizeKB, volumeName)`: (Internal)
        *   Calculates necessary parameters (total sectors, allocation blocks, directory size) based on `sizeKB` (default 400KB) and standard MFS parameters (e.g., 512-byte sectors, 1024-byte allocation blocks for 400KB disks).
        *   Creates `this.imageBuffer` (zero-filled).
        *   Initializes Boot Blocks (sectors 0-1).
        *   Writes the MDB (sectors 2-3), including:
            *   Volume Information: `drSigWord` (0xD2D7), `drCrDate`, `drLsMod`, `drNmFls` (0), `drDirSt`, `drDirLen`, `drNmAlBlks`, `drAlBlkSiz`, `drClpSiz`, `drAlBlSt`, `drNxtFNum` (initial), `drFreeBks`, `drVN`.
            *   Allocation Block Map: Mark blocks for the initial (empty) File Directory as `0xFFF`, others as `0x000` (free).
        *   Initializes the File Directory blocks with empty entries.
        *   Calls `_loadExistingImage(this.imageBuffer)` to parse the newly created structures.
    *   `getDiskImage()`: Returns `this.imageBuffer` (e.g., for saving to a file).

2.  **MDB and ABM Operations (Mostly Internal)**:
    *   `_parseMDB()`: Reads MDB from `this.dataView`, populates `this.volumeInfo`, and parses the ABM into `this.abm` (an array of numbers).
    *   `_writeMDB()`: Writes the current state of `this.volumeInfo` and `this.abm` (after re-packing 12-bit entries) back to `this.dataView`.
    *   `_getABMEntry(blockNum)`: Retrieves a 12-bit value from `this.abm` for the given MFS block number (2-indexed).
    *   `_setABMEntry(blockNum, value)`: Updates a 12-bit value in `this.abm` for the given MFS block number.
    *   `_findFreeBlocks(count)`: Scans `this.abm` to find `count` free blocks (value `0x000`) and returns their block numbers.
    *   `_allocateBlockChain(numBlocks)`: Finds `numBlocks` free blocks, links them in `this.abm` (N -> N+1, last -> `0x001`), and returns the starting block number and the list of allocated block numbers. Updates `this.volumeInfo.freeAllocBlocks`.
    *   `_freeBlockChain(startBlockNum)`: Marks all blocks in a chain starting from `startBlockNum` as free (`0x000`) in `this.abm`. Updates `this.volumeInfo.freeAllocBlocks`.

3.  **File Directory Operations**:
    *   `_parseFileDirectory()`: Reads the File Directory blocks (location/size from `this.volumeInfo.dirStartBlock` and `this.volumeInfo.dirLengthBlocks`), parses each entry, and populates `this.fileDirectory`.
    *   `_writeFileDirectoryEntry(entryObject, diskOffset)`: Writes an `MFSFileEntry` object to `this.dataView` at the specified `diskOffset`.
    *   `_findFileEntryByName(filename)`: Searches `this.fileDirectory` for an entry matching `filename`. Returns the entry object and its index/offset if found.
    *   `_findFreeDirectorySlot()`: Scans the File Directory for an unused slot (flFlags bit 7 clear or space after last entry). Returns the disk offset for the new entry.

4.  **Public File API Methods**:
    *   `listFiles()`: Iterates `this.fileDirectory` and returns an array of objects, each containing key info like `filename`, `type`, `creator`, `dataForkSize`, `resourceForkSize`, `creationDate`, `modificationDate`.
    *   `readFile(filename, forkType = 'data')`:
        *   Finds the file entry using `_findFileEntryByName()`.
        *   Determines start block (`flDFStBlk` or `flRFStBlk`) and logical length (`flDFLogLen` or `flRFLogLen`) for the specified `forkType`.
        *   If start block is 0, fork is empty; returns an empty `ArrayBuffer`.
        *   Traverses the ABM chain starting from the start block.
        *   For each block in the chain, calculates its physical byte offset in `this.imageBuffer` (using `this.volumeInfo.allocBlockStartSector` and `this.volumeInfo.allocBlockSize`).
        *   Reads the block's content.
        *   Concatenates content from all blocks.
        *   Truncates the concatenated data to the fork's logical length.
        *   Returns the resulting `ArrayBuffer`.
    *   `writeFile(filename, dataForkContent, resourceForkContent, metadata)`:
        *   `dataForkContent`, `resourceForkContent`: `ArrayBuffer`s (can be null/empty for empty forks).
        *   `metadata`: An object like `{ type: 'TEXT', creator: 'EDIT', folderNum: 0, finderFlags: 0x0000, creationDate?: Date, modDate?: Date }`.
        *   Handles both creating new files and overwriting existing ones (TBD: exact overwrite logic, for now, assume it deletes if exists then creates).
        *   **Allocate Space**:
            *   Call `_allocateBlockChain()` for data fork if `dataForkContent` is provided.
            *   Call `_allocateBlockChain()` for resource fork if `resourceForkContent` is provided.
        *   **Create/Update Directory Entry**:
            *   Find a free slot or the existing entry's slot.
            *   Populate an `MFSFileEntry` object with details from `metadata`, calculated lengths, allocated start blocks, and timestamps. Assign a unique `flFNum` (using `this.volumeInfo.nextFileNum++`).
            *   Write the entry to disk using `_writeFileDirectoryEntry()`.
        *   **Write Fork Data**:
            *   Iterate through the allocated block chain for the data fork, writing chunks of `dataForkContent` to each block in `this.imageBuffer`.
            *   Do the same for the resource fork.
        *   **Update MDB**:
            *   Update `this.volumeInfo.numFiles`, `this.volumeInfo.modificationDate`. `freeAllocBlocks` and `nextFileNum` are updated by helper methods.
            *   Call `_writeMDB()`.
        *   Refresh `this.fileDirectory` by re-parsing or updating in-memory.
    *   `createFile(filename, metadata)`: A convenience method. Calls `writeFile` with empty `dataForkContent` and `resourceForkContent`.
    *   `deleteFile(filename)`:
        *   Finds the file entry.
        *   Calls `_freeBlockChain()` for its data fork start block.
        *   Calls `_freeBlockChain()` for its resource fork start block.
        *   Marks the directory entry as unused (e.g., clear bit 7 of `flFlags`). This involves reading the directory sector, modifying the flag, and writing it back.
        *   Updates `this.volumeInfo.numFiles--`, `this.volumeInfo.modificationDate`.
        *   Call `_writeMDB()`.
        *   Refresh `this.fileDirectory`.
    *   `getFileInfo(filename)`: Finds and returns a copy of the `MFSFileEntry` object for the given file.

**IV. Key Data Structure Representations (JavaScript Objects)**

*   **`MFSVolumeInfo` (object stored in `this.volumeInfo`)**:
    *   `signature`: (drSigWord) `number`
    *   `creationDate`: (drCrDate) `Date` object
    *   `modificationDate`: (drLsMod) `Date` object
    *   `attributes`: (drAtrb) `number`
    *   `numFiles`: (drNmFls) `number`
    *   `dirStartBlock`: (drDirSt) `number` (sector number)
    *   `dirLengthBlocks`: (drDirLen) `number` (in sectors)
    *   `numAllocBlocks`: (drNmAlBlks) `number`
    *   `allocBlockSize`: (drAlBlkSiz) `number` (bytes)
    *   `clumpSize`: (drClpSiz) `number` (bytes)
    *   `allocBlockStartSector`: (drAlBlSt) `number` (sector number for MFS block #2)
    *   `nextFileNum`: (drNxtFNum) `number`
    *   `freeAllocBlocks`: (drFreeBks) `number`
    *   `volumeName`: (drVN) `string`
*   **`MFSFileEntry` (objects in `this.fileDirectory` array)**:
    *   `flags`: (flFlags) `number`
    *   `version`: (flVersion) `number` (always 0)
    *   `type`: (flTyp) `string` (4 chars)
    *   `creator`: (flCr) `string` (4 chars)
    *   `finderFlags`: (flFndrFlags) `number`
    *   `iconPosition`: (flPos) object `{ v: number, h: number }`
    *   `folderNum`: (flFldrNum) `number`
    *   `fileNum`: (flFNum) `number` (unique ID)
    *   `dataForkStartBlock`: (flDFStBlk) `number` (0 if empty)
    *   `dataForkLogicalLength`: (flDFLogLen) `number` (bytes)
    *   `dataForkAllocLength`: (flDFAllocLen) `number` (bytes)
    *   `resourceForkStartBlock`: (flRFStBlk) `number` (0 if empty)
    *   `resourceForkLogicalLength`: (flRFLogLen) `number` (bytes)
    *   `resourceForkAllocLength`: (flRFAllocLen) `number` (bytes)
    *   `creationDate`: (flCrDat) `Date` object
    *   `modificationDate`: (flMdDat) `Date` object
    *   `filename`: (flName) `string`
    *   `_diskOffset`: (Internal helper) `number` (byte offset of this entry in the image)
    *   `_entryLength`: (Internal helper) `number` (total byte length of this entry on disk)

**V. Error Handling**
*   The library will throw descriptive `Error` objects for issues like:
    *   "Invalid MFS signature"
    *   "Disk full" / "No free allocation blocks"
    *   "File not found"
    *   "File directory full"
    *   "Corrupted file allocation chain"
    *   "Invalid block number"

**VI. Mermaid Diagram: Class Structure & Interactions**

\`\`\`mermaid
classDiagram
    class MFSVolume {
        +ArrayBuffer imageBuffer
        +DataView dataView
        +MFSVolumeInfo volumeInfo
        +number[] abm
        +MFSFileEntry[] fileDirectory
        +constructor(sourceOrOptions)
        +getDiskImage(): ArrayBuffer
        +listFiles(): object[]
        +readFile(filename, forkType): ArrayBuffer
        +writeFile(filename, dataForkContent, resourceForkContent, metadata)
        +createFile(filename, metadata)
        +deleteFile(filename)
        +getFileInfo(filename): object
        -_loadExistingImage(ArrayBuffer)
        -_formatNewImage(sizeKB, volumeName)
        -_parseMDB()
        -_writeMDB()
        -_getABMEntry(blockNum): number
        -_setABMEntry(blockNum, value)
        -_findFreeBlocks(count): number[]
        -_allocateBlockChain(numBlocks): object
        -_freeBlockChain(startBlockNum)
        -_parseFileDirectory()
        -_writeFileDirectoryEntry(entryObject, diskOffset)
        -_findFileEntryByName(filename): object
        -_findFreeDirectorySlot(): number
    }

    class MFSVolumeInfo {
        +signature: number
        +creationDate: Date
        +modificationDate: Date
        +numFiles: number
        +dirStartBlock: number
        +dirLengthBlocks: number
        +numAllocBlocks: number
        +allocBlockSize: number
        +allocBlockStartSector: number
        +nextFileNum: number
        +freeAllocBlocks: number
        +volumeName: string
    }

    class MFSFileEntry {
        +flags: number
        +type: string
        +creator: string
        +finderFlags: number
        +fileNum: number
        +dataForkStartBlock: number
        +dataForkLogicalLength: number
        +resourceForkStartBlock: number
        +resourceForkLogicalLength: number
        +creationDate: Date
        +modificationDate: Date
        +filename: string
    }

    MFSVolume o-- MFSVolumeInfo : aggregates
    MFSVolume o-- "many" MFSFileEntry : aggregates

    class MFSLibUtils {
        <<Utility>>
        +static readUint16BE(dataView, offset): number
        +static writeUint16BE(dataView, offset, value)
        +static readPascalString(dataView, offset): string
        +static writePascalString(dataView, offset, str, maxLength)
        +static mfsTimestampToDate(mfsTime): Date
        +static dateToMFSTimestamp(date): number
        +static getABMEntryFromTriplet(byte0, byte1, byte2, isEvenIndex): number
        +static packABMEntryToTriplet(value, existingByte1, isEvenIndex): object
    }

    MFSVolume ..> MFSLibUtils : uses
\`\`\`