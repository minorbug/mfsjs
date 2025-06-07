# Guide for LLMs: Using the mfs.js Library

## 1. Introduction

`mfs.js` is a JavaScript library designed to create, read from, and write to Macintosh File System (MFS) formatted disk images. It allows programmatic interaction with MFS volumes, including file and metadata management. This guide provides rules and best practices for Large Language Models (LLMs) when generating code that uses this library.

## 2. Core Concepts

*   **`MFSVolume` Class**: The primary interface to an MFS disk image. All operations are performed through an instance of this class.
*   **`ArrayBuffer`**: The library operates directly on an `ArrayBuffer` that holds the raw bytes of the MFS disk image.
    *   When loading an existing image, an `ArrayBuffer` must be provided.
    *   When creating a new image, the library generates this `ArrayBuffer`.
*   **Synchronous Operations**: All methods of the `MFSVolume` class are synchronous. Ensure any prerequisite asynchronous operations (like loading an image file into an `ArrayBuffer`) are completed before interacting with the library.
*   **File Format Agnostic**: `mfs.js` treats file content (both data and resource forks) as raw sequences of bytes (`ArrayBuffer`). It does **not** understand or process specific file formats (e.g., MacPaint PNTG compression, text encodings). The calling application or LLM is responsible for preparing and interpreting the content of these `ArrayBuffer`s.
*   **MFS Metadata**: Accurate MFS metadata, especially **File Type** and **File Creator** codes, is crucial for files to be correctly recognized by classic Macintosh systems and emulators.

## 3. Instantiation of `MFSVolume`

There are two ways to create an `MFSVolume` instance:

### 3.1. Creating a New, Blank MFS Image

```javascript
// const MFSVolume = require('./mfs.js'); // If in Node.js (mfs.js would need module.exports)
// In browser, mfs.js should be included via <script> tag

const options = {
  create: true,         // Required to create a new image
  sizeKB: 400,          // Optional, defaults to 400KB. Size in kilobytes.
  volumeName: "MyDisk"  // Optional, defaults to "Untitled". Max 27 chars.
};
const mfsVolume = new MFSVolume(options);
console.log("New MFS volume created:", mfsVolume.volumeInfo.volumeName);
```

### 3.2. Loading an Existing MFS Image from an `ArrayBuffer`

```javascript
// Assume 'existingImageArrayBuffer' is an ArrayBuffer containing MFS disk image data
// (e.g., loaded from a file input or fetched).

// const MFSVolume = require('./mfs.js'); // If in Node.js
// In browser, mfs.js should be included via <script> tag

if (existingImageArrayBuffer instanceof ArrayBuffer) {
  const mfsVolume = new MFSVolume(existingImageArrayBuffer);
  console.log("Loaded MFS volume:", mfsVolume.volumeInfo.volumeName);
} else {
  console.error("Error: Provided data is not an ArrayBuffer.");
}
```

## 4. Key API Methods & Usage Rules

All file content for data and resource forks is handled as `ArrayBuffer`. Provide `null` if a fork is empty.

*   **`mfsVolume.createFile(filename, metadata)`**
    *   Creates a new, empty file (both data and resource forks are zero length).
    *   `filename` (string): Name of the file.
    *   `metadata` (object): Must contain:
        *   `type` (string): 4-character File Type code (e.g., `'TEXT'`, `'PNTG'`).
        *   `creator` (string): 4-character File Creator code (e.g., `'MPNT'`, `'MWII'`).
        *   Optional: `folderNum` (number, default 0), `finderFlags` (number, default 0), `creationDate` (Date), `modDate` (Date).
    *   Example:
        ```javascript
        mfsVolume.createFile("Notes.txt", { type: "TEXT", creator: "EDIT" });
        ```

*   **`mfsVolume.writeFile(filename, dataForkContent, resourceForkContent, metadata)`**
    *   Writes a file, creating it if it doesn't exist or overwriting it if it does (current behavior is delete then create).
    *   `filename` (string): Name of the file.
    *   `dataForkContent` (`ArrayBuffer` | `null`): Content for the data fork.
    *   `resourceForkContent` (`ArrayBuffer` | `null`): Content for the resource fork.
    *   `metadata` (object): Same requirements as for `createFile`.
    *   Example (writing a text file):
        ```javascript
        const textEncoder = new TextEncoder();
        const textData = textEncoder.encode("Hello, MFS!").buffer;
        mfsVolume.writeFile("Hello.txt", textData, null, { type: "TEXT", creator: "EDIT" });
        ```

*   **`mfsVolume.readFile(filename, forkType = 'data')`**
    *   Reads the content of a specified fork of a file.
    *   `filename` (string): Name of the file.
    *   `forkType` (string, optional): `'data'` (default) or `'resource'`.
    *   Returns an `ArrayBuffer` containing the fork's content.
    *   Example:
        ```javascript
        const dataContent = mfsVolume.readFile("Hello.txt", 'data');
        const textDecoder = new TextDecoder();
        console.log(textDecoder.decode(dataContent));
        ```

