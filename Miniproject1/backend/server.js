const express = require('express');
const path = require('path');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const bcrypt = require('bcrypt'); // 👈 NEW: Secure password hashing library

const { connectDB, Vendor, TrackData, Request, Customer, Feedback } = require('./database');

// --- Initialization ---
const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: ['http://127.0.0.1:5500', 'http://localhost:3000'],
        methods: ['GET', 'POST'],
        credentials: true
    }
});
const PORT = 3000;

connectDB();

// --- Middleware ---
app.use(cors({
    origin: ['http://127.0.0.1:5500', 'http://localhost:3000'],
    methods: ['GET', 'POST'],
    credentials: true,
}));

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));


// --- EXPRESS API ROUTES (UPDATED AUTH) ---

// --- VENDOR AUTHENTICATION ---

// 1a. Vendor Registration
app.post('/api/vendor/register', async (req, res) => {
    const { name, phone, password } = req.body;

    // Validate phone and digit-only password
    if (!name || !phone || !password || !/^\d+$/.test(password)) {
        return res.status(400).json({ success: false, message: 'Invalid registration data. Password must be digits only.' });
    }

    try {
        const existingVendor = await Vendor.findOne({ phone });
        if (existingVendor) {
            return res.status(409).json({ success: false, message: 'Phone number already registered.' });
        }

        // Hash the password
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        const newVendor = new Vendor({
            name,
            phone,
            pass: hashedPassword, // Store the hashed password
            selling: false,
            menu: []
        });

        await newVendor.save();

        res.json({ success: true, message: 'Vendor registered successfully. Please log in.' });

    } catch (error) {
        console.error('Vendor Registration Error:', error);
        res.status(500).json({ success: false, message: 'Server error during registration.' });
    }
});

// 1b. Vendor Login
app.post('/api/vendor/login', async (req, res) => {
    const { phone, password } = req.body;

    if (!phone || !password) {
        return res.status(400).json({ success: false, message: 'Phone and Password are required.' });
    }

    try {
        const vendor = await Vendor.findOne({ phone });

        if (!vendor) {
            return res.status(401).json({ success: false, message: 'Invalid phone or password.' });
        }

        // Compare the provided password with the hashed password
        const isMatch = await bcrypt.compare(password, vendor.pass || '');

        if (!isMatch) {
            return res.status(401).json({ success: false, message: 'Invalid phone or password.' });
        }

        // Successfully logged in (only send back safe data)
        const vendorData = {
            name: vendor.name,
            phone: vendor.phone,
            isSelling: vendor.selling,
            menu: vendor.menu,
            // Include route data for UI setup
            routeStartName: vendor.routeStartName,
            routeEndName: vendor.routeEndName,
        };

        // Return isSelling state for script.js to manage UI
        res.json({ success: true, user: vendorData });

    } catch (error) {
        console.error('Vendor Login Error:', error);
        res.status(500).json({ success: false, message: 'Server error during login.' });
    }
});


// --- CUSTOMER AUTHENTICATION ---

// 2a. Customer Registration
app.post('/api/customer/register', async (req, res) => {
    const { name, phone, password } = req.body;

    // Validate phone and digit-only password
    if (!name || !phone || !password || !/^\d+$/.test(password)) {
        return res.status(400).json({ success: false, message: 'Invalid registration data. Password must be digits only.' });
    }

    try {
        const existingCustomer = await Customer.findOne({ phone });
        if (existingCustomer) {
            return res.status(409).json({ success: false, message: 'Phone number already registered.' });
        }

        // Hash the password
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        const newCustomer = new Customer({
            name,
            phone,
            password: hashedPassword // Store the hashed password
        });

        await newCustomer.save();

        res.json({ success: true, message: 'Customer registered successfully. Please log in.' });

    } catch (error) {
        console.error('Customer Registration Error:', error);
        res.status(500).json({ success: false, message: 'Server error during registration.' });
    }
});

// 2b. Customer Login
app.post('/api/customer/login', async (req, res) => {
    const { phone, password } = req.body;

    if (!phone || !password) {
        return res.status(400).json({ success: false, message: 'Phone and Password are required.' });
    }

    try {
        const customer = await Customer.findOne({ phone });

        if (!customer) {
            return res.status(401).json({ success: false, message: 'Invalid phone or password.' });
        }

        // Compare the provided password with the hashed password
        const isMatch = await bcrypt.compare(password, customer.password || '');

        if (!isMatch) {
            return res.status(401).json({ success: false, message: 'Invalid phone or password.' });
        }

        // Successfully logged in (only send back safe data)
        const customerData = {
            name: customer.name,
            phone: customer.phone
        };

        res.json({ success: true, user: customerData });

    } catch (error) {
        console.error('Customer Login Error:', error);
        res.status(500).json({ success: false, message: 'Server error during login.' });
    }
});


