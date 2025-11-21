// --- VENDOR/CUSTOMER APP LOGIC ---

const API_BASE_URL = 'http://localhost:3000';

// Global State Variables
// CRITICAL: Ensure this is a valid location for your map initialization
const initialCoords = { lat: 15.1394, lng: 76.9214 };
let currentUser = null;
let map;
let allVendorsData = {};
const vendorMarkers = {};
let customerMarker = null;

let vendorCurrentLocation = null;
let customerCurrentLocation = null;
let alertInterval = null;
let lastSelectedVendor = null;


// NEW: Global state for Planned Routes
let vendorRoutes = {}; // Stores Polyline objects for vendor routes
let routeMarkers = {}; // Stores Start/End markers for vendor routes

let socket;

// CRITICAL FEATURE: 40+ item Inventory List
const INVENTORY_DB = [
    { name: 'Tomato', img: '🍅' }, { name: 'Onion', img: '🧅' }, { name: 'Potato', img: '🥔' },
    { name: 'Cabbage', img: '🥬' }, { name: 'Carrot', img: '🥕' }, { name: 'Spinach', img: '🌿' },
    { name: 'Brinjal', img: '🍆' }, { name: 'Radish', img: '🤍' }, { name: 'Beetroot', img: '🍠' },
    { name: 'Lady Finger', img: '🟢' }, { name: 'Bitter Gourd', img: '🥒' }, { name: 'Bottle Gourd', img: '🫙' },
    { name: 'Ridge Gourd', img: '🌱' }, { name: 'Pumpkin', img: '🎃' }, { name: 'Peas', img: '🫛' },
    { name: 'Beans', img: '🫘' }, { name: 'Mushroom', img: '🍄' }, { name: 'Ginger', img: '🫚' },
    { name: 'Garlic', img: '🧄' }, { name: 'Chilli', img: '🌶️' }, { name: 'Capsicum', img: ' Bell' },
    { name: 'Banana', img: '🍌' }, { name: 'Apple', img: '🍎' }, { name: 'Orange', img: '🍊' },
    { name: 'Grapes', img: '🍇' }, { name: 'Mango', img: '🥭' }, { name: 'Papaya', img: '🥭' },
    { name: 'Pomegranate', img: '🍎' }, { name: 'Guava', img: '🍐' }, { name: 'Coconut', img: '🥥' },
    { name: 'Lemon', img: '🍋' }, { name: 'Mosambi', img: '🍊' }, { name: 'Watermelon', img: '🍉' },
    { name: 'Muskmelon', img: '🍈' }, { name: 'Strawberry', img: '🍓' }, { name: 'Pineapple', img: '🍍' },
    { name: 'Sweet Potato', img: '🍠' }, { name: 'Tamarind', img: '🟤' }, { name: 'Drumstick', img: '🪵' },
    { name: 'Curry Leaves', img: '🍃' },
];

function getItemEmoji(itemName) {
    const item = INVENTORY_DB.find(item => item.name.toLowerCase().includes(itemName.toLowerCase()));
    return item ? item.img : '📦';
}
// --- Helper for Vendor Marker (FIX: Unified Marker Logic) ---
/**
 * Creates or updates the vendor's map marker with the correct style based on selling status.
 * @param {string} vendorPhone
 * @param {boolean} isSelling - true for LIVE (Green Truck), false for OFFLINE (Orange Dot)
 * @param {{lat: number, lng: number}} location
 */
function updateVendorMarkerStyle(vendorPhone, isSelling, location) {
    if (!location) return;

    let pinContent;
    let pinTitle;

    if (isSelling) {
        // Live (Green Pin with Truck Emoji)
        pinContent = new google.maps.marker.PinElement({
            glyph: '🚚',
            background: '#00c853', // Deep Green
            borderColor: '#00893f',
            scale: 1.5,
        }).element;
        pinTitle = 'You are Live (Selling)';
    } else {
        // Offline (Orange Dot)
        const pinElement = document.createElement('div');
        pinElement.style.width = '15px';
        pinElement.style.height = '15px';
        pinElement.style.backgroundColor = '#ff9800'; // Accent Orange
        pinElement.style.borderRadius = '50%';
        pinElement.style.border = '2px solid #fff';
        pinElement.style.boxShadow = '0 1px 3px rgba(0,0,0,0.4)';
        pinContent = pinElement;
        pinTitle = 'Your Current Spot (Offline)';
    }

    // 2. Create or Update Marker
    if (vendorMarkers[vendorPhone]) {
        // The AdvancedMarkerElement content setter requires a DOM element, 
        // which we get from pinContent
        vendorMarkers[vendorPhone].position = location;
        vendorMarkers[vendorPhone].content = pinContent;
        vendorMarkers[vendorPhone].title = pinTitle;
        // Ensure the marker is visible if it was previously hidden
        vendorMarkers[vendorPhone].map = map;
    } else {
        vendorMarkers[vendorPhone] = new google.maps.marker.AdvancedMarkerElement({
            position: location,
            map: map,
            content: pinContent,
            title: pinTitle,
        });
    }

    map.setCenter(location);
}

