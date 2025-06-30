// index.js - Simple Booking API
const express = require('express');
const cors = require('cors');

const app = express();
const PORT = 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Sample bookings data
const bookings = [];

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

// 📦 Fetch all appointments
app.get('/api/appointments', (req, res) => {
    res.json({
        success: true,
        count: bookings.length,
        appointments: bookings
    });
});

app.get('/api/appointments/slots/:date', (req, res) => {
    const { date } = req.params;

    // Define business hours (Australia/Sydney local time)
    const businessHours = ['09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00'];

    // Pull from the backend bookings array
    const bookedAppointments = bookings
        .filter(b => b.date === date && b.status === 'active')
        .map(b => ({
            time: b.time,
            clientName: b.clientName,
            bookingReference: b.bookingReference
        }));

    const bookedTimes = bookedAppointments.map(b => b.time);

    // Available slots with index and UTC ISO 8601 timestamp
    const available = businessHours
        .filter(time => !bookedTimes.includes(time))
        .map((time, index) => {
            const sydneyTime = new Date(`${date}T${time}:00`);
            const utcISO = new Date(sydneyTime.toLocaleString('en-US', { timeZone: 'Australia/Sydney' })).toISOString();
            return {
                index,
                time,
                utc: utcISO
            };
        });

    res.json({
        success: true,
        date,
        booked: bookedAppointments,
        available
    });
});

app.delete('/api/appointments', (req, res) => {
    console.log('🗑️ Clearing ALL appointments from server array...');
    
    const deletedCount = bookings.length;
    const deletedAppointments = [...bookings]; // Copy for logging
    
    // Clear the entire bookings array
    bookings.length = 0;
    
    console.log(`✅ Cleared ${deletedCount} appointments from server`);
    console.log('📊 Remaining bookings:', bookings.length);
    
    res.json({
        success: true,
        message: `Successfully deleted ${deletedCount} appointments`,
        deletedCount: deletedCount,
        deletedAppointments: deletedAppointments,
        remainingBookings: bookings.length
    });
});



app.post('/api/appointments', (req, res) => {
    const { utcTime, clientName, clientPhone, reason } = req.body;
    
    console.log(`📝 Booking appointment from Genesys UTC: ${utcTime}`);
    
    // Validate required fields
    if (!utcTime || !clientName || !clientPhone || !reason) {
        return res.status(400).json({
            success: false,
            message: 'Missing required fields: utcTime, clientName, clientPhone, reason'
        });
    }
    
    // Convert Genesys UTC back to Sydney local time
    const utcDate = new Date(utcTime);
    
    // Convert to Sydney timezone - this gives us the original local time the user picked
    const sydneyDate = utcDate.toLocaleDateString('en-CA', { timeZone: 'Australia/Sydney' }); // YYYY-MM-DD
    const sydneyTime = utcDate.toLocaleTimeString('en-GB', { 
        timeZone: 'Australia/Sydney',
        hour: '2-digit', 
        minute: '2-digit',
        hour12: false 
    }); // HH:MM format
    
    console.log(`🔄 Genesys UTC ${utcTime} → Sydney Local: ${sydneyDate} ${sydneyTime}`);
    
    // Validate it's a business hour (the converted Sydney time should match business hours)
    const businessHours = ['09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00'];
    if (!businessHours.includes(sydneyTime)) {
        return res.status(400).json({
            success: false,
            message: `Invalid business hour. UTC ${utcTime} converts to ${sydneyTime} Sydney time, which is outside business hours (09:00-16:00).`,
            availableHours: businessHours,
            convertedSydneyTime: `${sydneyDate} ${sydneyTime}`
        });
    }
    
    // Check if the Sydney time slot is already booked
    const existingBooking = bookings.find(booking => 
        booking.date === sydneyDate && 
        booking.time === sydneyTime && 
        booking.status === 'active'
    );
    
    if (existingBooking) {
        return res.status(409).json({
            success: false,
            message: 'Time slot already booked',
            conflictingBooking: {
                client: existingBooking.clientName,
                bookingReference: existingBooking.bookingReference,
                sydneyDateTime: `${sydneyDate} ${sydneyTime}`
            }
        });
    }
    
    // Generate booking reference and ID
    const bookingRef = `APT-${new Date().getFullYear()}-${String(Math.floor(Math.random() * 999999)).padStart(6, '0')}`;
    const newId = bookings.length + 1;
    
    // Store with Sydney local time (so UI shows 9:00 AM when user picked 9:00 AM)
    const newAppointment = {
        id: newId,
        bookingReference: bookingRef,
        clientName,
        clientPhone,
        date: sydneyDate,          // Sydney date for UI display
        time: sydneyTime,          // Sydney time for UI display (shows user's original choice)
        utcTime: utcTime,          // Keep original Genesys UTC for reference
        reason,
        status: 'active',
        createdAt: new Date().toISOString()
    };
    
    // Add to bookings array
    bookings.push(newAppointment);
    
    console.log(`✅ Appointment booked successfully:`);
    console.log(`   📋 Reference: ${bookingRef}`);
    console.log(`   👤 Client: ${clientName}`);
    console.log(`   🌍 Original Genesys UTC: ${utcTime}`);
    console.log(`   🇦🇺 Displayed as Sydney: ${sydneyDate} at ${sydneyTime}`);
    console.log(`   📊 Total bookings: ${bookings.length}`);
    
    // Return success response
    res.status(201).json({
        success: true,
        message: 'Appointment booked successfully',
        appointment: {
            ...newAppointment,
            timeInfo: getTimeInfo(newAppointment.date, newAppointment.time)
        },
        conversion: {
            genesysUtcInput: utcTime,
            displayedAsSydney: `${sydneyDate} ${sydneyTime}`,
            note: "User's original local time choice is preserved for display"
        },
        totalBookings: bookings.length
    });
});

