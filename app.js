document.addEventListener('DOMContentLoaded', () => {
    // DOM Element References
    const dragDropArea = document.getElementById('drag-drop-area');
    const thumbnailsContainer = document.getElementById('thumbnails');
    const cropperImage = document.getElementById('cropper-image');
    const ditherAlgorithmSelect = document.getElementById('dither-algorithm');
    const thresholdOptionsDiv = document.getElementById('threshold-options');
    const thresholdValueInput = document.getElementById('threshold-value');
    const thresholdValueDisplay = document.getElementById('threshold-value-display');
    const bayerOptionsDiv = document.getElementById('bayer-options');
    const bayerMatrixSizeSelect = document.getElementById('bayer-matrix-size');
    const macpaintRatioCheckbox = document.getElementById('macpaint-ratio-checkbox');
    const ditherPreviewCanvas = document.getElementById('dither-preview-canvas');
    const ditherPreviewCtx = ditherPreviewCanvas.getContext('2d');
    const diskSizeInput = document.getElementById('disk-size');
    const volumeNameInput = document.getElementById('volume-name');
    const percentageFullSpan = document.getElementById('percentage-full');
    const saveDiskImageButton = document.getElementById('save-disk-image-button');
    const clearAllButton = document.getElementById('clear-all-button');

    // Cropper.js instance
    let cropper = null;

    // Application State
    const appState = {
        images: [], // { id, file, originalSrc, cropperData, ditherAlgo, ditherParams, pntgBuffer, compressedSize, thumbnailSrc, naturalWidth, naturalHeight }
        selectedImageId: null,
        mfsDiskSizeKB: parseInt(diskSizeInput.value, 10) || 400,
        mfsVolumeName: volumeNameInput.value || 'MyMacPaintDisk'
    };

    // --- Helper Functions ---
    function generateUniqueId() {
        return Date.now().toString(36) + Math.random().toString(36).substring(2);
    }

    function renderThumbnails() {
        thumbnailsContainer.innerHTML = '';
        appState.images.forEach(img => {
            const thumbnailWrapper = document.createElement('div');
            thumbnailWrapper.classList.add('thumbnail-item');
            
            const imgElement = document.createElement('img');
            imgElement.src = img.thumbnailSrc;
            imgElement.alt = img.file.name;
            imgElement.dataset.imageId = img.id;
            imgElement.classList.add('thumbnail-image');
            if (img.id === appState.selectedImageId) {
                imgElement.classList.add('selected');
            }

            const removeButton = document.createElement('button');
            removeButton.textContent = 'Remove';
            removeButton.classList.add('remove-thumbnail-button');
            removeButton.dataset.imageId = img.id;

            thumbnailWrapper.appendChild(imgElement);
            thumbnailWrapper.appendChild(removeButton);
            thumbnailsContainer.appendChild(thumbnailWrapper);
        });
    }

    function loadImageIntoCropperAndState(imageState) {
        appState.selectedImageId = imageState.id;
        cropperImage.src = imageState.originalSrc;
        
        const tempImg = new Image();
        tempImg.onload = () => {
            imageState.naturalWidth = tempImg.naturalWidth;
            imageState.naturalHeight = tempImg.naturalHeight;
            initializeCropper();
            ditherAlgorithmSelect.value = imageState.ditherAlgo;
            handleDitherAlgorithmChange(); // This will also set ditherParams from UI if needed
            if (imageState.ditherAlgo === 'threshold') {
                thresholdValueInput.value = imageState.ditherParams.thresholdValue;
                if (thresholdValueDisplay) thresholdValueDisplay.textContent = imageState.ditherParams.thresholdValue;
            } else if (imageState.ditherAlgo === 'bayer') {
                bayerMatrixSizeSelect.value = imageState.ditherParams.matrixSize;
            }
        };
        tempImg.onerror = () => console.error("Error loading image for cropper:", imageState.originalSrc);
        tempImg.src = imageState.originalSrc;
        renderThumbnails();
    }

    // --- Initialization ---
    function initializeCropper() {
        if (cropper) {
            cropper.destroy();
            cropper = null;
        }
        if (cropperImage.src && cropperImage.src !== '#' && !cropperImage.src.endsWith(window.location.pathname) && cropperImage.src !== window.location.href) {
            const macPaintAspectRatio = 576 / 720;
            const currentAspectRatio = macpaintRatioCheckbox.checked ? macPaintAspectRatio : NaN;
            
            cropper = new Cropper(cropperImage, {
                aspectRatio: currentAspectRatio,
                viewMode: 1,
                autoCropArea: 0.8,
                responsive: true,
                checkCrossOrigin: false,
                cropend: handleCropEnd,
                ready: () => {
                    const selectedImage = appState.images.find(img => img.id === appState.selectedImageId);
                    if (selectedImage && selectedImage.cropperData) {
                        cropper.setData(selectedImage.cropperData);
                    }
                    updateDitheringPreview();
                }
            });
        }
    }
    
    // --- Event Handlers ---
    function handleDragOver(event) {
        event.preventDefault();
        event.stopPropagation();
        dragDropArea.classList.add('dragging');
    }

    function handleDragLeave(event) {
        event.preventDefault();
        event.stopPropagation();
        dragDropArea.classList.remove('dragging');
    }

    function handleDrop(event) {
        event.preventDefault();
        event.stopPropagation();
        dragDropArea.classList.remove('dragging');
        
        const files = event.dataTransfer.files;
        if (files.length > 0) {
            for (const file of files) {
                if (file.type.startsWith('image/')) {
                    const reader = new FileReader();
                    reader.onload = (e) => {
                        const imageId = generateUniqueId();
                        const newImageState = {
                            id: imageId, file, originalSrc: e.target.result, thumbnailSrc: e.target.result,
                            cropperData: null, ditherAlgo: ditherAlgorithmSelect.value,
                            ditherParams: {
                                thresholdValue: parseInt(thresholdValueInput.value, 10),
                                matrixSize: parseInt(bayerMatrixSizeSelect.value, 10)
                            },
                            pntgBuffer: null, compressedSize: null, naturalWidth: 0, naturalHeight: 0
                        };
                        appState.images.push(newImageState);
                        if (!appState.selectedImageId) loadImageIntoCropperAndState(newImageState);
                        else renderThumbnails();
                    };
                    reader.onerror = () => { console.error("Error reading file:", file.name); alert(`Error reading file: ${file.name}`); };
                    reader.readAsDataURL(file);
                } else alert(`File ${file.name} is not a recognized image type.`);
            }
            updatePercentageFull();
        }
    }

    function handleRemoveImageClick(imageIdToRemove) {
        const imageIndex = appState.images.findIndex(img => img.id === imageIdToRemove);
        if (imageIndex > -1) {
            appState.images.splice(imageIndex, 1);
            if (appState.selectedImageId === imageIdToRemove) {
                appState.selectedImageId = null;
                if (cropper) { cropper.destroy(); cropper = null; }
                cropperImage.src = '#';
                ditherPreviewCtx.clearRect(0, 0, ditherPreviewCanvas.width, ditherPreviewCanvas.height);
                if (appState.images.length > 0) loadImageIntoCropperAndState(appState.images[0]);
            }
            renderThumbnails();
            updatePercentageFull();
        }
    }

    function handleThumbnailClick(event) {
        const target = event.target;
        if (target.classList.contains('thumbnail-image')) {
            const imageId = target.dataset.imageId;
            const clickedImageState = appState.images.find(img => img.id === imageId);
            if (clickedImageState && imageId !== appState.selectedImageId) loadImageIntoCropperAndState(clickedImageState);
        } else if (target.classList.contains('remove-thumbnail-button')) {
            const imageIdToRemove = target.dataset.imageId;
            if (confirm(`Are you sure you want to remove this image?`)) handleRemoveImageClick(imageIdToRemove);
        }
    }
    
    function handleClearAllImages() {
        if (appState.images.length === 0) { alert("Image queue is already empty."); return; }
        if (confirm("Are you sure you want to clear all images from the queue? This action cannot be undone.")) {
            appState.images = [];
            appState.selectedImageId = null;
            if (cropper) { cropper.destroy(); cropper = null; }
            cropperImage.src = '#';
            ditherPreviewCtx.clearRect(0, 0, ditherPreviewCanvas.width, ditherPreviewCanvas.height);
            renderThumbnails();
            updatePercentageFull();
        }
    }

    function handleCropEnd() {
        if (!cropper || !appState.selectedImageId) return;
        const selectedImage = appState.images.find(img => img.id === appState.selectedImageId);
        if (selectedImage) {
            selectedImage.cropperData = cropper.getData(true);
            selectedImage.pntgBuffer = null; selectedImage.compressedSize = null;
            updateDitheringPreview(); updatePercentageFull();
        }
    }

    function handleDitherAlgorithmChange() {
        const selectedAlgorithm = ditherAlgorithmSelect.value;
        thresholdOptionsDiv.style.display = selectedAlgorithm === 'threshold' ? 'block' : 'none';
        bayerOptionsDiv.style.display = selectedAlgorithm === 'bayer' ? 'block' : 'none';
        
        if (appState.selectedImageId) {
            const selectedImage = appState.images.find(img => img.id === appState.selectedImageId);
            if (selectedImage) {
                selectedImage.ditherAlgo = selectedAlgorithm;
                if (selectedAlgorithm === 'threshold') {
                    const currentThreshold = parseInt(thresholdValueInput.value, 10);
                    selectedImage.ditherParams = { thresholdValue: currentThreshold };
                    if (thresholdValueDisplay) thresholdValueDisplay.textContent = currentThreshold;
                } else if (selectedAlgorithm === 'bayer') {
                    selectedImage.ditherParams = { matrixSize: parseInt(bayerMatrixSizeSelect.value, 10) };
                } else selectedImage.ditherParams = {};
                selectedImage.pntgBuffer = null; selectedImage.compressedSize = null;
                updateDitheringPreview(); updatePercentageFull();
            }
        }
    }
    
    function handleDitherParamsChange() {
        if (appState.selectedImageId) {
            const selectedImage = appState.images.find(img => img.id === appState.selectedImageId);
            if (selectedImage) {
                if (selectedImage.ditherAlgo === 'threshold') {
                    const currentThreshold = parseInt(thresholdValueInput.value, 10);
                    selectedImage.ditherParams.thresholdValue = currentThreshold;
                    if (thresholdValueDisplay) thresholdValueDisplay.textContent = currentThreshold;
                } else if (selectedImage.ditherAlgo === 'bayer') {
                    selectedImage.ditherParams.matrixSize = parseInt(bayerMatrixSizeSelect.value, 10);
                }
                selectedImage.pntgBuffer = null; selectedImage.compressedSize = null;
                updateDitheringPreview(); updatePercentageFull();
            }
        }
    }

    function updateDitheringPreview() {
        const selectedImageState = appState.images.find(img => img.id === appState.selectedImageId);
        if (!selectedImageState) { ditherPreviewCtx.clearRect(0, 0, ditherPreviewCanvas.width, ditherPreviewCanvas.height); return; }
        if (!cropper || !cropper.canvasData || !cropperImage.src || cropperImage.src === '#' || cropperImage.src.endsWith(window.location.pathname)) return;

        try {
            const croppedCanvas = cropper.getCroppedCanvas();
            if (!croppedCanvas) { console.error("Failed to get cropped canvas."); ditherPreviewCtx.clearRect(0, 0, ditherPreviewCanvas.width, ditherPreviewCanvas.height); return; }

            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = croppedCanvas.width; tempCanvas.height = croppedCanvas.height;
            const tempCtx = tempCanvas.getContext('2d');
            tempCtx.drawImage(croppedCanvas, 0, 0);
            const croppedImageData = tempCtx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);
            
            const imageDataForMacPaintLib = { width: croppedImageData.width, height: croppedImageData.height, data: new Uint8ClampedArray(croppedImageData.data) };

            let ditherStrategyInstance;
            const { ditherAlgo, ditherParams } = selectedImageState;
            switch (ditherAlgo) {
                case 'threshold': ditherStrategyInstance = new ThresholdStrategy({ thresholdValue: ditherParams.thresholdValue }); break;
                case 'atkinson': ditherStrategyInstance = new AtkinsonDitheringStrategy(); break;
                case 'floyd-steinberg': ditherStrategyInstance = new FloydSteinbergDitheringStrategy(); break;
                case 'bayer': ditherStrategyInstance = new BayerDitheringStrategy({ matrixSize: ditherParams.matrixSize }); break;
                default: ditherStrategyInstance = new AtkinsonDitheringStrategy();
            }
            
            const macPaintOptions = { ditheringStrategy: ditherStrategyInstance };
            const tempMacPaintImage = new MacPaintImage(imageDataForMacPaintLib, macPaintOptions);
            
            selectedImageState.pntgBuffer = tempMacPaintImage.toArrayBuffer();
            selectedImageState.compressedSize = selectedImageState.pntgBuffer.byteLength;

            let conformedForPreview = { ...imageDataForMacPaintLib }; 
            if (conformedForPreview.width !== 576 || conformedForPreview.height !== 720) {
                conformedForPreview = ImageUtils.scaleBilinear(conformedForPreview, 576, 720);
            }
            
            const grayscaleObject = ImageUtils.toGrayscale(conformedForPreview);
            const oneBitObject = ditherStrategyInstance.apply(grayscaleObject); 

            const previewImageData = ditherPreviewCtx.createImageData(576, 720);
            const oneBitPackedData = oneBitObject.data; 
            let packedDataIdx = 0;

            if (oneBitPackedData.length !== (576 * 720 / 8)) {
                console.error(`Unexpected 1-bit data length for preview. Expected ${576*720/8}, got ${oneBitPackedData.length}`);
                ditherPreviewCtx.clearRect(0, 0, ditherPreviewCanvas.width, ditherPreviewCanvas.height); return;
            }

            for (let y = 0; y < 720; y++) {
                for (let xByte = 0; xByte < (576 / 8); xByte++) { 
                    const byteVal = oneBitPackedData[packedDataIdx++];
                    for (let bit = 0; bit < 8; bit++) {
                        const currentPixelX = xByte * 8 + bit;
                        const isBlack = (byteVal >> (7 - bit)) & 1; 
                        const colorVal = isBlack ? 0 : 255;
                        const previewIdx = (y * 576 + currentPixelX) * 4;
                        previewImageData.data[previewIdx] = colorVal; previewImageData.data[previewIdx + 1] = colorVal; 
                        previewImageData.data[previewIdx + 2] = colorVal; previewImageData.data[previewIdx + 3] = 255;      
                    }
                }
            }
            ditherPreviewCtx.putImageData(previewImageData, 0, 0);
        } catch (error) {
            console.error("Error updating dithering preview:", error);
            ditherPreviewCtx.clearRect(0, 0, ditherPreviewCanvas.width, ditherPreviewCanvas.height);
            ditherPreviewCtx.fillStyle = 'red'; ditherPreviewCtx.font = '14px Arial';
            ditherPreviewCtx.fillText('Preview Error. See console.', 10, 20);
        }
        updatePercentageFull(); 
    }

    function updatePercentageFull() {
        let totalCompressedSize = 0;
        appState.images.forEach(img => { if (typeof img.compressedSize === 'number') totalCompressedSize += img.compressedSize; });
        const diskSizeBytes = appState.mfsDiskSizeKB * 1024;
        let percentage = 0;
        if (diskSizeBytes > 0 && totalCompressedSize > 0) percentage = (totalCompressedSize / diskSizeBytes) * 100;
        else if (totalCompressedSize > 0 && diskSizeBytes <= 0) percentage = Infinity; 
        percentageFullSpan.textContent = percentage === Infinity ? "N/A (Invalid Disk Size)" : percentage.toFixed(2);
    }

    function handleSaveDiskImage() {
        if (appState.images.length === 0) { alert("No images to save!"); return; }
        if (appState.mfsDiskSizeKB <= 0) { alert("Please enter a valid disk size (KB)."); return; }
        if (!appState.mfsVolumeName.trim()) { alert("Please enter a volume name."); return; }

        let mfsVolume;
        try {
            mfsVolume = new MFSVolume({ create: true, sizeKB: appState.mfsDiskSizeKB, volumeName: appState.mfsVolumeName.substring(0, 27) });
        } catch (error) {
            console.error("Error creating MFSVolume:", error); alert(`Error initializing disk image: ${error.message}`); return;
        }

        let filesWrittenCount = 0; let filesSkippedCount = 0;
        for (let i = 0; i < appState.images.length; i++) {
            const imageState = appState.images[i];
            if (!imageState.pntgBuffer || imageState.pntgBuffer.byteLength === 0) {
                console.warn(`PNTG Buffer for image "${imageState.file.name}" is missing or empty. This image was likely not selected or processed correctly. Skipping.`);
                filesSkippedCount++;
                continue;
            }
            const filename = `Image-${i + 1}.pntg`;
            const metadata = { type: "PNTG", creator: "MPNT" };
            try {
                mfsVolume.writeFile(filename, imageState.pntgBuffer, null, metadata);
                filesWrittenCount++;
            } catch (writeError) {
                console.error(`Error writing file "${filename}" to MFSVolume:`, writeError);
                alert(`Error writing ${filename}: ${writeError.message}. Disk may be full.`);
                filesSkippedCount++;
            }
        }

        if (filesSkippedCount > 0) alert(`${filesSkippedCount} image(s) were skipped due to missing processed data.`);
        if (filesWrittenCount === 0) { alert(appState.images.length > 0 ? "No images were successfully written." : "No images to write."); return; }

        try {
            const diskImageBuffer = mfsVolume.getDiskImage();
            const blob = new Blob([diskImageBuffer], { type: 'application/octet-stream' });
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            const safeVolumeName = appState.mfsVolumeName.replace(/[^a-z0-9_\-\.]/gi, '_');
            link.download = `${safeVolumeName || 'MacPaintDisk'}.dsk`;
            document.body.appendChild(link); link.click(); document.body.removeChild(link);
            URL.revokeObjectURL(link.href);
            alert(`${filesWrittenCount} image(s) saved to ${link.download}`);
        } catch (downloadError) {
            console.error("Error generating/downloading disk image:", downloadError);
            alert(`Error finalizing disk image: ${downloadError.message}`);
        }
    }

    // --- Event Listeners ---
    macpaintRatioCheckbox.addEventListener('change', initializeCropper);
    clearAllButton.addEventListener('click', handleClearAllImages);
    dragDropArea.addEventListener('dragover', handleDragOver);
    dragDropArea.addEventListener('dragleave', handleDragLeave);
    dragDropArea.addEventListener('drop', handleDrop);
    thumbnailsContainer.addEventListener('click', handleThumbnailClick);
    ditherAlgorithmSelect.addEventListener('change', handleDitherAlgorithmChange);
    thresholdValueInput.addEventListener('input', handleDitherParamsChange);
    bayerMatrixSizeSelect.addEventListener('change', handleDitherParamsChange);
    diskSizeInput.addEventListener('change', (e) => { appState.mfsDiskSizeKB = parseInt(e.target.value, 10) || 400; updatePercentageFull(); });
    volumeNameInput.addEventListener('input', (e) => { appState.mfsVolumeName = e.target.value; });
    saveDiskImageButton.addEventListener('click', handleSaveDiskImage);

    // Initial UI setup
    if (thresholdValueDisplay) thresholdValueDisplay.textContent = thresholdValueInput.value;
    handleDitherAlgorithmChange(); 
    initializeCropper(); 
    console.log('MacPaint App Initialized with all features.');
});