// --- GEOLOCATION & MAP FUNCTIONS ---

// Haversine formula 
const getDistance = (lat1, lon1, lat2, lon2) => {
    const R = 6371; // Radius of the earth in km
    const dLat = (lat2 - lat1) * (Math.PI / 180);
    const dLon = (lon2 - lon1) * (Math.PI / 180);
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
};

// CRITICAL: Geocoding Helper (uses Google's service)
function geocodeAddress(address) {
    return new Promise((resolve, reject) => {
        // Must ensure map is initialized before calling Geocoder
        if (!map) return reject(new Error('Map not initialized.'));
        const geocoder = new google.maps.Geocoder();
        // Set 'bounds' to focus the search near Ballari for better results
        const bounds = new google.maps.LatLngBounds(
            new google.maps.LatLng(15.0, 76.8), // SW corner (approx)
            new google.maps.LatLng(15.3, 77.1)  // NE corner (approx)
        );

        geocoder.geocode({ 'address': address, 'bounds': bounds }, (results, status) => {
            if (status === 'OK') {
                const lat = results[0].geometry.location.lat();
                const lng = results[0].geometry.location.lng();
                resolve({ lat, lng });
            } else {
                // Return the specific error status for debugging
                reject(new Error(`Geocode failed for "${address}": ${status}`));
            }
        });
    });
}


function initMap() {
    map = new google.maps.Map(document.getElementById('map'), {
        zoom: 15,
        center: initialCoords,
        mapId: 'BALLARI_MAP_ID'
    });

    socket = io(API_BASE_URL);
    socket.on('vendorUpdate', handleVendorUpdate);

    if (currentRole === 'vendor') {
        socket.on('newRequest', handleNewRequestNotification);
        // Start watching vendor's current location immediately after map loads
        watchVendorLocation();
    } else if (currentRole === 'customer') {
        watchCustomerLocation();
        // Vendors will be loaded after successful customer login
    }
}


function watchCustomerLocation() {
    if (navigator.geolocation) {
        navigator.geolocation.watchPosition((position) => {
            customerCurrentLocation = {
                lat: position.coords.latitude,
                lng: position.coords.longitude,
            };
            if (!customerMarker) {
                const pinElement = document.createElement('div');
                pinElement.style.width = '20px';
                pinElement.style.height = '20px';
                pinElement.style.backgroundColor = '#1565c0';
                pinElement.style.borderRadius = '50%';
                pinElement.style.border = '3px solid #fff';
                pinElement.style.boxShadow = '0 1px 3px rgba(0,0,0,0.4)';

                customerMarker = new google.maps.marker.AdvancedMarkerElement({
                    position: customerCurrentLocation,
                    map: map,
                    content: pinElement,
                    title: 'Your Location'
                });
            } else {
                customerMarker.position = customerCurrentLocation;
            }
            map.setCenter(customerCurrentLocation);

            // Only load vendors if customer is logged in
            if (currentUser && currentRole === 'customer') {
                loadVendors(document.getElementById('itemSearch').value);
            }
        }, (error) => {
            console.error('Geolocation Error:', error);
        }, { enableHighAccuracy: true, maximumAge: 0, timeout: 5000 });
    } else {
        alert('Geolocation is not supported by your browser.');
    }
}

function watchVendorLocation() {
    if (navigator.geolocation) {
        navigator.geolocation.watchPosition((position) => {
            vendorCurrentLocation = {
                lat: position.coords.latitude,
                lng: position.coords.longitude,
            };

            // CRITICAL FIX: Only attempt to access user properties if logged in
            if (!currentUser) {
                console.log('Vendor location updated, but user is not logged in. Marker skipped.');
                return;
            }

            // FIX: Use the unified helper to create/update the marker 
            // based on the current selling state (LIVE or OFFLINE)
            updateVendorMarkerStyle(currentUser.phone, currentUser.isSelling, vendorCurrentLocation);

        }, (error) => {
            console.error('Vendor Geolocation Error:', error);
        }, { enableHighAccuracy: true, maximumAge: 0, timeout: 5000 });
    } else {
        alert('Geolocation is not supported by your browser.');
    }
}


