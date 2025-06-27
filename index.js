// index.js - Simple Booking API
const express = require('express');
const cors = require('cors');

const app = express();
const PORT = 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Sample bookings data
const bookings = [
    {
        id: 1,
        bookingReference: 'BK-2025-001234',
        clientName: 'John Doe',
        clientPhone: '+61406910251',
        date: '2025-06-27',
        time: '09:00',
        reason: 'Consultation',
        status: 'active'
    },
    {
        id: 2,
        bookingReference: 'BK-2025-001235',
        clientName: 'Jane Smith',
        clientPhone: '+61406910251',
        date: '2025-06-28',
        time: '14:00',
        reason: 'Follow-up',
        status: 'active'
    },
    {
        id: 3,
        bookingReference: 'BK-2025-001236',
        clientName: 'Bob Wilson',
        clientPhone: '+61407123456',
        date: '2025-06-29',
        time: '11:00',
        reason: 'Check-up',
        status: 'active'
    }
];

// Helper function for timezone info
function getTimeInfo(date, time) {
    const dateTime = new Date(`${date}T${time}:00`);
    return {
        local: {
            dateTime: dateTime.toLocaleString(),
            date: date,
            time: time,
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
        },
        utc: {
            dateTime: dateTime.toISOString(),
            date: dateTime.toISOString().split('T')[0],
            time: dateTime.toISOString().split('T')[1].substring(0, 5),
            timezone: 'UTC'
        }
    };
}

// 🔍 GET bookings by phone number
app.get('/api/bookings/phone/:phone', (req, res) => {
    const { phone } = req.params;
    
    console.log(`🔍 Searching for phone: ${phone}`);
    
    // Find matching bookings (partial match)
    const matches = bookings.filter(booking => 
        booking.clientPhone.includes(phone) && booking.status === 'active'
    );
    
    if (matches.length === 0) {
        return res.status(404).json({
            success: false,
            message: 'No bookings found for this phone number',
            phone: phone,
            searchedAt: {
                local: new Date().toLocaleString(),
                utc: new Date().toISOString()
            }
        });
    }
    
    // Add timezone info to each booking
    const results = matches.map(booking => ({
        ...booking,
        timeInfo: getTimeInfo(booking.date, booking.time)
    }));
    
    res.json({
        success: true,
        count: results.length,
        phone: phone,
        bookings: results,
        searchedAt: {
            local: new Date().toLocaleString(),
            utc: new Date().toISOString()
        }
    });
});

// 🏥 Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({
        success: true,
        message: 'Booking API is running!',
        timestamp: {
            local: new Date().toLocaleString(),
            utc: new Date().toISOString()
        },
        totalBookings: bookings.length,
        activeBookings: bookings.filter(b => b.status === 'active').length
    });
});

// Start server
app.listen(PORT, () => {
    console.log(`🚀 Booking API Server running on http://localhost:${PORT}`);
    console.log(`📋 Available endpoints:`);
    console.log(`   GET /api/health`);
    console.log(`   GET /api/bookings/phone/:phone`);
    console.log(`\n📱 Sample phone numbers to test:`);
    console.log(`   +61406910251 (2 bookings - John & Jane)`);
    console.log(`   +61407123456 (1 booking - Bob)`);
    console.log(`\n🧪 Test commands:`);
    console.log(`   curl http://localhost:3000/api/health`);
    console.log(`   curl http://localhost:3000/api/bookings/phone/+61406910251`);
});