// 📅 Alternative endpoint with month name (e.g., /api/appointments/available/2025/june)

// Add this new endpoint to your index.js file after the existing endpoints

// 🌍 Simple endpoint to see available slots by day with UTC times
app.get('/api/appointments/available-utc/:year/:month', (req, res) => {
    const { year, month } = req.params;
    
    const yearNum = parseInt(year);
    const monthNum = parseInt(month);
    
    if (isNaN(yearNum) || isNaN(monthNum) || monthNum < 1 || monthNum > 12) {
        return res.status(400).json({
            success: false,
            message: 'Invalid year or month. Month should be 1-12.'
        });
    }

    console.log(`🌍 Getting available slots for ${monthNum}/${yearNum}`);
    
    const businessHours = ['09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00'];
    const firstDay = new Date(yearNum, monthNum - 1, 1);
    const lastDay = new Date(yearNum, monthNum, 0);
    
    const available = [];
    
    for (let day = 1; day <= lastDay.getDate(); day++) {
        const currentDate = new Date(yearNum, monthNum - 1, day);
        const dayOfWeek = currentDate.getDay();
        
        // Skip weekends
        if (dayOfWeek === 0 || dayOfWeek === 6) continue;
        
        const dateString = currentDate.toLocaleDateString('en-CA', { timeZone: 'Australia/Sydney' });
        const dayName = currentDate.toLocaleDateString('en-US', { weekday: 'long' });
        
        // Get booked times for this day
        const bookedTimes = bookings
            .filter(b => b.date === dateString && b.status === 'active')
            .map(b => b.time);
        
        // Get available times for this day
        const availableTimes = businessHours
            .filter(time => !bookedTimes.includes(time))
            .map(time => {
                const sydneyDateTime = new Date(`${dateString}T${time}:00+10:00`);
                return {
                    localTime: time,
                    utc: sydneyDateTime.toISOString()
                };
            });
        
        if (availableTimes.length > 0) {
            available.push({
                date: dateString,
                dayName: dayName,
                availableSlots: availableTimes
            });
        }
    }

    res.json({
        success: true,
        month: `${firstDay.toLocaleDateString('en-US', { month: 'long' })} ${yearNum}`,
        totalBookings: bookings.length,
        available: available
    });
});


