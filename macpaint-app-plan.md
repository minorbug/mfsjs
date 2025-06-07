# Project Plan: MacPaint Image Converter and MFS Disk Saver

**Objective**: Create a single-page web application that allows users to drag and drop images, edit them (crop/resize), select dithering options, preview the MacPaint conversion, and save the resulting MacPaint files to a new MFS-formatted disk image.

**Core Libraries**:
*   **Cropper.js**: For interactive image cropping and resizing.
*   **`macpaint.js`**: For converting `ImageData` to MacPaint format (PNTG `ArrayBuffer`), including dithering and PackBits compression.
*   **`mfs.js`**: For creating and writing to MFS disk images.

**Key Features & Implementation Details**:

1.  **User Interface (HTML, CSS, JavaScript)**
    *   **Drag and Drop Area**: A clearly designated area for users to drop image files.
    *   **Image Thumbnail List**:
        *   When images are dropped, generate and display thumbnails.
        *   Each thumbnail represents an image to be processed.
        *   Clicking a thumbnail loads the image into the editing area.
    *   **Editing Area**:
        *   **Cropper.js Instance**: Displays the selected image for cropping/resizing. Cropper.js will be unconstrained; `macpaint.js` will handle conforming its output to 576x720.
        *   **Dithering Options**: UI elements (e.g., dropdown or radio buttons) to select a dithering algorithm (Threshold, Atkinson, Floyd-Steinberg, Bayer). Options for dithering parameters (e.g., threshold value, Bayer matrix size) should also be available.
        *   **Dithering Preview Area**: Displays a 576x720 preview of the *currently selected image* after applying the chosen crop, resize, and dithering.
    *   **Disk Image Management**:
        *   **Disk Size Input**: A way for the user to specify the desired MFS disk image size (e.g., input field for KB).
        *   **Volume Name Input**: An input field for the MFS volume name (max 27 chars).
        *   **Percentage Full Indicator**: Displays how much of the chosen disk image capacity will be used by the currently staged images (based on their *compressed* MacPaint file sizes).
    *   **Action Button**: "Save to Disk Image..." button.

2.  **Image Processing Workflow (JavaScript)**
    *   **State Management**: Maintain an array of image objects. Each object will store:
        *   The original `File` object or `ImageDataObject`.
        *   Current Cropper.js settings.
        *   Selected dithering algorithm and parameters.
        *   Thumbnail URL.
        *   (Lazily) generated MacPaint `ArrayBuffer`.
        *   (Lazily) calculated compressed size.
    *   **Image Drop Handling**:
        *   Read dropped files.
        *   Generate thumbnails.
        *   Add to state.
        *   Load first image into Cropper.js.
    *   **Thumbnail Click**:
        *   Load image/settings into Cropper.js.
        *   Update dither controls.
        *   Trigger preview update.
    *   **Cropper.js Interaction**:
        *   Update crop settings in state.
        *   Trigger preview update.
        *   Trigger "Percentage Full" update.
    *   **Dithering Option Change**:
        *   Update dither settings in state.
        *   Trigger preview update.
        *   Trigger "Percentage Full" update.
    *   **Dithering Preview Generation**:
        *   Get `ImageDataObject` from Cropper.js.
        *   Use `MacPaintImage` instance:
            1.  Conform to 576x720.
            2.  Convert to grayscale.
            3.  Apply dither.
            4.  Convert 1-bit result back to `ImageDataObject` for canvas display.
    *   **Percentage Full Calculation**:
        *   Iterate staged images.
        *   Generate MacPaint `ArrayBuffer` if needed, store buffer & `byteLength`.
        *   Sum `byteLength`s.
        *   Calculate percentage based on user-defined disk size. Update UI.

3.  **Saving to MFS Disk Image (JavaScript)**
    *   On "Save..." click:
        *   Get disk size (KB) and volume name.
        *   Create `MFSVolume` instance (`create: true`, `sizeKB`, `volumeName`).
        *   For each staged image:
            *   Ensure MacPaint `ArrayBuffer` is generated.
            *   Determine unique filename (e.g., `Image-1.pntg`).
            *   `mfsVolume.writeFile(filename, macPaintArrayBuffer, null, { type: "PNTG", creator: "MPNT" })`.
            *   Handle errors (disk full).
        *   `diskImageBuffer = mfsVolume.getDiskImage()`.
        *   Trigger download of `diskImageBuffer` as `.dsk`.

**Workflow Diagram (Mermaid)**:

```mermaid
graph TD
    A[User Drops Images] --> B{Generate Thumbnails & Add to List};
    B --> C{Select Image from List};
    C --> D[Load Image into Cropper.js];
    D -- Crop/Resize Event --> E{Update Image State};
    E --> F[Update Dithering Preview (576x720)];
    E --> G[Update Percentage Full];

    H[User Selects Dithering Option] --> I{Update Image State};
    I --> F;
    I --> G;

    J[User Enters Disk Size/Name] --> K{Update Disk Config};

    L[User Clicks "Save to Disk Image..."] --> M{Create MFSVolume};
    M --> N{For Each Staged Image...};
    N -- Generate MacPaint PNTG ArrayBuffer --> O{mfsVolume.writeFile()};
    O -- All Files Written --> P{mfsVolume.getDiskImage()};
    P --> Q[Trigger Download of .dsk File];

    subgraph "Image Editing & Preview Loop"
        C
        D
        E
        F
        H
        I
    end
```

**Assumptions & Considerations**:

*   `macpaint.js` correctly handles `ImageDataObject` to 576x720 1-bit MacPaint `ArrayBuffer` conversion.
*   `mfs.js` functions as described.
*   Error handling is important (file ops, image processing).
*   Performance: MacPaint `ArrayBuffer` generation might be intensive. Consider debouncing or web workers if needed.
*   Filename generation for MFS needs to be robust.