// --- VENDOR-SPECIFIC LOGIC ---

// NEW: Handle Set Planned Route
async function handleSetRoute() {
    if (!currentUser) return alert('Please log in first.');

    const startName = document.getElementById('routeStartName').value.trim();
    const endName = document.getElementById('routeEndName').value.trim();

    if (!startName || !endName) {
        return alert('Please enter both a start and an end location name.');
    }

    try {
        // Geocode both addresses
        const startCoords = await geocodeAddress(startName);
        const endCoords = await geocodeAddress(endName);

        const response = await fetch(`${API_BASE_URL}/api/vendor/set-route`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                phone: currentUser.phone,
                routeStartName: startName,
                routeEndName: endName,
                routeStartLat: startCoords.lat,
                routeStartLng: startCoords.lng,
                routeEndLat: endCoords.lat,
                routeEndLng: endCoords.lng
            })
        });

        const result = await response.json();

        if (result.success) {
            alert('Planned route set and broadcasted successfully! (It will be visible to customers when you go live)');
            // Update local user state
            currentUser.routeStartName = startName;
            currentUser.routeEndName = endName;
        } else {
            throw new Error(result.message);
        }
    } catch (error) {
        console.error('Set Route Error:', error);
        alert('Failed to set route: ' + error.message);
    }
}


async function handleStartSelling() {
    if (!currentUser || !vendorCurrentLocation) {
        return alert('Please log in and ensure location services are enabled.');
    }

    const selectedItems = Array.from(document.querySelectorAll('#menuSelection input:checked'))
        .map(checkbox => checkbox.value);

    if (selectedItems.length === 0) {
        return alert('Please select the items you are selling before going live.');
    }

    try {
        const response = await fetch(`${API_BASE_URL}/api/vendor/start-selling`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                phone: currentUser.phone,
                lat: vendorCurrentLocation.lat,
                lng: vendorCurrentLocation.lng,
                menu: selectedItems
            })
        });

        const result = await response.json();

        if (result.success) {
            // FIX: Immediately update the pin style to LIVE (green pin with truck emoji)
            updateVendorMarkerStyle(currentUser.phone, true, vendorCurrentLocation);
            alert('You are now LIVE and tracking! Your menu is set.');
            currentUser.isSelling = true;
            document.getElementById('btnStartSelling').style.display = 'none';
            document.getElementById('btnEndSelling').style.display = 'block';
        } else {
            throw new Error(result.message);
        }
    } catch (error) {
        console.error('Start Selling Error:', error);
        alert('Failed to start selling. Check server status or browser console.');
    }
}

async function handleEndSelling() {
    if (!currentUser) return;

    try {
        const response = await fetch(`${API_BASE_URL}/api/vendor/end-selling`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone: currentUser.phone })
        });

        const result = await response.json();

        if (result.success) {
            // FIX: Update the marker style to OFFLINE (orange dot) immediately
            if (vendorCurrentLocation) {
                updateVendorMarkerStyle(currentUser.phone, false, vendorCurrentLocation);
            } else {
                // Fallback to removing the marker if location is unknown
                if (vendorMarkers[currentUser.phone]) {
                    vendorMarkers[currentUser.phone].map = null;
                    delete vendorMarkers[currentUser.phone];
                }
            }
            alert('You are now OFFLINE. Tracking stopped and pin removed.');
            currentUser.isSelling = false;
            document.getElementById('btnStartSelling').style.display = 'block';
            document.getElementById('btnEndSelling').style.display = 'none';

            if (vendorMarkers[currentUser.phone]) {
                vendorMarkers[currentUser.phone].map = null;
                delete vendorMarkers[currentUser.phone];
            }
        } else {
            throw new Error(result.message);
        }
    } catch (error) {
        console.error('End Selling Error:', error);
        alert('Failed to end selling: ' + error.message);
    }
}