// --- VENDOR CONTROLS ---

// 3. Start Selling / Go Live
app.post('/api/vendor/start-selling', async (req, res) => {
    const { phone, lat, lng, menu } = req.body;

    if (!phone || !lat || !lng || !menu || menu.length === 0) {
        return res.status(400).json({ success: false, message: 'Missing vendor or location data.' });
    }

    try {
        const vendor = await Vendor.findOne({ phone });

        if (!vendor) {
            return res.status(404).json({ success: false, message: 'Vendor not found.' });
        }

        vendor.selling = true;
        vendor.lat = lat;
        vendor.lng = lng;
        vendor.menu = menu;
        await vendor.save();

        // Broadcast update to all connected clients
        io.emit('vendorUpdate', vendor);

        res.json({ success: true, message: 'Vendor is now live and tracking.' });

    } catch (error) {
        console.error('Start Selling Error:', error);
        res.status(500).json({ success: false, message: 'Server error when going live.' });
    }
});


// 4. End Selling / Go Offline
app.post('/api/vendor/end-selling', async (req, res) => {
    const { phone } = req.body;

    if (!phone) {
        return res.status(400).json({ success: false, message: 'Missing vendor data.' });
    }

    try {
        const vendor = await Vendor.findOne({ phone });

        if (!vendor) {
            return res.status(404).json({ success: false, message: 'Vendor not found.' });
        }

        vendor.selling = false;
        // Optionally clear coordinates when offline
        vendor.lat = undefined;
        vendor.lng = undefined;
        vendor.menu = []; // Clear menu when offline
        await vendor.save();

        // Broadcast update to all connected clients (to remove marker)
        io.emit('vendorUpdate', { phone: vendor.phone, selling: false });

        res.json({ success: true, message: 'Vendor is now offline.' });

    } catch (error) {
        console.error('End Selling Error:', error);
        res.status(500).json({ success: false, message: 'Server error when going offline.' });
    }
});


// 5. Vendor Route Setting (NEW)
app.post('/api/vendor/set-route', async (req, res) => {
    const { phone, routeStartName, routeEndName, routeStartLat, routeStartLng, routeEndLat, routeEndLng } = req.body;

    if (!phone || !routeStartLat || !routeEndLat) {
        return res.status(400).json({ success: false, message: 'Missing route data.' });
    }

    try {
        const vendor = await Vendor.findOne({ phone });

        if (!vendor) {
            return res.status(404).json({ success: false, message: 'Vendor not found.' });
        }

        vendor.routeStartName = routeStartName;
        vendor.routeEndName = routeEndName;
        vendor.routeStartLat = routeStartLat;
        vendor.routeStartLng = routeStartLng;
        vendor.routeEndLat = routeEndLat;
        vendor.routeEndLng = routeEndLng;
        await vendor.save();

        // Broadcast update so customers can see the route instantly
        io.emit('vendorUpdate', vendor);

        res.json({ success: true, message: 'Vendor route set successfully.' });

    } catch (error) {
        console.error('Set Route Error:', error);
        res.status(500).json({ success: false, message: 'Server error when setting route.' });
    }
});


