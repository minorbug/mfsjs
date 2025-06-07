# Mastering the Macintosh File System: A Developer's Guide to MFS Internals and Implementation

This report provides an expert-level, comprehensive exploration of the Macintosh File System (MFS). It is designed to furnish software developers and technical enthusiasts with the detailed knowledge required to understand MFS's on-disk organization and to implement a software library capable of both reading from and writing to MFS-formatted disk images. The ultimate application considered is the creation and storage of MacPaint image files onto such disk images, suitable for use within Macintosh emulators. This guide delves into the historical context of MFS, its core design principles, the intricate details of its on-disk data structures, and step-by-step methodologies for file operations, including the specifics of handling MacPaint files.

## Chapter 1: Unveiling the Macintosh File System (MFS)

### 1.1. A Historical Perspective: MFS in the Early Macintosh Era

The Macintosh File System (MFS) was introduced by Apple Computer in January 1984, coinciding with the launch of the first Macintosh personal computer.1 It was primarily engineered for use with the 400KB single-sided floppy disks that were standard at the time.1 MFS represented Apple's initial foray into file management for its groundbreaking graphical user interface (GUI) based operating system, a system that aimed to make computing more intuitive and accessible.

The design of MFS was significantly shaped by the hardware constraints of early Macintosh computers. The original Macintosh 128K, for instance, possessed only 128 kilobytes of RAM 5, and its primary storage medium offered limited capacity. In such an environment, a complex, hierarchical file system would have consumed a disproportionate share of precious memory for caching directory structures and disk space for elaborate metadata. Consequently, MFS was conceived as a "flat" file system.3 This meant that, at the disk level, all files were stored in a single, undifferentiated directory. The familiar concept of folders was an abstraction created by the Finder application to provide a user-friendly organizational metaphor, rather than a reflection of the underlying disk structure.7 This "illusion of folders" was a clever compromise, offering organizational benefits without the computational and storage overhead of a true hierarchical system. This simplicity in design was a pragmatic engineering decision, born out of necessity in an era of severe resource limitations, rather than a lack of foresight regarding future storage needs. The limitations of this flat structure, however, became increasingly apparent as storage capacities grew, notably with the introduction of peripherals like the Apple Hard Disk 20.

### 1.2. Core Design Philosophy and Key Characteristics

MFS, despite its relative simplicity compared to its successors, incorporated several key characteristics that were foundational to the Macintosh user experience:

*   Flat File System: As noted, all files and their metadata were stored in a single directory area on the disk.3 When the user navigated into a "folder" in the Finder, the system would scan the entire directory for files whose metadata associated them with that particular Finder-managed folder handle.7
*   Resource and Data Forks: A distinctive and enduring feature of Macintosh file systems, introduced with MFS, was the concept of dual forks for each file: a data fork and a resource fork.3 The data fork was intended for unstructured user data, such as the text of a word processing document or the pixel data of an image. The resource fork, conversely, was designed to store structured data associated with the file. This could include application code segments, icon bitmaps, window definitions, menu contents, sound resources, and other application-specific or system-defined data types.5 This separation was instrumental for the Mac's GUI, allowing applications to bundle their user interface elements and even executable code segments as resources, distinct from the documents they created or manipulated.
*   Metadata Richness (Type and Creator Codes): MFS stored significant metadata for each file within its directory entry. Among the most important were the four-character "File Type" and "File Creator" codes (often referred to as OSTypes).3 The File Type code identified the kind of data the file contained (e.g., 'TEXT' for a text file, 'PNTG' for a MacPaint image). The Creator code identified the specific application that created the file (e.g., 'MPNT' for MacPaint). This system was fundamental to the Mac's intuitive "double-click to open" behavior; the Finder used these codes to determine which application to launch for a given document, irrespective of the filename.
*   Allocation Block Map (ABM): For managing disk space and tracking the blocks allocated to files, MFS utilized an Allocation Block Map.1 This map, stored within the Master Directory Block, contained a 12-bit entry for each allocation block on the volume, indicating whether the block was free, part of a file, or the last block in a file's chain.1 MFS typically kept this entire map in memory for mounted volumes to ensure fast space management and file access.12

The resource fork and the rich metadata system, particularly the Type and Creator codes, were not mere technical details; they were integral to the Macintosh application model and the overall user experience. Storing graphical elements like icons, menus, and dialog box layouts as "resources" facilitated easier software localization, as textual and graphical elements could be modified without recompiling the core application code. It also allowed for a degree of application and document self-containment. The Type and Creator codes provided a robust mechanism for associating documents with applications, moving beyond the more fragile filename extension-based systems common on other platforms of the era, like MS-DOS. This tight integration of file system features with the operating system and application design principles was a defining characteristic of the Macintosh platform from its inception.

### 1.3. MFS vs. HFS: A Brief Comparative Overview

The inherent limitations of MFS, particularly its flat structure and the performance degradation associated with scanning a single large directory on higher-capacity storage, led to its relatively short lifespan as Apple's primary file system. In September 1985, approximately a year and a half after MFS's debut, Apple introduced the Hierarchical File System (HFS) alongside System 2.1.1 HFS was a significant advancement designed to address MFS's scalability issues, especially with the advent of hard disks like the 20MB Hard Disk 20.4

HFS introduced true hierarchical directories, allowing for a more organized and efficient on-disk structure. It replaced MFS's single file directory and linear search with a more sophisticated cataloging system based on B\*-trees for rapid file and directory lookups.3 HFS was also designed to manage much larger volumes and a greater number of files more effectively. Despite these fundamental architectural changes, HFS consciously maintained several of MFS's core concepts, most notably the data and resource forks, and the File Type and Creator code metadata system.3 This continuity ensured a degree of backward compatibility and preserved key aspects of the Macintosh application model that users and developers had come to expect. The decision to carry these features forward into HFS, and subsequently into HFS+, underscores their perceived importance to the Macintosh platform's identity and functionality.

MFS's support within Mac OS gradually waned. Write support for MFS volumes was removed in Mac OS version 7.6, and read support was eliminated entirely in Mac OS version 8.1

The following table summarizes some key differences between MFS and HFS:

Table 1.1: MFS vs. HFS - Key Differences

|     |     |     |
| --- | --- | --- |
| Feature | Macintosh File System (MFS) | Hierarchical File System (HFS) |
| Directory Structure | Flat (single directory on disk; folders are a Finder illusion) 3 | Hierarchical (true on-disk directories) 3 |
| Max Volume Size | Limited, practically around 20MB due to 12-bit ABM and performance | Significantly larger, e.g., 2GB under System 6/7 14 |
| Max Files | ~4094 (practical limit for Finder) , MDB field is 16-bit | 65,535 (due to 16-bit file IDs in some areas) 13 |
| Filename Length | 255 characters (MFS internal), Finder limited to 63 | 31 characters 15 |
| Metadata Storage | Single File Directory for all files 1 | Catalog File (B\*-tree) for files and directories 3 |
| Allocation Method | Allocation Block Map (12-bit entries) in MDB 1 | Volume Bitmap and Extents B\*-tree 12 |

This comparison highlights MFS's simplicity, which, while a virtue on early, resource-constrained systems, also constituted its primary weakness as storage technology advanced.

### 1.4. Why MFS Still Matters: Emulation and Vintage Computing

Given its obsolescence and replacement by HFS and later file systems like HFS+ and APFS, the practical need to interact with MFS volumes today is largely confined to the realm of vintage computing, software preservation, and the emulation of early Macintosh systems. The user query explicitly mentions creating MFS disk images for use with Macintosh emulators. Emulators such as Mini vMac are designed to replicate the hardware environment of early Macintoshes (like the Macintosh 128K or 512K) which natively used MFS for their 400K floppy disks.16