async function viewRequests() {
    if (!currentUser) return alert('Please log in first.');

    const requestsPanel = document.getElementById('requestsPanel');
    const requestsList = document.getElementById('requestsList');
    requestsPanel.style.display = 'block';
    requestsList.innerHTML = 'Loading requests...';

    try {
        const response = await fetch(`${API_BASE_URL}/api/vendor/requests?phone=${currentUser.phone}`);
        const result = await response.json();

        if (result.success) {
            if (result.data.length === 0) {
                requestsList.innerHTML = '<p>No pending customer requests.</p>';
                return;
            }

            let html = '<p style="font-weight: bold;">New/Pending Requests:</p>';
            html += '<table><thead><tr><th>Customer</th><th>Details</th><th>Location</th><th>Time</th></tr></thead><tbody>';
            result.data.forEach(req => {
                html += `
                    <tr data-request-id="${req._id}">
                        <td>${req.customerName} (${req.customerPhone})</td>
                        <td>${req.details}</td>
                        <td><button class="google-button btn-zoom" style="background-color: var(--secondary-blue); padding: 5px 10px;" data-lat="${req.customerLat}" data-lng="${req.customerLng}" data-name="${req.customerName}">Zoom to Location</button></td>
                        <td>${new Date(req.createdAt).toLocaleTimeString()}</td>
                    </tr>
                `;
            });
            html += '</tbody></table>';
            requestsList.innerHTML = html;

            document.querySelectorAll('.btn-zoom').forEach(button => {
                button.addEventListener('click', (e) => {
                    const lat = parseFloat(e.target.dataset.lat);
                    const lng = parseFloat(e.target.dataset.lng);
                    const name = e.target.dataset.name;
                    zoomToLocation(lat, lng, name);
                });
            });

        } else {
            throw new Error(result.message);
        }
    } catch (error) {
        console.error('Error fetching requests:', error);
        requestsList.innerHTML = '<p>Failed to load requests.</p>';
    }
}

async function viewFeedback() {
    if (!currentUser) return alert('Please log in first.');

    const requestsPanel = document.getElementById('requestsPanel');
    const requestsList = document.getElementById('requestsList');
    requestsPanel.style.display = 'block';
    requestsList.innerHTML = 'Loading feedback...';

    try {
        const response = await fetch(`${API_BASE_URL}/api/vendor/feedback?phone=${currentUser.phone}`);
        const result = await response.json();

        if (result.success) {
            if (result.data.length === 0) {
                requestsList.innerHTML = '<p>No customer feedback yet.</p>';
                return;
            }

            let html = `
                <h4>Average Rating: <span style="color: var(--primary-green);">${result.averageRating} ⭐</span> (${result.data.length} total reviews)</h4>
                <hr>
                <table>
                    <thead>
                        <tr><th>Customer</th><th>Rating</th><th>Comment</th><th>Date</th></tr>
                    </thead>
                    <tbody>
            `;

            result.data.forEach(f => {
                html += `
                    <tr>
                        <td>${f.customerName}</td>
                        <td>${'⭐'.repeat(f.rating)} (${f.rating}/5)</td>
                        <td>${f.comment || 'No comment'}</td>
                        <td>${new Date(f.createdAt).toLocaleDateString()}</td>
                    </tr>
                `;
            });

            html += '</tbody></table>';
            requestsList.innerHTML = html;

        } else {
            throw new Error(result.message);
        }
    } catch (error) {
        console.error('Error fetching feedback:', error);
        requestsList.innerHTML = '<p>Failed to load feedback.</p>';
    }
}

function zoomToLocation(lat, lng, name) {
    document.getElementById('requestsPanel').style.display = 'none';
    const location = { lat, lng };
    map.setCenter(location);
    map.setZoom(18);
    const pinElement = document.createElement('div');
    pinElement.innerHTML = '📍';
    pinElement.style.fontSize = '30px';
    const tempMarker = new google.maps.marker.AdvancedMarkerElement({
        position: location,
        map: map,
        content: pinElement,
        title: `Request from ${name}`,
    });
    // Remove the temporary marker after 5 seconds
    setTimeout(() => { tempMarker.map = null; }, 5000);
}

function handleNewRequestNotification(request) {
    alert(`🔔 NEW CUSTOMER REQUEST from ${request.customerName}! Click 'View Requests' to see details.`);
}

// --- CUSTOMER-SPECIFIC LOGIC ---

