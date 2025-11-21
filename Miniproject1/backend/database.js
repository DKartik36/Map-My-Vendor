const mongoose = require('mongoose');

// --- 1. Database Connection ---

const connectDB = async () => {
    // 🛑 CRITICAL: REPLACE THIS CONNECTION STRING 
    const MONGO_URI = 'mongodb://localhost:27017/mapmyvendorDB';

    try {
        await mongoose.connect(MONGO_URI);
        console.log('✅ MongoDB Connected successfully!');
    } catch (err) {
        console.error('❌ MongoDB Connection Failed:', err.message);
        process.exit(1);
    }
};

// --- 2. Vendor Schema and Model (UPDATED) ---

const vendorSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true
    },
    phone: {
        type: String,
        required: true,
        unique: true,
        index: true
    },
    pass: {
        type: String, // Storing HASHED password
        required: true
    },
    selling: {
        type: Boolean,
        default: false
    },
    lat: {
        type: Number
    },
    lng: {
        type: Number
    },
    menu: {
        type: [String],
        default: []
    },
    socketId: {
        type: String
    },
    // --- NEW ROUTE FIELDS ---
    routeStartName: {
        type: String
    },
    routeEndName: {
        type: String
    },
    routeStartLat: {
        type: Number
    },
    routeStartLng: {
        type: Number
    },
    routeEndLat: {
        type: Number
    },
    routeEndLng: {
        type: Number
    }
    // ------------------------
});

const Vendor = mongoose.model('Vendor', vendorSchema);


// --- 3. TrackData Schema and Model ---

const trackDataSchema = new mongoose.Schema({
    vendorPhone: {
        type: String,
        required: true,
        index: true
    },
    lat: {
        type: Number,
        required: true
    },
    lng: {
        type: Number,
        required: true
    },
}, { timestamps: true });

const TrackData = mongoose.model('TrackData', trackDataSchema);


// --- 4. Customer Request Schema and Model ---

const requestSchema = new mongoose.Schema({
    vendorPhone: {
        type: String,
        required: true,
        index: true
    },
    vendorName: {
        type: String,
        required: true
    },
    customerName: {
        type: String,
        required: true
    },
    customerPhone: {
        type: String,
        required: true
    },
    details: {
        type: String,
        required: true
    },
    area: {
        type: String // A descriptive area name from the client
    },
    customerLat: {
        type: Number
    },
    customerLng: {
        type: Number
    },
    status: {
        type: String,
        enum: ['pending', 'accepted', 'declined'],
        default: 'pending'
    }
}, { timestamps: true });

const Request = mongoose.model('Request', requestSchema);


// --- 5. Customer Schema and Model ---

const customerSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true
    },
    phone: {
        type: String,
        required: true,
        unique: true,
        index: true
    },
    password: { // Storing HASHED password
        type: String,
        required: true
    }
});

const Customer = mongoose.model('Customer', customerSchema);


// --- 6. Feedback Schema and Model ---

const feedbackSchema = new mongoose.Schema({
    vendorPhone: {
        type: String,
        required: true,
        index: true
    },
    vendorName: {
        type: String,
        required: true
    },
    customerName: {
        type: String,
        required: true
    },
    customerPhone: {
        type: String,
        required: true
    },
    rating: {
        type: Number,
        min: 1,
        max: 5,
        required: true
    },
    comment: {
        type: String
    },
}, { timestamps: true });

const Feedback = mongoose.model('Feedback', feedbackSchema);


// --- Exports ---

module.exports = {
    connectDB,
    Vendor,
    TrackData,
    Request,
    Customer,
    Feedback
};