*   **`mfsVolume.listFiles()`**
    *   Returns an array of objects, each describing a file on the volume (name, type, creator, sizes, dates, etc.).
    *   Example:
        ```javascript
        const files = mfsVolume.listFiles();
        files.forEach(file => console.log(file.filename));
        ```

*   **`mfsVolume.getFileInfo(filename)`**
    *   Returns a detailed information object for a specific file, or `null` if not found.

*   **`mfsVolume.deleteFile(filename)`**
    *   Deletes a file from the volume.

*   **`mfsVolume.getDiskImage()`**
    *   Returns the `ArrayBuffer` representing the entire MFS disk image. This can be used to save the image to a file.
    *   Example (conceptual, browser environment for download):
        ```javascript
        // const diskImageBuffer = mfsVolume.getDiskImage();
        // const blob = new Blob([diskImageBuffer], { type: 'application/octet-stream' });
        // const link = document.createElement('a');
        // link.href = URL.createObjectURL(blob);
        // link.download = "my_mfs_disk.dsk";
        // link.click();
        ```

## 5. LLM Responsibilities

When generating code to use `mfs.js`, the LLM must ensure the following:

*   **Content Generation**:
    *   The LLM (or the application logic it generates) is solely responsible for creating the actual byte content for file forks. This includes any file-format-specific structures, headers (like MacPaint's optional 512-byte pattern header), or compression.
    *   `mfs.js` will store whatever `ArrayBuffer` is provided for a fork as-is.
    *   Example: If creating a MacPaint file, the LLM's code must generate the PNTG formatted `ArrayBuffer` (including any desired header and RLE compression if applicable) *before* calling `mfsVolume.writeFile()`.

*   **Metadata Accuracy**:
    *   The LLM **must** provide accurate 4-character `type` and `creator` codes when calling `createFile` or `writeFile`. These are essential for the file system and applications on a Macintosh to identify and open files correctly.
    *   Consult standard Macintosh Type/Creator code lists for appropriate values. For example:
        *   MacPaint: Type `PNTG`, Creator `MPNT`
        *   Plain Text: Type `TEXT`, Creator (e.g., `EDIT` for SimpleText/TeachText, or specific app)
        *   Application: Type `APPL`, Creator (specific to the app)

*   **`ArrayBuffer` Management**:
    *   If loading an existing disk image, the LLM must ensure the `ArrayBuffer` is correctly loaded (e.g., from a user's file selection) *before* it's passed to the `MFSVolume` constructor.
    *   The `mfs.js` library operates synchronously on this buffer.

## 6. Error Handling

Methods in `mfs.js` can throw `Error` objects for various conditions, such as:
*   Invalid MFS signature when loading an image.
*   Disk full (no free allocation blocks).
*   File directory full.
*   File not found.
*   Corrupted file allocation chain.
*   Invalid parameters.

Generated code should ideally include `try...catch` blocks when interacting with the library, especially for write operations or when loading external data.

## 7. Simple Code Examples

**Creating a new disk and adding a text file:**
```javascript
// Assume MFSVolume class is available
try {
  const mfs = new MFSVolume({ create: true, volumeName: "TextDisk" });
  
  const textContent = "This is a test file on an MFS disk.";
  const encoder = new TextEncoder();
  const dataBuffer = encoder.encode(textContent).buffer;
  
  mfs.writeFile("README.TXT", dataBuffer, null, { type: "TEXT", creator: "EDIT" });
  
  console.log("Files on TextDisk:", mfs.listFiles());
  
  // To get the disk image for saving:
  // const diskImage = mfs.getDiskImage(); 
  // (code to save diskImage to a file would go here)

} catch (e) {
  console.error("MFS Example Error:", e.message);
}
```

**Loading a disk and reading a file:**
```javascript
// Assume MFSVolume class and 'myDiskImageBuffer' (an ArrayBuffer) are available
try {
  const mfs = new MFSVolume(myDiskImageBuffer);
  console.log(`Volume "${mfs.volumeInfo.volumeName}" loaded.`);
  
  const fileContentBuffer = mfs.readFile("README.TXT", 'data');
  if (fileContentBuffer) {
    const decoder = new TextDecoder();
    console.log("Content of README.TXT:", decoder.decode(fileContentBuffer));
  } else {
    console.log("README.TXT not found or is empty.");
  }
} catch (e) {
  console.error("MFS Example Error:", e.message);
}
```

By following these guidelines, LLMs can generate more robust and correct code for applications that need to interact with MFS disk images using the `mfs.js` library.