// NEW: Function to draw the vendor's planned route
function drawVendorRoute(vendor) {
    const phone = vendor.phone;

    // Clear existing route elements
    if (vendorRoutes[phone]) {
        vendorRoutes[phone].setMap(null);
        delete vendorRoutes[phone];
    }
    if (routeMarkers[phone]) {
        routeMarkers[phone].forEach(m => m.map = null);
        delete routeMarkers[phone];
    }

    // Only draw if route coordinates exist
    if (vendor.routeStartLat && vendor.routeEndLat) {
        const start = { lat: vendor.routeStartLat, lng: vendor.routeStartLng };
        const end = { lat: vendor.routeEndLat, lng: vendor.routeEndLng };

        // 1. Draw the Polyline
        vendorRoutes[phone] = new google.maps.Polyline({
            path: [start, end],
            geodesic: true,
            strokeColor: '#ff9800', // Orange color for planned route
            strokeOpacity: 0.8,
            strokeWeight: 4,
            map: map,
        });

        // 2. Add Start/End Markers (SIMPLE PINS HERE)
        routeMarkers[phone] = [];

        // START MARKER: Simple Blue Pin
        const startMarker = new google.maps.marker.AdvancedMarkerElement({
            position: start,
            map: map,
            title: `Route Start: ${vendor.routeStartName}`,
            content: new google.maps.marker.PinElement({
                // No glyph for a simple pin
                background: '#4285f4', // Google Blue
                borderColor: '#1565c0',
                scale: 1.0,
            }).element,
        });

        // END MARKER: Simple Red Pin
        const endMarker = new google.maps.marker.AdvancedMarkerElement({
            position: end,
            map: map,
            title: `Route End: ${vendor.routeEndName}`,
            content: new google.maps.marker.PinElement({
                // No glyph for a simple pin
                background: '#db4437', // Google Red
                borderColor: '#c53929',
                scale: 1.0,
            }).element,
        });

        routeMarkers[phone].push(startMarker, endMarker);
    }
}


function handleVendorUpdate(vendorData) {
    if (vendorData.phone === undefined) return;

    if (currentRole === 'customer') {
        if (vendorData.selling) {
            // Vendor went LIVE or MOVED
            allVendorsData[vendorData.phone] = vendorData;
            // drawVendorRoute(vendorData); // Draw/Update the planned route

            const pos = { lat: vendorData.lat, lng: vendorData.lng };

            // Check if marker exists for movement update
            if (vendorMarkers[vendorData.phone]) {
                vendorMarkers[vendorData.phone].position = pos;
            } else {
                // Create a new marker
                const emoji = getItemEmoji(vendorData.menu[0] || 'Vegetable');

                vendorMarkers[vendorData.phone] = new google.maps.marker.AdvancedMarkerElement({
                    position: pos,
                    map: map,
                    title: vendorData.name,
                    // FIX: Replaced 'glyph' with 'glyphText'
                    content: new google.maps.marker.PinElement({
                        glyph: emoji,
                        background: '#4CAF50', // Light Green
                        borderColor: '#2E7D32',
                        scale: 1.2,
                    }).element,
                });

                // Attach click listener for customer sidebar details
                vendorMarkers[vendorData.phone].addListener('click', () => {
                    displayVendorDetails(vendorData.phone);
                });
            }
        } else {
            // Vendor went OFFLINE (selling: false) - Remove marker and route
            if (vendorMarkers[vendorData.phone]) {
                vendorMarkers[vendorData.phone].map = null;
                delete vendorMarkers[vendorData.phone];
                delete allVendorsData[vendorData.phone]; // Remove from active list
            }
            if (vendorRoutes[vendorData.phone]) {
                vendorRoutes[vendorData.phone].setMap(null);
                delete vendorRoutes[vendorData.phone];
            }
            if (routeMarkers[vendorData.phone]) {
                routeMarkers[vendorData.phone].forEach(m => m.map = null);
                delete routeMarkers[vendorData.phone];
            }
        }
    } else if (currentRole === 'vendor' && currentUser && vendorData.phone === currentUser.phone) {
        if (vendorData.selling) {
            // The vendor's own location is handled by the simulation interval
            // The purpose here is to confirm the update.
            if (vendorMarkers[vendorData.phone]) {
                vendorMarkers[vendorData.phone].position = { lat: vendorData.lat, lng: vendorData.lng };
            }
            map.setCenter({ lat: vendorData.lat, lng: vendorData.lng });
        }
    }
}

