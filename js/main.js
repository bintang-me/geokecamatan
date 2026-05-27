// main.js
import { parseCoordinates } from './validator.js';
import { reverseGeocode } from './geocoder.js';
import { initMap, updateMapMarker } from './map.js';
import { showLoading, showError, showResult, setInputValue } from './ui.js';

document.addEventListener('DOMContentLoaded', () => {
    
    const searchBtn = document.getElementById('searchBtn');
    const coordInput = document.getElementById('coordInput');

    // Initialize Map
    initMap('map', handleMapLocationChange);

    searchBtn.addEventListener('click', () => {
        processInput(coordInput.value);
    });

    coordInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            processInput(coordInput.value);
        }
    });

    async function processInput(inputStr) {
        const parsed = parseCoordinates(inputStr);
        
        if (!parsed.valid) {
            showError(parsed.error);
            return;
        }

        // Update the input field with the parsed data (e.g. converting 43074395 980496382 to 4.3074395, 98.0496382)
        setInputValue(parsed.lat, parsed.lon);

        // Valid coords
        await doGeocode(parsed.lat, parsed.lon);
        updateMapMarker(parsed.lat, parsed.lon);
    }

    async function handleMapLocationChange(lat, lon) {
        setInputValue(lat, lon);
        await doGeocode(lat, lon);
    }

    async function doGeocode(lat, lon) {
        showLoading();
        
        const result = await reverseGeocode(lat, lon);
        
        if (result.success) {
            showResult(result);
        } else {
            showError(result.error);
        }
    }
});