// 6. Customer Get Nearby Vendors (Search API)
app.get('/api/customer/vendors', async (req, res) => {
    const { lat, lng, search } = req.query;

    if (!lat || !lng) {
        return res.status(400).json({ success: false, message: 'Missing customer location.' });
    }

    const customerLat = parseFloat(lat);
    const customerLng = parseFloat(lng);

    try {
        const query = { selling: true };

        if (search) {
            const regex = new RegExp(search, 'i'); // Case-insensitive search
            query.$or = [
                { name: regex }, // Search by vendor name
                { menu: regex } // Search by item in menu
            ];
        }

        const allActiveVendors = await Vendor.find(query);

        const RADIUS_KM = 1; // 1km radius
        const nearbyVendors = allActiveVendors.filter(vendor => {
            if (vendor.lat === undefined || vendor.lng === undefined) return false;

            // Haversine formula calculation (replicated from client for consistency)
            const R = 6371; // Radius of the earth in km
            const dLat = (vendor.lat - customerLat) * (Math.PI / 180);
            const dLon = (vendor.lng - customerLng) * (Math.PI / 180);
            const a =
                Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                Math.cos(customerLat * (Math.PI / 180)) * Math.cos(vendor.lat * (Math.PI / 180)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
            const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
            const distance = R * c;

            return distance <= RADIUS_KM;

        }).map(vendor => ({
            name: vendor.name,
            phone: vendor.phone,
            lat: vendor.lat,
            lng: vendor.lng,
            menu: vendor.menu,
            routeStartName: vendor.routeStartName,
            routeEndName: vendor.routeEndName,
            routeStartLat: vendor.routeStartLat,
            routeStartLng: vendor.routeStartLng,
            routeEndLat: vendor.routeEndLat,
            routeEndLng: vendor.routeEndLng,
        }));

        res.json({ success: true, vendors: nearbyVendors });

    } catch (error) {
        console.error('Get Vendors Error:', error);
        res.status(500).json({ success: false, message: 'Server error fetching vendors.' });
    }
});


// 7. Customer Send Visit Request (NEW)
app.post('/api/customer/request', async (req, res) => {
    const { vendorPhone, vendorName, customerName, customerPhone, details, area, customerLat, customerLng } = req.body;

    if (!vendorPhone || !customerPhone || !details) {
        return res.status(400).json({ success: false, message: 'Missing required request data.' });
    }

    try {
        const newRequest = new Request({
            vendorPhone,
            vendorName,
            customerName,
            customerPhone,
            details,
            area,
            customerLat,
            customerLng
        });
        await newRequest.save();

        // Notify the specific vendor via socket
        const vendor = await Vendor.findOne({ phone: vendorPhone });
        if (vendor && vendor.socketId) {
            io.to(vendor.socketId).emit('newRequest', newRequest);
        }

        res.json({ success: true, message: 'Request sent successfully.' });
    } catch (error) {
        console.error('Send Request Error:', error);
        res.status(500).json({ success: false, message: 'Server error sending request.' });
    }
});


// 8. Vendor View Requests
app.get('/api/vendor/requests', async (req, res) => {
    const { phone } = req.query; // Vendor's phone number

    if (!phone) {
        return res.status(400).json({ success: false, message: 'Missing vendor phone.' });
    }

    try {
        // Fetch all pending requests for the vendor
        const requests = await Request.find({ vendorPhone: phone, status: 'pending' }).sort({ createdAt: -1 });

        res.json({ success: true, data: requests });
    } catch (error) {
        console.error('Vendor View Requests Error:', error);
        res.status(500).json({ success: false, message: 'Server error fetching requests.' });
    }
});


// 9. Customer Feedback Submission
app.post('/api/customer/feedback', async (req, res) => {
    const { vendorPhone, vendorName, customerName, customerPhone, rating, comment } = req.body;

    if (!vendorPhone || !customerPhone || !rating) {
        return res.status(400).json({ success: false, message: 'Missing required feedback data.' });
    }

    if (rating < 1 || rating > 5) {
        return res.status(400).json({ success: false, message: 'Rating must be between 1 and 5.' });
    }

    try {
        const newFeedback = new Feedback({
            vendorPhone,
            vendorName,
            customerName,
            customerPhone,
            rating,
            comment: comment || ''
        });
        await newFeedback.save();

        res.json({ success: true, message: 'Feedback submitted successfully.' });
    } catch (error) {
        console.error('Feedback Submission Error:', error);
        res.status(500).json({ success: false, message: 'Server error submitting feedback.' });
    }
});


// 10. Vendor View Feedback (NEW)
app.get('/api/vendor/feedback', async (req, res) => {
    const { phone } = req.query; // Vendor's phone number

    if (!phone) {
        return res.status(400).json({ success: false, message: 'Missing vendor phone.' });
    }

    try {
        const feedback = await Feedback.find({ vendorPhone: phone }).sort({ createdAt: -1 });

        // Calculate average rating
        const totalRating = feedback.reduce((sum, f) => sum + f.rating, 0);
        const averageRating = feedback.length > 0 ? (totalRating / feedback.length).toFixed(1) : 'N/A';

        res.json({ success: true, averageRating, data: feedback });
    } catch (error) {
        console.error('Vendor View Feedback Error:', error);
        res.status(500).json({ success: false, message: 'Server error fetching feedback.' });
    }
});

io.on('connection', async (socket) => {
    console.log('A user connected:', socket.id);

    // Track the socket ID for the vendor (assuming they log in right after connecting)
    socket.on('vendor-login-success', async ({ phone }) => {
        try {
            const vendor = await Vendor.findOne({ phone });
            if (vendor) {
                vendor.socketId = socket.id;
                await vendor.save();
                console.log(`Vendor ${vendor.name} tracked with socket ID: ${socket.id}`);
            }
        } catch (error) {
            console.error('Socket Vendor Tracking Error:', error);
        }
    });

    socket.on('disconnect', async () => {
        console.log('User disconnected:', socket.id);
        try {
            // Clear socketId for the disconnected vendor
            const vendor = await Vendor.findOne({ socketId: socket.id });
            if (vendor) {
                vendor.socketId = undefined;
                await vendor.save();
                console.log(`Vendor ${vendor.name} socket ID cleared.`);
            }
        } catch (error) {
            console.error("Disconnect Error:", error);
        }
    });
});

// --- Start Server ---
server.listen(PORT, () => {
    console.log(`🌍 Server running on http://localhost:${PORT}`);
});