async function loadVendors(searchQuery = '') {
    if (!customerCurrentLocation) {
        document.getElementById('searchStatus').textContent = 'Please enable location to search nearby vendors.';
        return;
    }

    document.getElementById('searchStatus').textContent = 'Searching...';

    // Clear existing markers/routes on new search
    Object.values(vendorMarkers).forEach(m => m.map = null);
    Object.keys(vendorMarkers).forEach(key => delete vendorMarkers[key]);
    Object.values(vendorRoutes).forEach(r => r.setMap(null));
    Object.keys(vendorRoutes).forEach(key => delete vendorRoutes[key]);
    Object.values(routeMarkers).forEach(m => m.forEach(mark => mark.map = null));
    Object.keys(routeMarkers).forEach(key => delete routeMarkers[key]);
    allVendorsData = {};
    document.getElementById('vendorDetails').style.display = 'none'; // Hide details panel

    try {
        const searchParam = searchQuery ? `&search=${encodeURIComponent(searchQuery)}` : '';
        const response = await fetch(`${API_BASE_URL}/api/customer/vendors?lat=${customerCurrentLocation.lat}&lng=${customerCurrentLocation.lng}${searchParam}`);
        const result = await response.json();

        if (!result.success) throw new Error(result.message);

        result.vendors.forEach(vendor => {
            allVendorsData[vendor.phone] = vendor;

            const pos = { lat: vendor.lat, lng: vendor.lng };
            const emoji = getItemEmoji(vendor.menu[0] || 'Vegetable');

            const marker = new google.maps.marker.AdvancedMarkerElement({
                position: pos,
                map: map,
                title: vendor.name,
                content: new google.maps.marker.PinElement({
                    glyph: emoji,
                    background: '#4CAF50', // Light Green
                    borderColor: '#2E7D32',
                    scale: 1.2,
                }).element,
            });

            // Attach click listener for customer sidebar details
            marker.addListener('click', () => {
                displayVendorDetails(vendor.phone);
            });

            vendorMarkers[vendor.phone] = marker;
            // drawVendorRoute(vendor); // Draw their planned route
        });

        document.getElementById('searchStatus').textContent = `Found ${result.vendors.length} live vendor(s) nearby.`;
    } catch (error) {
        console.error('Error loading vendors:', error);
        document.getElementById('searchStatus').textContent = 'Failed to load vendors.';
    }
}

function displayVendorDetails(phone) {
    const vendor = allVendorsData[phone];
    if (!vendor) return;

    // --- TOGGLE LOGIC ---
    if (lastSelectedVendor === phone) {
        // SAME vendor clicked again → HIDE EVERYTHING
        document.getElementById('vendorDetails').style.display = 'none';

        // Remove route polyline
        if (vendorRoutes[phone]) {
            vendorRoutes[phone].setMap(null);
            delete vendorRoutes[phone];
        }

        // Remove route markers
        if (routeMarkers[phone]) {
            routeMarkers[phone].forEach(m => m.setMap(null));
            delete routeMarkers[phone];
        }

        lastSelectedVendor = null;
        return;
    }

    // Different vendor clicked → Clear previous vendor's route
    Object.keys(vendorRoutes).forEach(k => {
        vendorRoutes[k].setMap(null);
        delete vendorRoutes[k];
    });

    Object.keys(routeMarkers).forEach(k => {
        routeMarkers[k].forEach(m => m.setMap(null));
        delete routeMarkers[k];
    });

    lastSelectedVendor = phone;

    // --- Populate UI ---
    document.getElementById('vendorName').textContent = vendor.name;
    document.getElementById('vendorPhone').textContent = `Call: ${vendor.phone}`;
    document.getElementById('vendorMenu').textContent = (vendor.menu || []).join(', ');

    ['btnAlert', 'btnSendRequest', 'btnSendFeedback'].forEach(id => {
        const btn = document.getElementById(id);
        if (btn) {
            btn.dataset.vendorPhone = phone;
            btn.dataset.vendorName = vendor.name;
        }
    });

    document.getElementById('vendorDetails').style.display = 'block';

    // --- Draw route for THIS vendor ---
    drawVendorRoute(vendor);

    // --- Fit map to route if available ---
    if (vendor.routeStartLat && vendor.routeEndLat) {
        const bounds = new google.maps.LatLngBounds();
        bounds.extend(new google.maps.LatLng(vendor.routeStartLat, vendor.routeStartLng));
        bounds.extend(new google.maps.LatLng(vendor.routeEndLat, vendor.routeEndLng));
        map.fitBounds(bounds);
    } else if (vendor.lat && vendor.lng) {
        map.setCenter({ lat: vendor.lat, lng: vendor.lng });
        map.setZoom(17);
    }
}


function set150mAlert(vendorPhone, vendorName) {
    const vendor = allVendorsData[vendorPhone];
    if (!vendor) return;

    // Clear previous alert interval if it exists
    if (alertInterval) {
        clearInterval(alertInterval);
    }

    alertInterval = setInterval(() => {
        if (!customerCurrentLocation) return;
        const distanceMeters = getDistance(
            customerCurrentLocation.lat,
            customerCurrentLocation.lng,
            vendor.lat,
            vendor.lng
        ) * 1000;

        if (distanceMeters <= 150) {
            clearInterval(alertInterval);
            alert(`🚨 VENDOR ALERT! ${vendorName} is now within ${distanceMeters.toFixed(0)} meters!`);
            // Optionally, clear alertInterval after triggering
            alertInterval = null;
        }
    }, 5000);

    alert(`Alert set for ${vendorName}. You will be notified when they are within 150 meters.`);
}