// 🎲 Generate sample appointments endpoint
app.get('/api/appointments/generate-sample', (req, res) => {
    const count = 25; // Fixed count of 25 appointments
    
    console.log(`🎲 Generating ${count} sample appointments`);
    
    const clientNames = [
        'Alice Johnson', 'Bob Smith', 'Carol Davis', 'David Wilson', 'Emma Brown',
        'Frank Miller', 'Grace Lee', 'Henry Taylor', 'Ivy Chen', 'Jack Robinson',
        'Kate Anderson', 'Liam Murphy', 'Maya Patel', 'Noah Garcia', 'Olivia Martinez',
        'Peter Parker', 'Sarah Connor', 'Tony Stark', 'Diana Prince', 'Bruce Wayne'
    ];
    
    const services = ['Consultation', 'Follow-up', 'Check-up', 'Meeting', 'Review'];
    const phoneNumbers = ['+61406910251', '+61407123456', '+61408234567', '+61409345678'];
    const businessHours = ['09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00'];
    
    const sampleAppointments = [];
    const currentDate = new Date();
    const currentMonth = currentDate.getMonth();
    const currentYear = currentDate.getFullYear();
    
    // Generate appointments for current month
    for (let i = 0; i < count; i++) {
        // Generate random date in current month (weekdays only)
        let randomDate;
        let attempts = 0;
        
        do {
            const day = Math.floor(Math.random() * 28) + 1; // Safe day range
            randomDate = new Date(currentYear, currentMonth, day);
            attempts++;
        } while ((randomDate.getDay() === 0 || randomDate.getDay() === 6) && attempts < 50);
        
        // Skip if we couldn't find a weekday
        if (randomDate.getDay() === 0 || randomDate.getDay() === 6) continue;
        
        const randomClient = clientNames[Math.floor(Math.random() * clientNames.length)];
        const randomService = services[Math.floor(Math.random() * services.length)];
        const randomPhone = phoneNumbers[Math.floor(Math.random() * phoneNumbers.length)];
        const randomTime = businessHours[Math.floor(Math.random() * businessHours.length)];
        
        // Generate booking reference
        const bookingRef = `APT-${currentYear}-${String(Math.floor(Math.random() * 999999)).padStart(6, '0')}`;
        
        const appointment = {
            id: bookings.length + sampleAppointments.length + 1,
            bookingReference: bookingRef,
            clientName: randomClient,
            clientPhone: randomPhone,
            date: randomDate.toLocaleDateString('en-CA', { timeZone: 'Australia/Sydney' }),


            time: randomTime,
            reason: randomService,
            status: 'active',
            createdAt: new Date().toISOString()
        };
        
        sampleAppointments.push(appointment);
    }
    
    // Add all sample appointments to the global bookings array
    bookings.push(...sampleAppointments);
    
    console.log(`✅ Generated ${sampleAppointments.length} sample appointments`);
    console.log(`📊 Total bookings in array: ${bookings.length}`);
    
    // Display appointments table in console
    console.log('\n📋 APPOINTMENTS TABLE:');
    console.log('=====================================================================================================');
    console.log('| ID  | Date       | Time  | Client Name      | Phone         | Service      | Booking Ref      |');
    console.log('=====================================================================================================');
    
    sampleAppointments.forEach(apt => {
        const id = String(apt.id).padEnd(3);
        const date = apt.date.padEnd(10);
        const time = apt.time.padEnd(5);
        const name = apt.clientName.padEnd(16);
        const phone = apt.clientPhone.padEnd(13);
        const service = apt.reason.padEnd(12);
        const ref = apt.bookingReference.padEnd(16);
        
        console.log(`| ${id} | ${date} | ${time} | ${name} | ${phone} | ${service} | ${ref} |`);
    });
    
    console.log('=====================================================================================================');
    console.log(`📈 Total Generated: ${sampleAppointments.length} appointments\n`);
    
    res.json({
        success: true,
        message: `Generated ${sampleAppointments.length} sample appointments`,
        count: sampleAppointments.length,
        totalBookings: bookings.length,
        appointments: sampleAppointments.map(appointment => ({
            ...appointment,
            timeInfo: getTimeInfo(appointment.date, appointment.time)
        })),
        generatedAt: {
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