To run original software from this era, or to develop new "retro" software that targets these early platforms, disk images formatted with MFS are essential. While some tools and operating system features have historically provided read-only access to MFS volumes (e.g., Apple's MFSLives sample code for OS X 4, or the sgravrock/mfs utility 20), the ability to write to MFS images is crucial for a more dynamic interaction. Write capability allows users to save their work from within emulated applications, create custom software compilations on MFS disks, or prepare new disk images from scratch. This is precisely the capability the user seeks to develop, filling a specific requirement within the vintage computing and emulation communities where authentic engagement with early Macintosh software and its native file system is highly valued.

## Chapter 2: The Anatomy of an MFS Volume: On-Disk Structures

Understanding the precise on-disk layout of an MFS volume is paramount for any attempt to read from or write to it. MFS organizes data into fundamental units and specific control structures, all meticulously arranged on the storage medium.

### 2.1. The Big Picture: Sectors, Allocation Blocks, and Volume Layout

The foundational unit of an MFS volume is the sector, which is consistently 512 bytes in size.1 The file system, however, manages space in larger units called allocation blocks. An allocation block is a group of one or more consecutive sectors and represents the smallest quantum of disk space that can be assigned to a file.14 The size of these allocation blocks is defined in the Master Directory Block (MDB) and can be any multiple of 512 bytes; it is not restricted to powers of two.1 For a typical 400K MFS floppy disk, the allocation block size is often 1024 bytes (two sectors).1

The general layout of an MFS volume is as follows:

1.  Boot Blocks: The first two logical blocks (sectors 0 and 1) of the volume.
2.  Master Directory Block (MDB): Occupies the next two logical blocks (sectors 2 and 3).
3.  File Directory Blocks: A contiguous series of sectors containing metadata for all files on the volume. Their location and size are specified in the MDB.
4.  Allocation Blocks: The remaining space on the volume, used for storing the actual data of files (both data and resource forks) and potentially parts of the File Directory itself if indicated by the Allocation Block Map.

A critical aspect of MFS is its byte order: all multi-byte numerical values stored within its structures are in big-endian format (Most Significant Byte first).1

The choice of allocation block size in MFS presents a classic file system design trade-off. MFS uses a 16-bit field in the MDB (e.g., drNmAlBlks or number\_of\_allocation\_blocks) to store the total count of allocation blocks on the volume, limiting this to a maximum of 65,535 blocks.23 The actual pointers within the Allocation Block Map, however, are 12-bit, further constraining the addressable block count to 4,096 (as detailed later). To support larger volume capacities within this block count limit, the allocation block size must necessarily increase.14 However, since files always occupy an integral number of allocation blocks, a larger allocation block size leads to more potential wasted space (known as slack space or internal fragmentation) for files that are smaller than the block size.8 This tension between addressing capability and storage efficiency was a common challenge for early file systems operating under significant hardware constraints.

### 2.2. Boot Blocks (Logical Blocks 0 & 1): The Genesis of the Volume

The first two 512-byte sectors of an MFS volume, logical blocks 0 and 1, are designated as boot blocks.1 On a bootable MFS disk, these sectors contain the initial program code required to start the Macintosh operating system. This code typically includes instructions to locate and load further system files. The Master Directory Block (MDB), which contains the critical filesystem metadata, immediately follows these boot blocks, starting at logical block 2.1

For the purpose of a library designed to read and write files on an MFS disk image, the detailed contents of the boot blocks are generally of secondary importance, assuming the image is already formatted and potentially bootable by an emulator. The library's primary interaction begins with the MDB. However, their presence defines the starting offset for all subsequent MFS structures. On non-bootable MFS data disks, the content of these boot blocks might be minimal or zeroed out, but the space is still structurally reserved.

### 2.3. The Master Directory Block (MDB) (Logical Blocks 2 & 3): The Volume's Control Center

The Master Directory Block is the nerve center of an MFS volume. It spans two sectors (logical blocks 2 and 3), totaling 1024 bytes, and is located immediately after the boot blocks.1 The MDB is divided into two main parts:

1.  Volume Information: A fixed-structure header containing essential metadata about the entire volume.
2.  Allocation Block Map (ABM): A bitmap-like structure that tracks the status of every allocation block on the volume.

#### 2.3.1. Volume Information: Decoding the MDB Header

The Volume Information section resides at the beginning of the MDB and contains crucial parameters that define the volume's characteristics and layout. All multi-byte integer fields are stored in big-endian format. The structure, primarily based on the OSDev MFS specification 1, is detailed in Table 2.1.

Table 2.1: MFS Master Directory Block (Volume Information) Structure

|     |     |     |     |     |
| --- | --- | --- | --- | --- |
| Field Name | Offset (bytes) | Size (bytes) | C-Style Data Type (Big-Endian) | Description & Typical Value (400K disk) |
| drSigWord (Signature) | 0   | 2   | uint16\_t | Volume signature. Must be 0xD2D7 for MFS. |
| drCrDate (Creation Date) | 2   | 4   | uint32\_t | Date and time of volume creation, in seconds since midnight, January 1, 1904. |
| drLsMod (Last Mod. Date) | 6   | 4   | uint32\_t | Date and time of last volume modification (not necessarily flush), in seconds since midnight, January 1, 1904. |
| drAtrb (Attributes) | 10  | 2   | uint16\_t | Volume attributes. Bit 7: hardware locked; Bit 15: software locked. (Typical: 0x0000) |
| drNmFls (Number of Files) | 12  | 2   | uint16\_t | Number of files in the root directory (i.e., on the volume). |
| drDirSt (File Dir. Start) | 14  | 2   | uint16\_t | Starting sector number of the first File Directory block, relative to the start of the volume. (Typical: 4) |
| drDirLen (File Dir. Length) | 16  | 2   | uint16\_t | Length of the File Directory in sectors. (Typical: 12) |
| drNmAlBlks (Num. Alloc Blocks) | 18  | 2   | uint16\_t | Total number of allocation blocks on the volume. (Typical: 391) |
| drAlBlkSiz (Alloc Block Size) | 20  | 4   | uint32\_t | Size of each allocation block in bytes. Must be a multiple of 512. (Typical: 1024) |
| drClpSiz (Clump Size) | 24  | 4   | uint32\_t | Hint for filesystem driver on how many allocation blocks to reserve when a file grows. Must be a multiple of drAlBlkSiz. (Typical: 8192) |
| drAlBlSt (Alloc Block Start) | 28  | 2   | uint16\_t | Starting sector number of the first allocation block (block #2), relative to the start of the volume. (Typical: 16) |
| drNxtFNum (Next File Num.) | 30  | 4   | uint32\_t | Hint for the filesystem driver for the next file number to assign. |
| drFreeBks (Free Alloc Blocks) | 34  | 2   | uint16\_t | Number of currently free allocation blocks on the volume. |
| drVN (Volume Name) | 36  | 28  | PascalString | Volume name, as a Pascal string (1-byte length followed by up to 27 characters). Padded with zeros to 28 bytes. |

(Field names like drSigWord, drCrDate etc. are common in Apple documentation, e.g., "Inside Macintosh" for HFS.23 OSDev MFS uses more descriptive names like signature, creation\_date for MFS.1 Table uses common dr prefixes for consistency with historical Apple terminology where applicable, while mapping to the OSDev MFS structure.)

The drFreeBks field in the MDB provides a quick summary of available space. However, the definitive record of which blocks are free or in use resides in the Allocation Block Map. During write operations (file creation, extension, or deletion), both the ABM and drFreeBks must be updated consistently. If drFreeBks indicates space is available but the ABM shows no free blocks (or vice-versa due to an inconsistent update), the filesystem's integrity is compromised. Thus, any library performing write operations must ensure these two elements are kept synchronized.

#### 2.3.2. The Allocation Block Map (ABM): Tracking Every Block

Positioned directly after the Volume Information structure within the MDB is the Allocation Block Map (ABM).1 This map is fundamental to MFS's disk space management, dictating how files are stored and how free space is identified.

*   Structure and Size: The ABM is an array of 12-bit entries.1 Each entry corresponds to an allocation block on the volume. Allocation blocks are numbered sequentially, starting from block number 2. Block 0 and 1 are the boot blocks and are not represented in the ABM.1 The total number of entries in the ABM is equal to drNmAlBlks (the number of allocation blocks on the volume).
*   12-bit Entry Packing: A distinctive feature of the MFS ABM is its use of 12-bit entries. These are packed tightly to conserve space: two 12-bit entries are stored within every three-byte group (24 bits), with the Most Significant Byte (MSB) first convention.1

*   The first 12-bit entry in a 3-byte group occupies bits 0-11 (reading from MSB of byte 0 to LSB of byte 1, crossing the byte boundary).
*   The second 12-bit entry occupies bits 12-23 (reading from MSB of byte 1 to LSB of byte 2). This packing scheme means that accessing a specific 12-bit entry requires careful bitwise manipulation.

*   Interpreting ABM Entries: Each 12-bit entry in the ABM can have one of the following meanings 1:

*   0x000: Indicates that the corresponding allocation block is free and available for use.
*   0x001: Signifies that the corresponding allocation block is the last allocation block of the file to which it belongs (End-Of-File marker for that chain).
*   0x002 to 0xFEF (approximately, up to drNmAlBlks): This value is a pointer to the next allocation block in the file's chain. The value itself is the block number of that next block.
*   0xFFF: Indicates that the corresponding allocation block is used by the File Directory itself. This occurs if the File Directory spans beyond its initially reserved contiguous sectors and needs to utilize general allocation blocks.

It is crucial to reiterate that MFS does not use a separate Volume Bitmap structure pointed to by a drVBMSt field in its Master Directory Block, a characteristic feature of its successor, HFS.23 For MFS, the Allocation Block Map embedded within the MDB is the sole on-disk mechanism for tracking the allocation status (used, free, EOF, directory) of every allocatable block on the volume.1

The 12-bit size of the ABM entries inherently limits the maximum number of allocation blocks that MFS can directly address to 212, which is 4096 blocks. This, in conjunction with the drAlBlkSiz (allocation block size), determines the theoretical maximum volume size MFS can support. For example, with a 1024-byte allocation block size (common for 400K disks 1), the maximum addressable space via the ABM would be 4096×1024 bytes=4 MiB. While the drNmAlBlks field in the MDB is a 16-bit integer (allowing up to 65,535 blocks), the practical limit imposed by the 12-bit ABM pointers means that drNmAlBlks cannot meaningfully exceed 4095 (as block numbers start from 2, and 0/1 are special) if all blocks are to be part of a file chain or marked free using these pointers. This interplay demonstrates a fundamental design constraint of MFS tied to its compact ABM structure.

### 2.4. File Directory Blocks: The Catalog of Files

The File Directory in MFS is where all metadata for every file on the volume is stored. Unlike HFS's B\*-tree based Catalog File, the MFS File Directory is a simpler, linear structure.

#### 2.4.1. Locating and Understanding Directory Blocks

The location and size of the File Directory are specified by two fields in the MDB's Volume Information: drDirSt (File Directory Start) and drDirLen (File Directory Length).1 drDirSt gives the starting sector number (relative to the beginning of the volume) of the first File Directory block, and drDirLen specifies how many contiguous 512-byte sectors the directory occupies.1 These directory blocks typically reside between the MDB and the first allocation block.1

Directory entries are variable-length records that are packed sequentially into these File Directory blocks. An entry always begins on a 2-byte boundary (padding may be added to ensure this) and cannot span across sector boundaries.1

#### 2.4.2. The File Directory Entry: Structure and Semantics

Each File Directory Entry holds the metadata for a single file. The structure is detailed in Table 2.2, synthesized primarily from the OSDev MFS specification 1, which is comprehensive for MFS, and cross-referenced with "The Programmer's Apple Mac Sourcebook" (PSB) 26 for MFS-specific field naming conventions where appropriate. All multi-byte fields are big-endian.

Table 2.2: MFS File Directory Entry Structure

|     |     |     |     |     |
| --- | --- | --- | --- | --- |
| Field Name | Offset (bytes) | Size (bytes) | C-Style Data Type (Big-Endian) | Description |
| flFlags (Flags) | 0   | 1   | uint8\_t | Bit 7: 1=entry in use, 0=empty space (if last entry in block, marks end). Bit 0: 1=file locked. Other bits unknown. |
| flVersion (Version) | 1   | 1   | uint8\_t | Always 0x00. |
| flTyp (File Type) | 2   | 4   | OSType (char) | File Type code (e.g., 'PNTG', 'TEXT'). Often readable. If unknown, 0x3F3F3F3F ('????'). 3 |
| flCr (File Creator) | 6   | 4   | OSType (char) | File Creator code (e.g., 'MPNT'). Often readable. If unknown, 0x3F3F3F3F. 3 |
| flFndrFlags (Finder Flags) | 10  | 2   | uint16\_t | Flags used by the Finder (e.g., Inited, Changed, Busy). Meanings can vary. 10 |
| flPos (Position) | 12  | 4   | uint32\_t | File's icon position in its window (packed: V-coord in high word, H-coord in low word). May be 0. |
| flFldrNum (Folder Number) | 16  | 2   | int16\_t | Determines window for display. 0=volume window, -2=desktop, -3=trash. Positive value = folder ID. 7 |
| flFNum (File Number) | 18  | 4   | uint32\_t | Unique ID for this file on the volume. Referenced by drNxtFNum in MDB. |
| flDFStBlk (Data Fork Start Block) | 22  | 2   | uint16\_t | First allocation block number for the data fork. 0 if data fork is empty. (PSB: flStBlk 26) |
| flDFLogLen (Data Fork Logical Len) | 24  | 4   | uint32\_t | Logical size of the data fork in bytes (EOF). (PSB: flLgLen 26) |
| flDFAllocLen (Data Fork Alloc. Len) | 28  | 4   | uint32\_t | Total physical space allocated to the data fork in bytes (sum of allocation block sizes). |
| flRFStBlk (Rsrc. Fork Start Block) | 32  | 2   | uint16\_t | First allocation block number for the resource fork. 0 if resource fork is empty. |
| flRFLogLen (Rsrc. Fork Logical Len) | 34  | 4   | uint32\_t | Logical size of the resource fork in bytes (EOF). |
| flRFAllocLen (Rsrc. Fork Alloc. Len) | 38  | 4   | uint32\_t | Total physical space allocated to the resource fork in bytes. |
| flCrDat (Creation Date) | 42  | 4   | uint32\_t | File creation date, in seconds since midnight, January 1, 1904. |
| flMdDat (Modification Date) | 46  | 4   | uint32\_t | File last modification date, in seconds since midnight, January 1, 1904. |
| flNamLen (Filename Length) | 50  | 1   | uint8\_t | Length of the filename (number of characters). (PSB: flNamLen 26) |
| flName (Filename) | 51  | 1-255 | char\[flNamLen\] | Filename as a Pascal string (actual characters follow flNamLen). Padded to make total entry 2-byte aligned. Max MFS name length 255, Finder often 63. (PSB: flName 26) |

The flFldrNum (Folder Number) field is particularly noteworthy. Despite MFS having a flat on-disk structure, this field was used by the Finder to create the illusion of a hierarchical folder system for the user.7 When a user opened a "folder" in the Finder, MFS would scan the entire file directory, looking for entries whose flFldrNum matched the ID of the opened folder.4 This separation of the on-disk physical layout from the user's perceived logical organization was an innovative aspect of the early Macintosh interface, prioritizing user experience even with underlying technical simplicity.

### 2.5. Allocation Blocks: The Storage Units for File Data

Allocation blocks are the fundamental units of storage where the actual content of files—both their data and resource forks—is stored.1 The size of these blocks, drAlBlkSiz, is defined in the MDB's Volume Information section. A file, or each of its forks, will always occupy an integral number of these allocation blocks.8 The specific allocation blocks belonging to a file are tracked via the chain of pointers in the Allocation Block Map, starting from the flDFStBlk or flRFStBlk specified in the file's directory entry.

To access the data within a specific allocation block number N (where N >= 2), its physical sector address on the disk image must be calculated. This involves using drAlBlSt (the starting sector of allocation block #2) and drAlBlkSiz (the size of each allocation block in bytes, which also implies how many 512-byte sectors comprise one allocation block). The formula is:

ByteOffset = (drAlBlSt\_in\_sectors + (N - 2) \* (drAlBlkSiz\_in\_bytes / 512)) \* 512

The drClpSiz (Clump Size) field in the MDB Volume Information 1 provides a hint to the file system driver. When a file needs to be extended, the driver is encouraged to allocate space in chunks of drClpSiz bytes (which must be a multiple of drAlBlkSiz). This was an early strategy to mitigate file fragmentation by pre-allocating a potentially larger, contiguous group of blocks than immediately required. By doing so, it aimed to improve sequential access performance, a precursor to more sophisticated extent management techniques found in later file systems.

## Chapter 3: MFS File Internals and MacPaint Specifics

Beyond the fundamental volume structures, understanding how MFS handles individual files, their components, and their associated metadata is crucial, especially for the specific goal of working with MacPaint files.

### 3.1. The Dual Nature: Data Forks and Resource Forks

A hallmark of Macintosh file systems, including MFS, HFS, and HFS+, is the concept of a file having two distinct parts: a data fork and a resource fork.3 This duality allowed for a flexible and powerful way to organize file content.

*   Data Fork: This fork is intended to store the primary, typically unstructured, content of a file. For instance, in a word processing document, the data fork would contain the actual text. For an image file, it would hold the pixel data.5
*   Resource Fork: This fork is designed to store structured, often application-specific or system-defined, data elements called "resources." Resources could include a wide array of items such as icons, fonts, sounds, executable code segments (like 'CODE' resources), menu definitions, dialog box layouts, and images embedded within documents.5

Either the data fork or the resource fork (or both) can be empty, meaning they have a logical length of zero bytes and no allocated blocks.5 The MFS File Directory Entry contains separate fields to specify the starting allocation block, logical length, and allocated physical length for both the data fork and the resource fork (see Table 2.2).

This fork structure was particularly significant for the Macintosh's application model and GUI. Applications could be distributed as single files containing their executable code, UI elements (icons, menus, dialogs), and other necessary data all within the resource fork.4 This facilitated easier application distribution and contributed to a more self-contained application package. Furthermore, documents could store their primary content in the data fork while using the resource fork for embedded elements like images or custom icons that the Finder would display.5 This design choice was instrumental in enabling features like easy software localization (translating text resources without recompiling code) and a consistent application look and feel.

### 3.2. Essential Metadata: File Type, Creator Code, Timestamps, and Finder Information

MFS directory entries are rich in metadata that goes beyond simple filenames and sizes. This metadata is vital for the proper functioning and user experience of the Macintosh operating system.

*   File Type (OSType): A four-character code (e.g., 'TEXT', 'APPL', 'PNTG') stored in the flTyp field of the directory entry.1 This code identifies the general kind of data the file contains. It allows the system and applications to understand the file's format without relying solely on its name.
*   Creator Code (OSType): Another four-character code (e.g., 'MWOT' for MacWrite, 'MPNT' for MacPaint) stored in the flCr field.1 This code identifies the specific application that created the file. The Finder uses the Creator code to determine which application to launch when a user double-clicks a document file. This tight binding between a document and its creating application was a key usability feature of the Mac.
*   Timestamps: MFS tracks both the creation date (flCrDat) and the last modification date (flMdDat) for each file.1 These are stored as 32-bit integers representing the number of seconds since midnight, January 1, 1904.
*   Finder Information: The directory entry includes fields like flFndrFlags and flPos (and historically, other Finder-related info sometimes packed into user words).1 flFndrFlags store various attributes used by the Finder, such as whether the file is locked, invisible, if its bundle bit is set (prompting Finder to update its icon/type database), or if its icon position has been set ("inited" 10). flPos stores the coordinates of the file's icon within its folder window.

The Type/Creator code system offered a more robust and reliable method for file association compared to the filename extension-based systems prevalent on other platforms like MS-DOS.10 Since these codes were stored as distinct metadata fields rather than being part of the editable filename, they were less susceptible to accidental user modification that could break file associations.10 The Creator code, in particular, provided a stronger link to the originating application, ensuring that documents would, by default, open with the software best suited to edit them.

### 3.3. MacPaint Files on MFS: 'PNTG' Type and 'MPNT' Creator

For the user's specific goal of creating and saving MacPaint images, understanding their specific Type and Creator codes is essential.

*   File Type: MacPaint image files are universally identified by the File Type code PNTG.27
*   File Creator: Files created by the original MacPaint application are assigned the Creator code MPNT.

When a library is used to write a new MacPaint file to an MFS volume, these two codes must be correctly set in the flTyp and flCr fields of the MFS File Directory Entry, respectively. This ensures that the Finder and other Macintosh applications will correctly recognize the file as a MacPaint image and associate it with the MacPaint application (or a compatible editor).

Table 3.1: MacPaint File Metadata for MFS Directory Entry

|     |     |     |
| --- | --- | --- |
| Metadata Field | MFS Directory Entry Field (from Table 2.2) | Value for MacPaint File (Hex Bytes & ASCII) |
| File Type | flTyp | 0x50 0x4E 0x54 0x47 ('PNTG') |
| File Creator | flCr | 0x4D 0x50 0x4E 0x54 ('MPNT') |

## Chapter 4: Building Your MFS Read/Write Library: A Step-by-Step Tutorial

This chapter provides a step-by-step guide to implementing a library capable of reading from and writing to MFS disk images. It will focus on the core logic, highlighting approaches for both JavaScript and Swift.

### 4.1. Foundational Elements: Handling Binary Data (Big-Endian)

A prerequisite for working with MFS is the ability to correctly read and write binary data, particularly multi-byte integers in big-endian format and Pascal-style strings.

#### 4.1.1. JavaScript Approach (Leveraging DataView)

JavaScript's ArrayBuffer can be used to hold the raw bytes of the MFS disk image. The DataView interface provides methods to read and write various numeric types at specific byte offsets within an ArrayBuffer.31 Crucially, DataView methods (getInt16, getUint32, setInt16, setUint32, etc.) default to big-endian byte order when the optional littleEndian parameter is false or omitted, which aligns perfectly with MFS's requirements.31

Example: Reading a 16-bit unsigned integer (big-endian)

JavaScript

// Assuming 'arrayBuffer' holds the disk image data  
// and 'offset' is the byte offset of the uint16\_t value  
const dataView = new DataView(arrayBuffer);  
const value = dataView.getUint16(offset, false); // 'false' for big-endian  

Example: Writing a 32-bit signed integer (big-endian)

JavaScript

// Assuming 'dataView' is a DataView on the arrayBuffer  
// 'offset' is the target byte offset, and 'intValue' is the number to write  
dataView.setInt32(offset, intValue, false); // 'false' for big-endian  

#### 4.1.2. Swift Approach (Using Data and Endian Conversions)

Swift's Data type is suitable for holding the disk image bytes. To read or write multi-byte integers, one can work with slices of Data and convert them to/from Swift's integer types. Swift's standard library provides mechanisms for endianness conversion. For instance, integer types have initializers like init(bigEndian:) and properties like .bigEndian to get the big-endian representation.33

Example: Reading a 16-bit unsigned integer (big-endian)

Swift

// Assuming 'diskImageData' is a Data object holding the MFS image  
// and 'offset' is the byte offset of the UInt16 value  
let range = offset..<(offset + MemoryLayout<UInt16>.size)  
let uint16Bytes = diskImageData.subdata(in: range)  
let value = uint16Bytes.withUnsafeBytes { $0.load(as: UInt16.self).bigEndian }  

Example: Writing a 32-bit unsigned integer (big-endian)

Swift

// Assuming 'diskImageData' is a mutable Data object  
// 'offset' is the target byte offset, and 'uint32Value' is the number to write  
var valueToWrite = uint32Value.bigEndian // Convert to big-endian bytes  
withUnsafeBytes(of: &valueToWrite) { bytePointer in  
   diskImageData.replaceSubrange(offset..<(offset + MemoryLayout<UInt32>.size), with: bytePointer)  
}  

#### 4.1.3. Common Utilities: Reading Pascal Strings, Parsing/Writing 12-bit Packed Data

Regardless of the language, utility functions for handling Pascal strings and the packed 12-bit ABM entries are essential.

*   Pascal Strings:

*   Reading: A function would first read a single byte at the given offset to get the string's length (L). Then, it would read the next L bytes as the characters of the string.
*   Writing: A function would write a single byte representing the string's length (L), followed by the L character bytes.

*   12-bit ABM Entries: The ABM packs two 12-bit entries into three bytes (MSB-first).

*   Reading an ABM entry at logical index n (0-based for the map):

1.  Calculate the byte offset of the 3-byte pair: tripletOffset = floor(n / 2) \* 3.
2.  Read the three bytes at tripletOffset from the ABM portion of the MDB: byte0, byte1, byte2.
3.  If n is even (i.e., n % 2 == 0): the 12-bit value is (byte0 << 4) | (byte1 >> 4).
4.  If n is odd (i.e., n % 2!= 0): the 12-bit value is ((byte1 & 0x0F) << 8) | byte2.

*   Writing a 12-bit valueToWrite to ABM entry at logical index n:

1.  Calculate tripletOffset = floor(n / 2) \* 3.
2.  Read the existing three bytes at tripletOffset: byte0, byte1, byte2.
3.  If n is even:

*   byte0 = (valueToWrite >> 4) & 0xFF;
*   byte1 = (byte1 & 0x0F) | ((valueToWrite & 0x0F) << 4);

4.  If n is odd:

*   byte1 = (byte1 & 0xF0) | ((valueToWrite >> 8) & 0x0F);
*   byte2 = valueToWrite & 0xFF;

5.  Write the modified byte0, byte1, byte2 back to tripletOffset.

The correct implementation of these 12-bit packing and unpacking routines is absolutely critical. Any errors in bit shifting, masking, or offset calculation will inevitably lead to misinterpretation of the ABM, resulting in incorrect file block linkage, erroneous free space identification, and ultimately, file system corruption. Thorough unit testing of these specific low-level utilities is highly recommended before building more complex file system operations upon them.

### 4.2. Reading from an MFS Disk Image

Reading involves parsing the MDB, then the File Directory, and finally using the ABM to retrieve file content.

#### 4.2.1. Parsing the Master Directory Block

1.  Load Image: Load the MFS disk image into an ArrayBuffer (JavaScript) or Data object (Swift).
2.  Locate MDB: The MDB starts at logical block 2 (sector 2). The byte offset is 2×512=1024.
3.  Parse Volume Information: Read the first 50-52 bytes (approximate size of Volume Info part, see Table 2.1) of the MDB. Using the offsets and sizes from Table 2.1, extract each field (e.g., drSigWord, drNmAlBlks, drAlBlkSiz, drDirSt, drDirLen, drAlBlSt, drFreeBks, drVN, etc.). Ensure drSigWord is 0xD2D7. Store these values in a structured way (e.g., a VolumeInfo object or struct).
4.  Parse Allocation Block Map (ABM): The ABM immediately follows the Volume Information. Its total size in bytes can be calculated as ceil(drNmAlBlks / 2) \* 3. Read this portion of the MDB. It's highly recommended to parse all 12-bit entries into an in-memory array of integers for efficient lookup. MFS itself kept the entire ABM in memory for mounted volumes to speed up access, a practice feasible given the small size of MFS volumes (e.g., for 4096 blocks, the ABM is 6KB).12 This avoids repeated disk reads and complex bit manipulation for each block lookup during file traversal.

#### 4.2.2. Navigating the File Directory

1.  Locate Directory Blocks: From the parsed Volume Information, get drDirSt (starting sector of directory) and drDirLen (length of directory in sectors).
2.  Iterate Through Sectors: Calculate the starting byte offset: drDirSt \* 512. Read drDirLen \* 512 bytes of directory data.
3.  Parse Directory Entries: Iterate through the directory data, parsing one entry at a time.

*   The start of the directory data is the first entry.
*   For each entry:

*   Read the flFlags byte (first byte of the entry). If bit 7 is clear ((flFlags & 0x80) == 0), this signifies the end of valid entries in the current sector (if it was the last valid entry parsed), or simply an unused entry slot.1 If all entries in a sector are processed, move to the next sector's data if more directory sectors exist.
*   If bit 7 is set, the entry is in use. Parse its fields according to Table 2.2 (e.g., flTyp, flCr, flFNum, fork information, flNamLen, flName).
*   The total length of a directory entry is 51 + flNamLen (from Table 2.2), padded to the next even byte if flNamLen is odd. Advance the parsing offset by this padded length to find the next entry.

*   Store parsed entries (e.g., in an array of DirectoryEntry objects/structs).

#### 4.2.3. Retrieving File Content (Data and Resource Forks) by Traversing the Allocation Block Map

For a given parsed DirectoryEntry object:

1.  Select Fork: Determine if reading the data fork or resource fork. Get the corresponding starting block number (flDFStBlk or flRFStBlk) and logical length (flDFLogLen or flRFLogLen).
2.  Handle Empty Fork: If the starting block number is 0, the fork is empty and has no content.
3.  Traverse ABM:

*   Initialize an empty buffer for the fork's content.
*   Let currentBlockNum = fork\_start\_block\_number.
*   Loop:

*   Calculate the physical byte offset of currentBlockNum on the disk image: blockByteOffset = (drAlBlSt\_in\_sectors\_from\_MDB + (currentBlockNum - 2) \* (drAlBlkSiz\_in\_bytes\_from\_MDB / 512)) \* 512
*   Read drAlBlkSiz\_in\_bytes\_from\_MDB bytes from blockByteOffset into a temporary buffer. Append this to the fork's content buffer.
*   Look up currentBlockNum in the in-memory ABM using the 12-bit utility function. Let this be nextBlockIndicator.
*   If nextBlockIndicator == 0x001 (EOF), this is the last block of the fork. Break the loop.
*   If nextBlockIndicator == 0x000 (Free) or 0xFFF (Directory Block), this indicates a corrupted file chain. Handle error.
*   Otherwise, nextBlockIndicator is the number of the next block in the chain. Set currentBlockNum = nextBlockIndicator and continue the loop.

4.  Finalize Content: After the loop, the fork's content buffer holds all raw data from the allocated blocks. Truncate this buffer to the fork's logical\_length to get the actual file content.

### 4.3. Writing to an MFS Disk Image

Writing files is more complex as it involves modifying multiple structures: the MDB (Volume Information and ABM), the File Directory, and the allocation blocks themselves.

#### 4.3.1. Prerequisites: Volume Checks (Space, File Limits)

Before attempting to create a new file:

1.  Check Free Space: Ensure drFreeBks (from parsed MDB) is sufficient for the new file's estimated size.
2.  Check File Count: Ensure drNmFls (from parsed MDB) is below the MFS limit (e.g., 4094 was a practical Finder limit , though the drNmFls field is 16-bit, allowing for a theoretical maximum of 65,535 files).

#### 4.3.2. File Creation: Allocating Blocks and Creating a Directory Entry

This involves two main sub-steps: finding and allocating space in the ABM, and then creating a new entry in the File Directory.

A. Allocating Blocks in the ABM:

1.  Determine Blocks Needed: Calculate the number of allocation blocks required for the data fork and resource fork based on their respective sizes and the volume's drAlBlkSiz.
2.  Find Free Blocks: Iterate through the in-memory ABM. For each fork:

*   Maintain a list of allocated block numbers for this fork.
*   For each block needed:

*   Search the ABM for an entry with value 0x000 (free). If none found, the disk is full.
*   Record the block number of this free block. Add it to the list for the current fork.
*   Mark this ABM entry as temporarily used (e.g., with a placeholder, or immediately link it if the next block is known).
*   Decrement the in-memory copy of drFreeBks.

3.  Link Allocated Blocks: Once all necessary blocks for a fork are identified:

*   The first block number in the list becomes the fork's starting block (flDFStBlk or flRFStBlk).
*   Iterate through the list of allocated blocks for the fork. For each block B\_i in the list (except the last):

*   Set the ABM entry for B\_i to the block number of B\_{i+1} (the next block in the chain).

*   For the last block in the list, set its ABM entry to 0x001 (EOF).

B. Creating a File Directory Entry:

1.  Find Empty Slot: Scan the File Directory blocks for an unused entry. An entry is unused if its flFlags byte has bit 7 clear, or if there's space after the last valid entry in a directory sector (but before the sector ends), or at the beginning of an unused directory sector (if drDirLen allows for more sectors than currently used).

*   If the directory is full (all drDirLen sectors are packed and no entries are marked free), and if MFS allows the directory to grow into allocation blocks (marked 0xFFF in ABM), this would be a more complex scenario involving allocating new blocks for the directory itself and updating the ABM accordingly. For simplicity, assume finding an existing slot or space in current directory blocks.

2.  Populate Entry: At the identified free slot, construct the new DirectoryEntry (see Table 2.2):

*   Set flFlags (e.g., 0x80 for an active, unlocked file).
*   Set flVersion to 0x00.
*   Set flTyp (e.g., 'PNTG') and flCr (e.g., 'MPNT').
*   Set flFndrFlags, flPos (e.g., to defaults or zeros).
*   Set flFldrNum (e.g., 0 for volume root).
*   Assign a unique flFNum: use the MDB's drNxtFNum and then increment the MDB's drNxtFNum.
*   Set flDFStBlk, flRFStBlk to the first block numbers allocated for each fork (or 0 if empty).
*   Initialize flDFLogLen, flRFLogLen, flDFAllocLen, flRFAllocLen (likely to 0 if data is written later, or to actual sizes if data is written now). AllocLen fields should reflect the total size of blocks allocated.
*   Set flCrDat and flMdDat to the current time.
*   Set flNamLen and flName with the new filename (Pascal string).

3.  Write Directory Entry: Write the newly populated directory entry structure to its calculated offset in the disk image.
4.  Update MDB:

*   Increment the in-memory drNmFls.
*   The in-memory drFreeBks should already be decremented from block allocation.
*   Update the in-memory drNxtFNum.
*   Update the in-memory drLsMod (volume last modification date).

#### 4.3.3. Writing File Data

1.  Get Block Chain: For the target fork (data or resource), retrieve its chain of allocated block numbers from the ABM, starting with flDFStBlk or flRFStBlk.
2.  Write Data Sequentially:

*   Iterate through the data to be written.
*   For each allocation block in the file's chain:

*   Calculate its physical byte offset on the disk image.
*   Write one drAlBlkSiz chunk of the file data into this block.
*   If it's the last block and the data doesn't fill it, the remaining space in that block is slack.

3.  Update Logical Length: After all data is written, update the fork's logical length (flDFLogLen or flRFLogLen) in the in-memory directory entry to the actual number of bytes written. The allocated length (flDFAllocLen or flRFAllocLen) should reflect the total size of the blocks in the chain.

#### 4.3.4. Updating MDB and Directory Entry (Committing Changes)

After all file creation and data writing steps are complete for a given operation:

1.  Write Updated Directory Entry: If not already done, write the modified in-memory DirectoryEntry (with correct sizes, dates, etc.) to the disk image.
2.  Write Updated MDB:

*   Write the updated Volume Information (with new drNmFls, drNxtFNum, drFreeBks, drLsMod) back to sectors 2/3 of the disk image.
*   Write the modified in-memory ABM back to its location within the MDB on the disk image.

Write operations in MFS, as in most file systems without journaling, are inherently multi-step processes that modify different on-disk structures. For example, creating a file touches the ABM (to mark blocks used), the File Directory (to add the new entry), and the MDB (to update counts like drNmFls and drFreeBks). If an interruption (like a program crash or power loss) occurs mid-sequence, the file system can be left in an inconsistent state. For instance, blocks might be marked as used in the ABM, but no directory entry might point to them, leading to lost space. Or a directory entry might exist, but its corresponding blocks in the ABM might not be correctly linked. While a full journaling mechanism is beyond the scope of a simple MFS library, developers should be mindful of the order of operations. A common strategy is to perform all critical updates to in-memory representations first, then write them to the disk image in an order that minimizes the risk of severe corruption (e.g., ensure data blocks are written and ABM links are set before the directory entry pointing to them is finalized).

### 4.4. Deleting Files from an MFS Disk Image

Deleting a file involves marking its directory entry as unused and reclaiming its allocated blocks in the ABM.

#### 4.4.1. Marking the Directory Entry as Unused

1.  Locate Entry: Find the DirectoryEntry for the file to be deleted by searching the File Directory (e.g., by filename).
2.  Invalidate Entry: The primary method to mark an MFS directory entry as unused is to clear bit 7 of its flFlags field (the first byte of the entry).1 This makes the entry appear as "empty space."

*   Optionally, for robustness, one might also zero out the flNamLen field or even the entire entry after clearing the flag, though clearing bit 7 of flFlags is the key indicator.

3.  Write the modified directory sector back to the disk image.

#### 4.4.2. Reclaiming Space: Marking Blocks as Free in the ABM

1.  Traverse Forks: For both the data fork and the resource fork of the deleted file:

*   Starting with flDFStBlk (or flRFStBlk), trace the chain of allocated blocks using the in-memory ABM.
*   For each block number in the chain:

*   Update its corresponding 12-bit entry in the in-memory ABM to 0x000 (free).
*   Increment the in-memory count of drFreeBks.

*   Continue until the 0x001 (EOF) marker is encountered for each fork.

#### 4.4.3. Updating MDB (drNmFls, drFreeBks)

1.  Decrement File Count: Decrement the in-memory drNmFls in the Volume Information.
2.  Commit Changes:

*   Write the updated Volume Information (with new drNmFls, drFreeBks, and drLsMod) back to the MDB on disk.
*   Write the modified in-memory ABM (reflecting the newly freed blocks) back to the MDB on disk.

File deletion in MFS is comparatively straightforward due to its flat directory structure and the direct block mapping provided by the ABM. There are no complex B-tree structures to unlink as in HFS. The main responsibility is to ensure that all blocks previously belonging to the file are correctly marked as free in the ABM. Failure to do so would result in orphaned blocks—space that is allocated according to the ABM but no longer referenced by any valid file directory entry, leading to a gradual loss of usable disk space.

## Chapter 5: Practical Application: Creating and Saving MacPaint Images

This chapter focuses on the user's ultimate goal: creating MacPaint image files and saving them to an MFS-formatted disk image using the library developed based on the principles outlined earlier.

### 5.1. A Primer on the MacPaint (PNTG) File Format

MacPaint, one of the original applications bundled with the Macintosh in 1984, utilized a specific raster image format. Key characteristics include 27:

*   Image Type: Monochrome (1-bit black and white).
*   Dimensions: Fixed at 576 pixels wide by 720 pixels high.
*   Resolution: Fixed at 72 dots per inch (dpi).
*   Uncompressed Size: The raw bitmap data for a MacPaint image is 576×720 bits=414,720 bits=51,840 bytes.
*   Byte Order: Multi-byte numerical data within the MacPaint format itself (if any, though it's primarily a bitmap) is generally big-endian, consistent with the Macintosh platform.
*   Compression: MacPaint image data is typically compressed using a byte-wise Run-Length Encoding (RLE) scheme, very similar to or identical to Apple's PackBits algorithm. Each scanline (row of pixels) is compressed independently. An uncompressed scanline consists of 576 pixels/8 pixels/byte=72 bytes.
*   File Structure on MFS:

*   The actual image data (potentially preceded by pattern data) is stored in the data fork of the MFS file.
*   The resource fork is typically empty for standard MacPaint (PNTG) files.
*   The File Type is PNTG and the Creator is MPNT, stored in the MFS directory entry, not as part of a MacBinary header within the data fork when on a native Mac volume.

*   Pattern Data (Optional but Common): Some descriptions of the MacPaint file format, often in the context of files transferred with MacBinary headers, mention a 512-byte header block within the data fork itself. This often consists of 38 patterns (each 8 bytes, totaling 304 bytes) used by the MacPaint application's pattern palette, followed by 204 bytes of padding. This 512-byte block would precede the actual compressed image data within the data fork. When creating a new MacPaint file, including this pattern block (even if zeroed or with default patterns) might enhance compatibility with the MacPaint application itself.

The fixed dimensions and monochrome nature simplify the generation of the raw bitmap. However, implementing the RLE compression is crucial for creating authentic MacPaint files that are also space-efficient, especially on MFS volumes where space is at a premium. A 51,840-byte uncompressed image would consume a significant portion of a 400KB floppy disk.

### 5.2. Generating MacPaint Image Data (Conceptual Example)

To create the content for a MacPaint file's data fork:

1.  Create Bitmap: Generate or obtain a 1-bit (monochrome) bitmap of 576x720 pixels. This can be represented in memory as a byte array where each bit corresponds to a pixel (e.g., 0 for white, 1 for black, or vice-versa depending on convention, though MacPaint typically displayed black on white ).
2.  Optional Pattern Data: Prepend the 304 bytes of pattern data and 204 bytes of padding to the image data buffer if desired for full MacPaint application compatibility.
3.  Compress Scanlines (PackBits RLE): Process the bitmap scanline by scanline (each raw scanline is 72 bytes). The PackBits algorithm (or the RLE variant described for MacPaint ) works as follows for each scanline:

*   Iterate through the input (uncompressed) scanline data.
*   If a sequence of identical bytes is found (e.g., N repetitions of byte X, where 2≤N≤128):

*   Write a control byte -(N-1) (or 1 - N, a value from -1 to -127).
*   Write the repeated byte X once.

*   If a sequence of non-repeating bytes is found (e.g., N literal bytes, where 1≤N≤128):

*   Write a control byte N-1 (a value from 0 to 127).
*   Write the N literal bytes.

*   The process aims to minimize the output size for each scanline. Note: The RLE scheme in is slightly different: "If the most significant bit is set to 1, the byte is converted to its two's-complement value, and the next byte is repeated RunCount times. If high bit is zero Count is byte value plus one, Read and copy the next count bytes." This specific variant should be implemented.

4.  Concatenate: The final data fork content will be the (optional) 512-byte pattern/padding block followed by all the compressed scanlines concatenated together.

### 5.3. Using Your Library to Save a MacPaint File to an MFS Image

Once the MacPaint PNTG image data (compressed, and potentially including the pattern header) is prepared as a byte array, the MFS library functions developed in Chapter 4 can be used:

1.  Initialize MFS Volume: Mount/open the MFS disk image using the library, parsing its MDB and ABM.
2.  Create File: Call the library's file creation function (see Section 4.3.2).

*   Provide the desired filename (e.g., "MyArtwork.ptng").
*   Crucially, set the File Type to PNTG (bytes 0x50 0x4E 0x54 0x47).
*   Set the File Creator to MPNT (bytes 0x4D 0x50 0x4E 0x54).
*   Set other metadata as appropriate (timestamps, Finder flags to default).
*   The library will allocate blocks in the ABM for the estimated size and create the directory entry.

3.  Write Data Fork: Call the library's file writing function (see Section 4.3.3) to write the prepared PNTG byte array (patterns + compressed image data) into the data fork of the newly created file. The library will handle writing to the allocated blocks and updating the data fork's logical and physical length in the directory entry.
4.  Resource Fork: For a standard MacPaint file, the resource fork is typically empty. The library should ensure the resource fork's starting block is 0 and its lengths are 0 in the directory entry.
5.  Commit Changes: The library should ensure that all changes (MDB, ABM, directory entry, data blocks) are written back to the disk image.

It's important to maintain a separation of concerns: the MFS library itself should be agnostic to the content of the files it manages. Its role is to correctly implement the MFS on-disk structures and operations (block allocation, directory management). The application using the MFS library is responsible for generating the MacPaint-specific data stream and for providing the correct Type (PNTG) and Creator (MPNT) codes when calling the library's file creation functions. This approach ensures the MFS library remains general-purpose and reusable for other file types beyond MacPaint.

## Chapter 6: Conclusion

The Macintosh File System, though long superseded, remains a significant artifact in the history of personal computing file systems. Its design, characterized by a flat structure, dual file forks, rich metadata including Type and Creator codes, and a compact Allocation Block Map, was a pragmatic response to the severe hardware limitations of the original Macintosh. While these characteristics led to its eventual replacement by the more scalable Hierarchical File System, MFS laid the groundwork for many enduring concepts in Mac OS file management.

This report has provided a detailed deconstruction of MFS's on-disk structures, from the foundational sectors and allocation blocks to the intricacies of the Master Directory Block, the Allocation Block Map, and File Directory Entries. The big-endian byte order and specific data formats, such as Pascal strings and the unique 12-bit packing of ABM entries, have been delineated to provide a clear blueprint for implementation.

The step-by-step tutorial sections for both reading and writing operations aim to equip developers with the procedural knowledge to build a functional MFS library. Key operations such as parsing volume information, navigating the directory, traversing block allocation chains, allocating free blocks, creating and deleting directory entries, and updating all relevant metadata structures have been covered. The critical importance of maintaining consistency between the MDB's summary fields (like drFreeBks and drNmFls) and the state of the Allocation Block Map during write operations has been emphasized as crucial for filesystem integrity.

Furthermore, the specific requirements for handling MacPaint files—namely, setting the PNTG File Type and MPNT File Creator codes in the MFS directory entry, and preparing the appropriately formatted (and typically RLE-compressed) image data for the data fork—have been addressed to meet the user's primary objective.

Implementing a full read/write MFS library is a non-trivial undertaking, demanding meticulous attention to data structure details, byte ordering, and the precise sequence of operations, especially for write actions that can affect filesystem consistency. However, with the technical specifications and procedural guidance provided herein, developers should be well-positioned to create tools that can interact with MFS disk images, thereby enabling new avenues for vintage software use, development, and digital preservation within the Macintosh emulation community. The ability to not just read but also write to MFS images opens up dynamic possibilities for recreating and engaging with the earliest Macintosh experiences.

## Appendix A: Quick Reference: MFS Data Structures

MFS Master Directory Block (Volume Information) Structure (Abbreviated)

(Refer to Table 2.1 for full details)

*   drSigWord (uint16\_t): 0xD2D7
*   drCrDate (uint32\_t): Creation timestamp
*   drLsMod (uint32\_t): Modification timestamp
*   drNmFls (uint16\_t): Number of files
*   drDirSt (uint16\_t): File Directory starting sector
*   drDirLen (uint16\_t): File Directory length in sectors
*   drNmAlBlks (uint16\_t): Total allocation blocks
*   drAlBlkSiz (uint32\_t): Allocation block size (bytes)
*   drAlBlSt (uint16\_t): Allocation block area starting sector
*   drNxtFNum (uint32\_t): Next file number hint
*   drFreeBks (uint16\_t): Count of free allocation blocks
*   drVN (PascalString): Volume Name
*   Followed by the Allocation Block Map.

MFS File Directory Entry Structure (Abbreviated)

(Refer to Table 2.2 for full details)

*   flFlags (uint8\_t): Entry status and file lock
*   flVersion (uint8\_t): 0x00
*   flTyp (OSType): File Type (4 chars)
*   flCr (OSType): File Creator (4 chars)
*   flFndrFlags (uint16\_t): Finder flags
*   flFNum (uint32\_t): File Number (ID)
*   flDFStBlk (uint16\_t): Data fork starting block
*   flDFLogLen (uint32\_t): Data fork logical length
*   flDFAllocLen (uint32\_t): Data fork allocated length
*   flRFStBlk (uint16\_t): Resource fork starting block
*   flRFLogLen (uint32\_t): Resource fork logical length
*   flRFAllocLen (uint32\_t): Resource fork allocated length
*   flCrDat (uint32\_t): Creation timestamp
*   flMdDat (uint32\_t): Modification timestamp
*   flNamLen (uint8\_t): Filename length
*   flName (char\[flNamLen\]): Filename (Pascal string)

Allocation Block Map (ABM) Special 12-bit Values

*   0x000: Allocation block is FREE.
*   0x001: Allocation block is the LAST block of a file (EOF marker).
*   0xFFF: Allocation block is used by the File Directory itself.
*   Other values (0x002 - 0xFEF approx.): Pointer to the next allocation block in a file's chain.

## Appendix B: Illustrative Code Snippets (Conceptual)

These snippets illustrate the core logic for some key operations. They are conceptual and would require further fleshing out, error handling, and adaptation to specific language features and library design.

JavaScript (Conceptual):

JavaScript

// Assuming 'mfsImage' is an ArrayBuffer holding the MFS disk image  
// Assuming 'volumeInfo' is an object populated from parsing the MDB  
  
function getABMEntry\_JS(mdbArrayBuffer, blockNum) {  
   // ABM starts after Volume Info (e.g., at offset 52 if VolInfo is 52 bytes)  
   const abmOffsetInMDB = 52; // Example offset, use actual  
   const tripletIndex = Math.floor(blockNum / 2);  
   const byteOffsetInABM = tripletIndex \* 3;  
     
   const view = new DataView(mdbArrayBuffer);  
   // Ensure blockNum is within drNmAlBlks bounds  
   if (blockNum >= volumeInfo.drNmAlBlks + 2 |  
| blockNum < 2) { // Blocks 0,1 not in ABM  
       throw new Error("Block number out of range for ABM");  
   }  
  
   const b0 = view.getUint8(abmOffsetInMDB + byteOffsetInABM);  
   const b1 = view.getUint8(abmOffsetInMDB + byteOffsetInABM + 1);  
   const b2 = view.getUint8(abmOffsetInMDB + byteOffsetInABM + 2);  
  
   if (blockNum % 2 === 0) { // Even block number (0th, 2nd, 4th... in ABM terms)  
       return (b0 << 4) | (b1 >> 4);  
   } else { // Odd block number (1st, 3rd, 5th... in ABM terms)  
       return ((b1 & 0x0F) << 8) | b2;  
   }  
}  
  
function setABMEntry\_JS(mdbArrayBuffer, blockNum, value) {  
   const abmOffsetInMDB = 52; // Example offset  
   const tripletIndex = Math.floor(blockNum / 2);  
   const byteOffsetInABM = tripletIndex \* 3;  
  
   const view = new DataView(mdbArrayBuffer);  
   // Ensure blockNum is within drNmAlBlks bounds and value is 12-bit  
    if (blockNum >= volumeInfo.drNmAlBlks + 2 |  
| blockNum < 2) {  
       throw new Error("Block number out of range for ABM");  
   }  
   if (value > 0xFFF) {  
       throw new Error("Value exceeds 12-bit range");  
   }  
  
   let b0 = view.getUint8(abmOffsetInMDB + byteOffsetInABM);  
   let b1 = view.getUint8(abmOffsetInMDB + byteOffsetInABM + 1);  
   let b2 = view.getUint8(abmOffsetInMDB + byteOffsetInABM + 2);  
  
   if (blockNum % 2 === 0) {  
       b0 = (value >> 4) & 0xFF;  
       b1 = (b1 & 0x0F) | ((value & 0x0F) << 4);  
   } else {  
       b1 = (b1 & 0xF0) | ((value >> 8) & 0x0F);  
       b2 = value & 0xFF;  
   }  
   view.setUint8(abmOffsetInMDB + byteOffsetInABM, b0);  
   view.setUint8(abmOffsetInMDB + byteOffsetInABM + 1, b1);  
   view.setUint8(abmOffsetInMDB + byteOffsetInABM + 2, b2);  
}  
  
function readPascalString\_JS(dataView, offset) {  
   const length = dataView.getUint8(offset);  
   let str = "";  
   for (let i = 0; i < length; i++) {  
       str += String.fromCharCode(dataView.getUint8(offset + 1 + i));  
   }  
   return str;  
}  

Swift (Conceptual):

Swift

// Assuming 'mfsImageData' is a Data object holding the MFS image  
// Assuming 'volumeInfo' is a struct populated from parsing the MDB  
  
struct MFSVolumeInfo { // Simplified  
   let drNmAlBlks: UInt16  
   //... other MDB fields  
}  
  
// ABM is part of the MDB Data object  
func getABMEntry\_Swift(mdbData: Data, blockNum: UInt16, volInfo: MFSVolumeInfo) throws -> UInt16 {  
   let abmOffsetInMDB = 52 // Example offset, relative to start of mdbData  
     
   // MFS allocation blocks are numbered starting from 2.  
   // The ABM itself is 0-indexed internally by (blockNum - 2).  
   let abmIndex = blockNum - 2  
     
   guard blockNum >= 2 && abmIndex < volInfo.drNmAlBlks else {  
       throw MFSError.blockOutOfRange  
   }  
  
   let tripletIndex = Int(abmIndex / 2)  
   let byteOffsetInABM = tripletIndex \* 3  
  
   guard abmOffsetInMDB + byteOffsetInABM + 2 < mdbData.count else {  
       throw MFSError.readOutOfBounds  
   }  
     
   let b0 = mdbData  
   let b1 = mdbData  
   let b2 = mdbData  
  
   if abmIndex % 2 == 0 { // Even index in ABM  
       return (UInt16(b0) << 4) | (UInt16(b1) >> 4)  
   } else { // Odd index in ABM  
       return (UInt16(b1 & 0x0F) << 8) | UInt16(b2)  
   }  
}  
  
func setABMEntry\_Swift(mdbData: inout Data, blockNum: UInt16, value: UInt16, volInfo: MFSVolumeInfo) throws {  
   let abmOffsetInMDB = 52 // Example offset  
   let abmIndex = blockNum - 2  
  
   guard blockNum >= 2 && abmIndex < volInfo.drNmAlBlks else {  
       throw MFSError.blockOutOfRange  
   }  
   guard value <= 0xFFF else {  
       throw MFSError.valueOutOfRange  
   }  
  
   let tripletIndex = Int(abmIndex / 2)  
   let byteOffsetInABM = tripletIndex \* 3  
     
   guard abmOffsetInMDB + byteOffsetInABM + 2 < mdbData.count else {  
       throw MFSError.writeOutOfBounds  
   }  
  
   var b0 = mdbData  
   var b1 = mdbData  
   var b2 = mdbData  
  
   if abmIndex % 2 == 0 {  
       b0 = UInt8((value >> 4) & 0xFF)  
       b1 = (b1 & 0x0F) | UInt8((value & 0x0F) << 4)  
   } else {  
       b1 = (b1 & 0xF0) | UInt8((value >> 8) & 0x0F)  
       b2 = UInt8(value & 0xFF)  
   }  
   mdbData = b0  
   mdbData = b1  
   mdbData = b2  
}  
  
  
func readPascalString\_Swift(data: Data, offset: Int) throws -> String {  
   guard offset < data.count else { throw MFSError.readOutOfBounds }  
   let length = Int(data\[offset\])  
   let stringStartOffset = offset + 1  
   guard stringStartOffset + length <= data.count else { throw MFSError.readOutOfBounds }  
     
   let stringData = data.subdata(in: stringStartOffset..<(stringStartOffset + length))  
   // Assuming MacRoman encoding for MFS filenames  
   return String(data: stringData, encoding:.macOSRoman)?? ""  
}  
  
enum MFSError: Error {  
   case blockOutOfRange, readOutOfBounds, writeOutOfBounds, valueOutOfRange  
}  

#### Works cited

1.  MFS - OSDev Wiki, accessed May 6, 2025, [https://wiki.osdev.org/MFS](https://www.google.com/url?q=https://wiki.osdev.org/MFS&sa=D&source=editors&ust=1746753758617180&usg=AOvVaw0bIv8XaDOXB5CBIz0939vK)
2.  Comparison of file systems - Wikipedia, accessed May 6, 2025, [https://en.wikipedia.org/wiki/Comparison\_of\_file\_systems](https://www.google.com/url?q=https://en.wikipedia.org/wiki/Comparison_of_file_systems&sa=D&source=editors&ust=1746753758617639&usg=AOvVaw177pryvvbotsk6c__E0QJo)
3.  3.2. Apple Macintosh - disktype, accessed May 6, 2025, [https://disktype.sourceforge.net/doc/ch03s02.html](https://www.google.com/url?q=https://disktype.sourceforge.net/doc/ch03s02.html&sa=D&source=editors&ust=1746753758618004&usg=AOvVaw0STaNfh-t4YPirPSEWWHsI)
4.  Storing our digital lives - CDN, accessed May 6, 2025, [https://bpb-us-e1.wpmucdn.com/sites.psu.edu/dist/4/24696/files/2017/07/psumac2017-174-Storing-our-digital-lives-Mac-filesystems-from-MFS-to-APFS.key-254bf2y.pdf](https://www.google.com/url?q=https://bpb-us-e1.wpmucdn.com/sites.psu.edu/dist/4/24696/files/2017/07/psumac2017-174-Storing-our-digital-lives-Mac-filesystems-from-MFS-to-APFS.key-254bf2y.pdf&sa=D&source=editors&ust=1746753758618667&usg=AOvVaw22fmZ7AZDO670wEcLMk-ok)
5.  Resource fork - Wikipedia, accessed May 6, 2025, [https://en.wikipedia.org/wiki/Resource\_fork](https://www.google.com/url?q=https://en.wikipedia.org/wiki/Resource_fork&sa=D&source=editors&ust=1746753758618992&usg=AOvVaw1CM7o-nyI4uPElUwhEvlbt)
6.  How to read HFS CD-ROM on Monterey - Apple Communities, accessed May 6, 2025, [https://discussions.apple.com/thread/255242818](https://www.google.com/url?q=https://discussions.apple.com/thread/255242818&sa=D&source=editors&ust=1746753758619381&usg=AOvVaw0kTC0sqlrUVM55jCln6jBr)
7.  en.wikipedia.org, accessed May 6, 2025, [https://en.wikipedia.org/wiki/Macintosh\_File\_System#:~:text=MFS%20stores%20all%20of%20the,all%20files%20in%20that%20handle.](https://www.google.com/url?q=https://en.wikipedia.org/wiki/Macintosh_File_System%23:~:text%3DMFS%2520stores%2520all%2520of%2520the,all%2520files%2520in%2520that%2520handle.&sa=D&source=editors&ust=1746753758619878&usg=AOvVaw31LIn3j5KZ3Inuu4E-zRHo)
8.  Technical Note TN1150: HFS Plus Volume Format - Apple Developer, accessed May 6, 2025, [https://developer.apple.com/library/archive/technotes/tn/tn1150.html](https://www.google.com/url?q=https://developer.apple.com/library/archive/technotes/tn/tn1150.html&sa=D&source=editors&ust=1746753758620323&usg=AOvVaw2uk5U5bBCBDhqDvTYxVSF0)
9.  Macintosh resource fork data: C# parsing library - Format Gallery, accessed May 6, 2025, [https://formats.kaitai.io/resource\_fork/csharp.html](https://www.google.com/url?q=https://formats.kaitai.io/resource_fork/csharp.html&sa=D&source=editors&ust=1746753758620765&usg=AOvVaw3o4M4F5uw78CPYCIhgYrEg)
10.  The Vintage Mac Museum » Macintosh Type and Creator Codes, accessed May 6, 2025, [https://vintagemacmuseum.com/macintosh-type-and-creator-codes/](https://www.google.com/url?q=https://vintagemacmuseum.com/macintosh-type-and-creator-codes/&sa=D&source=editors&ust=1746753758621183&usg=AOvVaw31acYgI8R9PuBvTy1flujR)
11.  Detecting MacBinary format - Entropymine - WordPress.com, accessed May 6, 2025, [https://entropymine.wordpress.com/2019/02/13/detecting-macbinary-format/](https://www.google.com/url?q=https://entropymine.wordpress.com/2019/02/13/detecting-macbinary-format/&sa=D&source=editors&ust=1746753758621616&usg=AOvVaw3fCZiGeQqSKmV7pJI4q6Cf)
12.  Programming for HFS Compatibility - MacTech | The journal of Apple technology., accessed May 6, 2025, [http://preserve.mactech.com/articles/mactech/Vol.02/02.01/HFS/index.html](https://www.google.com/url?q=http://preserve.mactech.com/articles/mactech/Vol.02/02.01/HFS/index.html&sa=D&source=editors&ust=1746753758622149&usg=AOvVaw1ISkqvKPbGTsc_KN_h35NF)
13.  Hierarchical File System (HFS) - Linux.org, accessed May 6, 2025, [https://www.linux.org/threads/hierarchical-file-system-hfs.8934/](https://www.google.com/url?q=https://www.linux.org/threads/hierarchical-file-system-hfs.8934/&sa=D&source=editors&ust=1746753758622552&usg=AOvVaw3ncESgYwYY4JTBNcf4Z_FX)
14.  AppleCare Tech Info Library -Macintosh: File System Specifications and Terms, accessed May 6, 2025, [https://www.savagetaylor.com/TIL/KB008647.html](https://www.google.com/url?q=https://www.savagetaylor.com/TIL/KB008647.html&sa=D&source=editors&ust=1746753758622954&usg=AOvVaw29MTjt_doqRaW20uhC8YIg)
15.  libfshfs/documentation/Hierarchical File System (HFS).asciidoc at main - GitHub, accessed May 6, 2025, [https://github.com/libyal/libfshfs/blob/master/documentation/Hierarchical%20File%20System%20(HFS).asciidoc](https://www.google.com/url?q=https://github.com/libyal/libfshfs/blob/master/documentation/Hierarchical%2520File%2520System%2520(HFS).asciidoc&sa=D&source=editors&ust=1746753758623608&usg=AOvVaw2QmfIAEPIkZQcD0_hOKN_6)
16.  Back to 1984: Rebuilding ChipWits for the Macintosh 128K, accessed May 6, 2025, [https://chipwits.com/2025/04/14/back-to-1984-rebuilding-chipwits-for-the-macintosh-128k/](https://www.google.com/url?q=https://chipwits.com/2025/04/14/back-to-1984-rebuilding-chipwits-for-the-macintosh-128k/&sa=D&source=editors&ust=1746753758624145&usg=AOvVaw2zUNYqGPDjsG-Mf-NGgBq2)
17.  minivmac/minivmac - GitHub, accessed May 6, 2025, [https://github.com/minivmac/minivmac](https://www.google.com/url?q=https://github.com/minivmac/minivmac&sa=D&source=editors&ust=1746753758624542&usg=AOvVaw3hSoJvpNGNx-aZqQwRTOlf)
18.  macfuse/LICENSE.txt at release/macfuse - GitHub, accessed May 6, 2025, [https://github.com/osxfuse/osxfuse/blob/master/LICENSE.txt](https://www.google.com/url?q=https://github.com/osxfuse/osxfuse/blob/master/LICENSE.txt&sa=D&source=editors&ust=1746753758624947&usg=AOvVaw2gFFGkltJ7YtSBB06NErZ8)
19.  Reading HFS standard and MFS on Catalina - Apple Support Community, accessed May 6, 2025, [https://discussions.apple.com/thread/251321702](https://www.google.com/url?q=https://discussions.apple.com/thread/251321702&sa=D&source=editors&ust=1746753758625385&usg=AOvVaw0BtoHjVp2O7NzTHviS4xi_)
20.  sgravrock/mfs: Read MFS volumes on OS X - GitHub, accessed May 6, 2025, [https://github.com/sgravrock/mfs](https://www.google.com/url?q=https://github.com/sgravrock/mfs&sa=D&source=editors&ust=1746753758625760&usg=AOvVaw0iN_zUzVXAI5ePj0mtl9rW)
21.  Glossary (IM: F), accessed May 6, 2025, [https://leopard-adc.pepas.com/documentation/mac/Files/Files-389.html](https://www.google.com/url?q=https://leopard-adc.pepas.com/documentation/mac/Files/Files-389.html&sa=D&source=editors&ust=1746753758626151&usg=AOvVaw0M2EjzRevUkuDgj1Etgoa9)
22.  www.savagetaylor.com, accessed May 6, 2025, [https://www.savagetaylor.com/TIL/KB008647.html#:~:text=Volume%20bitmaps%20exist%20both%20on%20hierarchical%20directory%20volumes%20and%20in%20memory.&text=Allocation%20blocks%20begin%20after%20the,folders%20stored%20in%20a%20volume.](https://www.google.com/url?q=https://www.savagetaylor.com/TIL/KB008647.html%23:~:text%3DVolume%2520bitmaps%2520exist%2520both%2520on%2520hierarchical%2520directory%2520volumes%2520and%2520in%2520memory.%26text%3DAllocation%2520blocks%2520begin%2520after%2520the,folders%2520stored%2520in%2520a%2520volume.&sa=D&source=editors&ust=1746753758626878&usg=AOvVaw3U0vvJT30nmA8qfNuxNpXX)
23.  Master Directory Blocks (IM: F) - Inside Macintosh, accessed May 6, 2025, [https://dev.os9.ca/techpubs/mac/Files/Files-102.html](https://www.google.com/url?q=https://dev.os9.ca/techpubs/mac/Files/Files-102.html&sa=D&source=editors&ust=1746753758627307&usg=AOvVaw1jVSZaiyiZvZi4sF8OPGBE)
24.  Volume Bitmaps (IM: F) - Inside Macintosh, accessed May 6, 2025, [https://dev.os9.ca/techpubs/mac/Files/Files-103.html](https://www.google.com/url?q=https://dev.os9.ca/techpubs/mac/Files/Files-103.html&sa=D&source=editors&ust=1746753758627674&usg=AOvVaw38GdB1MNZ_rfFCC60EaJu-)
25.  MacFS: A Portable Macintosh File System Library, accessed May 6, 2025, [http://m.cs.berkeley.edu/~necula/Papers/macfs98.pdf](https://www.google.com/url?q=http://m.cs.berkeley.edu/~necula/Papers/macfs98.pdf&sa=D&source=editors&ust=1746753758628056&usg=AOvVaw1oatZEnNFdF2l2Y-otAzqv)
26.  SOURCEBOOK - Vintage Apple, accessed May 6, 2025, [https://vintageapple.org/macprogramming/pdf/The\_Programmers\_Apple\_Mac\_Sourcebook\_1989.pdf](https://www.google.com/url?q=https://vintageapple.org/macprogramming/pdf/The_Programmers_Apple_Mac_Sourcebook_1989.pdf&sa=D&source=editors&ust=1746753758628487&usg=AOvVaw0Pyg3Y9YiTvsJcUtv31w8i)
27.  GFF Format Summary: Macintosh Paint, accessed May 6, 2025, [https://netghost.narod.ru/gff/graphics/summary/macpaint.htm](https://www.google.com/url?q=https://netghost.narod.ru/gff/graphics/summary/macpaint.htm&sa=D&source=editors&ust=1746753758628902&usg=AOvVaw02eZn-IKQKj4nU6xR1ezna)
28.  What Is Metadata? Metadata Definition - Komprise, accessed May 6, 2025, [https://www.komprise.com/glossary\_terms/metadata/](https://www.google.com/url?q=https://www.komprise.com/glossary_terms/metadata/&sa=D&source=editors&ust=1746753758629331&usg=AOvVaw2lVsiHtLhXv6pYR0iTLV0X)
29.  MacPaint - Wikipedia, accessed May 6, 2025, [https://en.wikipedia.org/wiki/MacPaint](https://www.google.com/url?q=https://en.wikipedia.org/wiki/MacPaint&sa=D&source=editors&ust=1746753758629671&usg=AOvVaw31wSM2ICZdGzK34yru_r9C)
30.  MacPaint - Wikiwand, accessed May 6, 2025, [https://www.wikiwand.com/en/articles/MacPaint](https://www.google.com/url?q=https://www.wikiwand.com/en/articles/MacPaint&sa=D&source=editors&ust=1746753758629977&usg=AOvVaw1bqJZ6rT0ga7U8666xWrrP)
31.  DataView - JavaScript - MDN Web Docs, accessed May 6, 2025, [https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global\_Objects/DataView](https://www.google.com/url?q=https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/DataView&sa=D&source=editors&ust=1746753758630411&usg=AOvVaw0VEEXpKA_wbv3xUE1uXx0R)
32.  Handling Binary Data with DataView and Buffer - DEV Community, accessed May 6, 2025, [https://dev.to/omriluz1/handling-binary-data-with-dataview-and-buffer-4fd7](https://www.google.com/url?q=https://dev.to/omriluz1/handling-binary-data-with-dataview-and-buffer-4fd7&sa=D&source=editors&ust=1746753758630848&usg=AOvVaw1uzeIMw5RzbOVX302OsHLF)
33.  In Swift, how do I read an existing binary file into an array? - Stack Overflow, accessed May 6, 2025, [https://stackoverflow.com/questions/28991737/in-swift-how-do-i-read-an-existing-binary-file-into-an-array](https://www.google.com/url?q=https://stackoverflow.com/questions/28991737/in-swift-how-do-i-read-an-existing-binary-file-into-an-array&sa=D&source=editors&ust=1746753758631405&usg=AOvVaw3N3iTAMs8tv5_8pBUBruGv)
34.  Xenoxiluna/SwiftyBytes: A binary read/write library written in Swift. - GitHub, accessed May 6, 2025, [https://github.com/Xenoxiluna/SwiftyBytes](https://www.google.com/url?q=https://github.com/Xenoxiluna/SwiftyBytes&sa=D&source=editors&ust=1746753758631808&usg=AOvVaw0hCpUhtW9o4cAUD6TIf-QL)