async function sendVendorRequest(vendorPhone, vendorName) {
    if (!currentUser) return alert('Please log in first.');
    if (!customerCurrentLocation) return alert('Please wait for your live location to be detected.');

    const requestDetails = prompt(`Enter a brief description of what you need from ${vendorName}:`);

    if (requestDetails === null || requestDetails.trim() === '') {
        return; // User cancelled or left blank
    }

    // Simplification: Area name is a placeholder
    const areaName = "Near Customer's Location";

    try {
        const response = await fetch(`${API_BASE_URL}/api/customer/request`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                vendorPhone: vendorPhone,
                vendorName: vendorName,
                customerName: currentUser.name,
                customerPhone: currentUser.phone,
                details: requestDetails,
                area: areaName,
                customerLat: customerCurrentLocation.lat,
                customerLng: customerCurrentLocation.lng
            })
        });

        const result = await response.json();

        if (!result.success) throw new Error(result.message);

        alert(`Your request has been sent to ${vendorName}! They have been notified.`);

    } catch (error) {
        console.error('Send Request Error:', error);
        alert('Failed to send request: ' + error.message);
    }
}

async function sendVendorFeedback(vendorPhone, vendorName) {
    if (!currentUser) return alert('Please log in first.');

    const ratingInput = prompt(`Rate your experience with ${vendorName} (1-5 stars):`);
    const ratingValue = parseInt(ratingInput);

    if (ratingInput === null) return; // User cancelled

    if (isNaN(ratingValue) || ratingValue < 1 || ratingValue > 5) {
        if (ratingInput.trim() !== '') {
            alert('Invalid rating. Please enter a number between 1 and 5.');
        }
        return;
    }

    const comment = prompt('Optional: Add a brief comment (e.g., "Great service!").');

    try {
        const response = await fetch(`${API_BASE_URL}/api/customer/feedback`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                vendorPhone: vendorPhone,
                vendorName: vendorName,
                customerName: currentUser.name,
                customerPhone: currentUser.phone,
                rating: ratingValue,
                comment: comment || ''
            })
        });

        const result = await response.json();

        if (!result.success) throw new Error(result.message);

        alert(`Thank you for your feedback for ${vendorName}!`);
    } catch (error) {
        console.error('Send Feedback Error:', error);
        alert('Failed to send feedback: ' + error.message);
    }
}


// --- AUTH & INITIALIZATION ---

function setupMenuSelection() {
    const container = document.getElementById('menuSelection');
    if (!container) return;
    container.innerHTML = INVENTORY_DB.map(item => `
        <label class="item-checkbox-label">
            <input type="checkbox" value="${item.name}">
            ${item.img} ${item.name}
        </label>
    `).join('');
}

function renderVendorUI(vendor) {
    document.getElementById('loginPanel').style.display = 'none';
    document.getElementById('vendorControls').style.display = 'block';
    document.getElementById('userStatusFallback').style.display = 'none';
    document.getElementById('userDisplay').style.display = 'block';
    document.getElementById('userNameDisplay').textContent = vendor.name;

    currentUser = vendor;

    // Show/Hide selling buttons based on current state
    document.getElementById('btnStartSelling').style.display = vendor.isSelling ? 'none' : 'block';
    document.getElementById('btnEndSelling').style.display = vendor.isSelling ? 'block' : 'none';

    setupMenuSelection();

    // Select the current menu items if they exist
    vendor.menu.forEach(itemName => {
        const checkbox = document.querySelector(`#menuSelection input[value="${itemName}"]`);
        if (checkbox) checkbox.checked = true;
    });

    // Populate Route fields if a route is set
    document.getElementById('routeStartName').value = vendor.routeStartName || '';
    document.getElementById('routeEndName').value = vendor.routeEndName || '';

    // Notify server of successful login to track socket ID
    socket.emit('vendor-login-success', { phone: vendor.phone });
}

function renderCustomerUI(customer) {
    document.getElementById('loginPanel').style.display = 'none';
    document.getElementById('customerControls').style.display = 'block';
    document.getElementById('userStatus').textContent = `Logged in as: ${customer.name} (${customer.phone})`;
    currentUser = customer;

    // Clear search status on login
    document.getElementById('searchStatus').textContent = '';

    // Immediately attempt to load vendors on successful customer login
    loadVendors();
}

// Handle login POST request
async function handleAuth(endpoint, phone, password) {
    try {
        const response = await fetch(`${API_BASE_URL}${endpoint}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone, password })
        });

        const result = await response.json();

        if (result.success) {
            alert(`Login successful! Welcome, ${result.user.name}.`);
            if (currentRole === 'vendor') {
                renderVendorUI(result.user);
            } else {
                renderCustomerUI(result.user);
            }
        } else {
            throw new Error(result.message);
        }
    } catch (error) {
        console.error('Login Error:', error);
        alert('Login Failed: ' + error.message);
    }
}


// Handle Registration Button Click (COMMON)
function setupRegistrationListener(btnId, endpoint) {
    const btnRegister = document.getElementById(btnId);
    if (!btnRegister) return;

    btnRegister.addEventListener('click', async () => {
        const name = document.getElementById('registerName').value.trim();
        const phone = document.getElementById('registerPhone').value.trim();
        const password = document.getElementById('registerPassword').value.trim();

        if (!name || !phone || !password) {
            return alert('All fields are required.');
        }

        try {
            const response = await fetch(`${API_BASE_URL}${endpoint}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, phone, password })
            });

            const result = await response.json();

            if (result.success) {
                alert(`Registration successful! Please log in.`);
                // Switch to login form
                document.getElementById('registerForm').style.display = 'none';
                document.getElementById('loginForm').style.display = 'block';
            } else {
                throw new Error(result.message);
            }
        } catch (error) {
            console.error('Registration Error:', error);
            alert('Registration Failed: ' + error.message);
        }
    });
}

// Handle Login Button Click (COMMON)
function setupLoginListener(btnId, endpoint) {
    const btnLogin = document.getElementById(btnId);
    if (!btnLogin) return;

    btnLogin.addEventListener('click', async () => {
        const phone = document.getElementById('loginPhone').value.trim();
        const password = document.getElementById('loginPassword').value.trim();

        if (!phone || !password) {
            return alert('Phone and password are required.');
        }

        handleAuth(endpoint, phone, password);
    });
}


// --- EVENT LISTENERS (Run after DOM is loaded) ---
window.onload = () => {
    // AUTH LISTENERS (COMMON)
    setupRegistrationListener('btnRegister', currentRole === 'vendor' ? '/api/vendor/register' : '/api/customer/register');
    setupLoginListener('btnLogin', currentRole === 'vendor' ? '/api/vendor/login' : '/api/customer/login');

    // AUTH SWITCHERS (COMMON)
    document.getElementById('switchToLogin')?.addEventListener('click', () => {
        document.getElementById('registerForm').style.display = 'none';
        document.getElementById('loginForm').style.display = 'block';
    });

    document.getElementById('switchToRegister')?.addEventListener('click', () => {
        document.getElementById('loginForm').style.display = 'none';
        document.getElementById('registerForm').style.display = 'block';
    });

    // VENDOR: Attach Control Listeners
    if (currentRole === 'vendor') {
        document.getElementById('btnStartSelling')?.addEventListener('click', handleStartSelling);
        document.getElementById('btnEndSelling')?.addEventListener('click', handleEndSelling);
        document.getElementById('btnRequests')?.addEventListener('click', viewRequests);
        // btnUpdateMenu uses the same logic as handleStartSelling but without setting isSelling to true
        document.getElementById('btnUpdateMenu')?.addEventListener('click', handleStartSelling);
        document.getElementById('btnViewFeedback')?.addEventListener('click', viewFeedback);

        // NEW: Route Setter Listener
        document.getElementById('btnSetRoute')?.addEventListener('click', handleSetRoute);
    }

    // CUSTOMER: Attach Search and Detail Listeners
    if (currentRole === 'customer') {
        document.getElementById('btnSearch')?.addEventListener('click', () => {
            const searchQuery = document.getElementById('itemSearch').value;
            loadVendors(searchQuery);
        });

        // Delegate listener for Alert, Request, and Feedback buttons
        document.getElementById('vendorDetails')?.addEventListener('click', (e) => {
            // Traverse up to find a button with an ID starting with 'btn'
            const button = e.target.closest('button[id^="btn"]');
            if (!button) return;

            const phone = button.dataset.vendorPhone;
            const vendor = allVendorsData[phone];
            if (!phone || !vendor) return;

            if (button.id === 'btnAlert') {
                set150mAlert(phone, vendor.name);
            } else if (button.id === 'btnSendRequest') {
                sendVendorRequest(phone, vendor.name);
            } else if (button.id === 'btnSendFeedback') {
                sendVendorFeedback(phone, vendor.name);
            }
        });
    }
};