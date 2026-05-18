const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose'); 
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const axios = require('axios');
const Razorpay = require('razorpay'); // <-- Added Razorpay

const app = express();
const PORT = 3000;

// Consider moving these to a .env file for security!
const JWT_SECRET = 'super_secret_aitripplanner_key_123';
const RAZORPAY_KEY_ID = 'rzp_test_Se3Ul1lOzDFRKX';       // Replace with your Razorpay Test Key
const RAZORPAY_KEY_SECRET = '27uEztCEXaFra6fq6W70t3ZV';   // Replace with your Razorpay Secret

// CONNECT TO MONGODB 
// Note: You might want to rename your database from eventhallDB to aitripDB in the URI later
const MONGO_URI = 'mongodb+srv://Eventhall:event12345@cluster0.2hyvlxq.mongodb.net/eventhallDB?appName=Cluster0';

mongoose.connect(MONGO_URI)
    .then(() => console.log('✅ Connected to MongoDB successfully!'))
    .catch(err => console.error('❌ MongoDB connection error:', err));

// Middleware
app.use(cors()); 
app.use(express.json()); 

// --- INITIALIZE RAZORPAY ---
const razorpay = new Razorpay({
    key_id: RAZORPAY_KEY_ID,
    key_secret: RAZORPAY_KEY_SECRET,
});

// --- CONFIGURE NODEMAILER ---
const transporter = nodemailer.createTransport({
    service: 'gmail', 
    auth: {
        user: 'nayantarpara05@gmail.com', 
        pass: 'pjajcxznehfoedgx'     
    }
});

// --- DEFINE SCHEMAS ---

const bookingSchema = new mongoose.Schema({
    id: { type: String, required: true, unique: true },
    userId: { type: String, required: true },
    customer: String,
    phone: String,
    date: String,
    timeSlot: String,
    venue: String,
    hall: String,
    amount: Number,
    status: String,
    paymentId: String,
    addons: [String]// <-- Added this to store the Razorpay transaction ID
});
const Booking = mongoose.model('Booking', bookingSchema);

const userSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    phone: { type: String },
    isVerified: { type: Boolean, default: false },
    password: { type: String, required: true }, 
    role: { type: String, default: 'user' }, 
    assignedVenue: { type: String } 
});
const User = mongoose.model('User', userSchema);

const venueSchema = new mongoose.Schema({
    name: { type: String, required: true },
    img: { type: String, required: true },
    price: { type: Number, required: true },
    capacity: { type: Number, required: true }, 
    type: { type: String, default: 'Premium' },
    location: { type: String, default: 'Prime Location' },
    rating: { type: Number, default: 4.8 },
    amenities: { type: [String], default: ['AC', 'Parking'] },
    ownerId: { type: String, default: null }
});
const Venue = mongoose.model('Venue', venueSchema);

const tokenSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, required: true, ref: 'User' },
    token: { type: String, required: true },
    createdAt: { type: Date, required: true, default: Date.now, expires: 3600 } 
});
const Token = mongoose.model('Token', tokenSchema);

const otpSchema = new mongoose.Schema({
    phone: { type: String, required: true },
    otp: { type: String, required: true },
    createdAt: { type: Date, required: true, default: Date.now, expires: 300 } 
});
const Otp = mongoose.model('Otp', otpSchema);

const emailOtpSchema = new mongoose.Schema({
    email: { type: String, required: true },
    otp: { type: String, required: true },
    createdAt: { type: Date, required: true, default: Date.now, expires: 300 } 
});
const EmailOtp = mongoose.model('EmailOtp', emailOtpSchema);


// --- AUTHENTICATION & VERIFICATION ROUTES ---

// 1. REGISTER API
app.post('/api/register', async (req, res) => {
    try {
        const { name, email, password, role, assignedVenue } = req.body;

        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(400).json({ message: 'Email is already registered' });
        }

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        const newUser = new User({
            name,
            email,
            password: hashedPassword,
            role: role || 'user', 
            assignedVenue: assignedVenue || ''
        });
        await newUser.save();

        const rawToken = crypto.randomBytes(32).toString('hex');
        await new Token({ userId: newUser._id, token: rawToken }).save();
        
        const link = `http://localhost:3000/api/verify/confirm?token=${rawToken}&id=${newUser._id}`;
        
        await transporter.sendMail({
            from: 'nayantarpara05@gmail.com',
            to: newUser.email,
            subject: 'Welcome to AI Trip Planner! Please Verify your Account',
            html: `<h3>Hello ${newUser.name},</h3><p>Click <a href="${link}">here</a> to verify your email and activate your account.</p>`
        });

        res.status(201).json({ message: 'Account created! Please check your email to verify.' });
    } catch (error) {
        res.status(500).json({ message: 'Error registering user', error: error.message });
    }
});

// 2. LOGIN API
app.post('/api/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        const user = await User.findOne({ email });
        if (!user) {
            return res.status(401).json({ message: 'Invalid email or password' });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(401).json({ message: 'Invalid email or password' });
        }

        const token = jwt.sign(
            { userId: user._id, email: user.email, role: user.role },
            JWT_SECRET,
            { expiresIn: '2h' }
        );

        res.status(200).json({
            message: 'Login successful',
            token: token,
            user: { 
                id: user._id, 
                name: user.name, 
                email: user.email, 
                role: user.role,
                assignedVenue: user.assignedVenue 
            }
        });
    } catch (error) {
        res.status(500).json({ message: 'Server error during login', error: error.message });
    }
});

// 3. RESEND VERIFICATION EMAIL API
app.post('/api/verify/email', async (req, res) => {
    try {
        const { email } = req.body;
        const user = await User.findOne({ email });

        if (!user) return res.status(404).json({ message: 'User not found' });
        if (user.isVerified) return res.status(400).json({ message: 'Account is already verified' });

        await Token.deleteMany({ userId: user._id });

        const rawToken = crypto.randomBytes(32).toString('hex');
        await new Token({ userId: user._id, token: rawToken }).save();

        const link = `http://localhost:3000/api/verify/confirm?token=${rawToken}&id=${user._id}`;
        
        await transporter.sendMail({
            from: 'nayantarpara05@gmail.com',
            to: user.email,
            subject: 'Resend: Verify your AI Trip Planner Account',
            html: `<p>Click <a href="${link}">here</a> to verify your email.</p>`
        });

        res.status(200).json({ message: 'Verification email resent successfully!' });
    } catch (error) {
        res.status(500).json({ message: 'Error sending email', error: error.message });
    }
});

// 4. CONFIRM TOKEN API
app.get('/api/verify/confirm', async (req, res) => {
    try {
        const { token, id } = req.query;

        const tokenRecord = await Token.findOne({ userId: id, token: token });
        if (!tokenRecord) {
            return res.status(400).send('<h1>Invalid or expired token. Please request a new verification email.</h1>');
        }

        await User.findByIdAndUpdate(id, { isVerified: true });
        await Token.findByIdAndDelete(tokenRecord._id);

        res.send('<h1>Email successfully verified! You can log in now.</h1>');
    } catch (error) {
        res.status(500).send('<h1>Server Error during verification</h1>');
    }
});

// --- OTP ENDPOINTS ---
app.post('/api/send-otp', async (req, res) => {
    try {
        const { phone } = req.body;
        if (!phone || phone.length !== 10) {
            return res.status(400).json({ message: 'Please provide a valid 10-digit number' });
        }
        const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
        await Otp.deleteMany({ phone });
        await new Otp({ phone, otp: otpCode }).save();

        const FAST2SMS_API_KEY = 'YOUR_FAST2SMS_API_KEY'; 
        if (FAST2SMS_API_KEY !== 'YOUR_FAST2SMS_API_KEY') {
            await axios.get('https://www.fast2sms.com/dev/bulkV2', {
                params: {
                    authorization: FAST2SMS_API_KEY,
                    variables_values: otpCode,
                    route: 'otp',
                    numbers: phone
                }
            });
            console.log(`Real SMS sent to ${phone}`);
        } else {
            console.log(`\n--- MOCK SMS ---\nTo: +91 ${phone}\nMessage: Your AI Trip Planner OTP is ${otpCode}\n----------------\n`);
        }
        res.status(200).json({ message: 'OTP Sent successfully' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Failed to send OTP' });
    }
});

app.post('/api/verify-otp', async (req, res) => {
    try {
        const { phone, otp } = req.body;
        const record = await Otp.findOne({ phone, otp });
        if (!record) return res.status(400).json({ message: 'Invalid or expired OTP' });
        await Otp.findByIdAndDelete(record._id);
        res.status(200).json({ message: 'Phone number verified successfully' });
    } catch (error) {
        res.status(500).json({ message: 'Server error during verification' });
    }
});

app.post('/api/send-email-otp', async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) return res.status(400).json({ message: 'Email is required' });
        const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
        await EmailOtp.deleteMany({ email });
        await new EmailOtp({ email, otp: otpCode }).save();

        await transporter.sendMail({
            from: 'nayantarpara05@gmail.com',
            to: email,
            subject: 'Your AI Trip Planner Verification Code',
            html: `<div style="font-family: Arial, sans-serif; text-align: center; padding: 20px;">
                    <h2>Verify Your Email</h2><p>Your one-time passcode is:</p>
                    <h1 style="color: #4f46e5; letter-spacing: 5px;">${otpCode}</h1>
                    <p>This code will expire in 5 minutes.</p></div>`
        });
        res.status(200).json({ message: 'OTP sent to your email!' });
    } catch (error) {
        console.error('Error sending Email OTP:', error);
        res.status(500).json({ message: 'Failed to send OTP email' });
    }
});

app.post('/api/verify-email-otp', async (req, res) => {
    try {
        const { email, otp } = req.body;
        const record = await EmailOtp.findOne({ email, otp });
        if (!record) return res.status(400).json({ message: 'Invalid or expired OTP code' });
        await EmailOtp.findByIdAndDelete(record._id);
        res.status(200).json({ message: 'Email verified successfully!' });
    } catch (error) {
        res.status(500).json({ message: 'Server error during verification' });
    }
});

// --- MIDDLEWARE: THE BOUNCER ---
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; 
    if (!token) return res.status(401).json({ message: 'Access Denied: No token provided' });

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ message: 'Invalid or expired token' });
        req.user = user; 
        next(); 
    });
};

// ==========================================
//        PAYMENT INTEGRATION ROUTES
// ==========================================

// Create Razorpay Order
app.post('/api/create-payment', authenticateToken, async (req, res) => {
    try {
        const { amount } = req.body;

        if (!amount) {
            return res.status(400).json({ error: "Amount is required" });
        }

        const options = {
            amount: amount * 100, // Razorpay works in paise (sub-units)
            currency: 'INR',
            receipt: `rcpt_${Date.now()}`,
            notes: {
                project: "AI Trip Planner"
            }
        };

        const order = await razorpay.orders.create(options);

        res.status(200).json({
            success: true,
            id: order.id,
            amount: order.amount,
            currency: order.currency
        });

    } catch (error) {
        console.error("Error creating Razorpay order:", error);
        res.status(500).json({ success: false, error: 'Failed to create payment order' });
    }
});

// Optional Verification Route
app.post('/api/verify-payment', authenticateToken, (req, res) => {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
    const body = razorpay_order_id + "|" + razorpay_payment_id;

    const expectedSignature = crypto
        .createHmac('sha256', RAZORPAY_KEY_SECRET)
        .update(body.toString())
        .digest('hex');

    if (expectedSignature === razorpay_signature) {
        res.status(200).json({ success: true, message: "Payment verified successfully" });
    } else {
        res.status(400).json({ success: false, message: "Invalid Signature" });
    }
});

// ==========================================
//        PUBLIC BOOKING ROUTES
// ==========================================

app.post('/api/bookings', authenticateToken, async (req, res) => {
    try {
        const newBooking = new Booking({
            ...req.body,
            userId: req.user.userId,
            status: req.body.status || 'Pending' 
        });
        await newBooking.save(); 

        // --- NEW: AUTOMATIC EMAIL CONFIRMATION ---
        // Only send the email if the payment was successful
        if (newBooking.status === 'Paid') {
            
            // Design a beautiful HTML Email Template
            const emailHtml = `
            <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.05);">
                <div style="background-color: #4f46e5; color: white; padding: 25px; text-align: center;">
                    <h1 style="margin: 0; font-size: 24px; letter-spacing: 1px;">EventHallBook</h1>
                    <p style="margin: 5px 0 0; opacity: 0.9; font-size: 14px;">Booking Confirmation & Receipt</p>
                </div>
                <div style="padding: 30px; background-color: #ffffff;">
                    <h3 style="color: #0f172a; margin-top: 0;">Hello ${newBooking.customer},</h3>
                    <p style="color: #475569; line-height: 1.6; font-size: 15px;">Thank you for your payment! Your reservation is confirmed. Here are the details of your booking:</p>

                    <div style="background-color: #f8fafc; border-left: 4px solid #4f46e5; padding: 15px 20px; border-radius: 4px; margin: 25px 0;">
                        <p style="margin: 8px 0; color: #334155;"><strong style="color: #0f172a;">Booking ID:</strong> ${newBooking.id}</p>
                        <p style="margin: 8px 0; color: #334155;"><strong style="color: #0f172a;">Venue:</strong> ${newBooking.hall}</p>
                        <p style="margin: 8px 0; color: #334155;"><strong style="color: #0f172a;">Event Date:</strong> ${newBooking.date}</p>
                        <p style="margin: 8px 0; color: #334155;"><strong style="color: #0f172a;">Phone:</strong> ${newBooking.phone}</p>
                        <p style="margin: 8px 0; color: #334155;"><strong style="color: #0f172a;">Transaction ID:</strong> ${newBooking.paymentId || 'N/A'}</p>
                    </div>

                    <table style="width: 100%; border-collapse: collapse; margin-top: 10px;">
                        <tr style="border-bottom: 2px solid #e2e8f0;">
                            <td style="padding: 15px 0; color: #64748b; font-weight: bold; text-transform: uppercase; font-size: 12px;">Total Amount Paid</td>
                            <td style="padding: 15px 0; text-align: right; color: #16a34a; font-size: 22px; font-weight: bold;">₹${newBooking.amount.toLocaleString()}</td>
                        </tr>
                    </table>

                    <p style="color: #64748b; font-size: 13px; text-align: center; margin-top: 30px; line-height: 1.5;">
                        This is an automatically generated receipt.<br>
                        If you have any questions, feel free to contact our support team.<br>
                        We look forward to hosting your event!
                    </p>
                </div>
            </div>
            `;

            // Fire off the email in the background
            transporter.sendMail({
                from: 'nayantarpara05@gmail.com', // Your NodeMailer email
                to: req.user.email,               // Grabbed securely from the JWT Token!
                subject: `Booking Confirmed: ${newBooking.hall} - #${newBooking.id}`,
                html: emailHtml
            }).then(() => {
                console.log(`✅ Receipt successfully emailed to ${req.user.email}`);
            }).catch((err) => {
                console.error(`❌ Failed to send email to ${req.user.email}:`, err);
            });
        }

        res.status(201).json({ message: 'Booking requested successfully', booking: newBooking });
    } catch (error) {
        console.error("Booking Error:", error);
        res.status(400).json({ message: 'Error saving booking', error });
    }
});

app.get('/api/venues', async (req, res) => {
    try {
        const venues = await Venue.find();
        res.status(200).json(venues);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching venues' });
    }
});

app.get('/api/venues/:id', async (req, res) => {
    try {
        const venue = await Venue.findById(req.params.id);
        if (!venue) return res.status(404).json({ message: 'Venue not found' });
        res.status(200).json(venue);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching venue details' });
    }
});

// ==========================================
//        ADMIN BOOKING & VENUE ROUTES
// ==========================================

app.get('/api/admin/bookings', authenticateToken, async (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ message: 'Forbidden' });
    try {
        const bookings = await Booking.find(); 
        res.status(200).json(bookings);
    } catch (error) {
        res.status(500).json({ message: 'Server error fetching bookings' });
    }
});

app.post('/api/admin/bookings', authenticateToken, async (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ message: 'Forbidden' });
    try {
        const newBooking = new Booking(req.body);
        await newBooking.save(); 
        res.status(201).json({ message: 'Booking created successfully', booking: newBooking });
    } catch (error) {
        res.status(400).json({ message: 'Error saving booking', error });
    }
});

app.put('/api/admin/bookings/:id', authenticateToken, async (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ message: 'Forbidden' });
    try {
        const updatedBooking = await Booking.findOneAndUpdate(
            { id: req.params.id }, 
            req.body, 
            { new: true } 
        );
        if (updatedBooking) {
            res.status(200).json({ message: 'Booking updated', booking: updatedBooking });
        } else {
            res.status(404).json({ message: 'Booking not found' });
        }
    } catch (error) {
        res.status(400).json({ message: 'Error updating booking', error });
    }
});

app.delete('/api/admin/bookings/:id', authenticateToken, async (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ message: 'Forbidden' });
    try {
        const deletedBooking = await Booking.findOneAndDelete({ id: req.params.id });
        if (deletedBooking) {
            res.status(200).json({ message: 'Booking deleted successfully' });
        } else {
            res.status(404).json({ message: 'Booking not found' });
        }
    } catch (error) {
        res.status(400).json({ message: 'Error deleting booking', error });
    }
});

// Admin Venue Creation
app.post('/api/admin/venues', authenticateToken, async (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ message: 'Forbidden' });
    try {
        const venueData = { ...req.body };
        if (venueData.ownerId === "") {
            venueData.ownerId = null;
        }

        const newVenue = new Venue(venueData);
        await newVenue.save();
        res.status(201).json({ message: 'Venue added successfully', venue: newVenue });
    } catch (error) {
        res.status(400).json({ message: 'Error saving venue', error });
    }
});

app.delete('/api/admin/venues/:id', authenticateToken, async (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ message: 'Forbidden' });
    try {
        const deletedVenue = await Venue.findByIdAndDelete(req.params.id);
        if (deletedVenue) {
            res.status(200).json({ message: 'Venue deleted' });
        } else {
            res.status(404).json({ message: 'Venue not found' });
        }
    } catch (error) {
        res.status(400).json({ message: 'Error deleting venue', error });
    }
});

// ==========================================
//        OWNER DASHBOARD ROUTES
// ==========================================

app.get('/api/owner/bookings', authenticateToken, async (req, res) => {
    if (req.user.role !== 'owner' && req.user.role !== 'admin') {
        return res.status(403).json({ message: 'Forbidden' });
    }
    
    try {
        const ownerEmail = req.user.email;
        const ownerVenues = await Venue.find({ ownerId: ownerEmail });
        const venueNames = ownerVenues.map(v => v.name);

        if (venueNames.length === 0) {
            return res.status(200).json([]);
        }

        const ownerBookings = await Booking.find({ 
            $or: [ 
                { venue: { $in: venueNames } }, 
                { hall: { $in: venueNames } } 
            ]
        });

        res.status(200).json(ownerBookings);
    } catch (error) {
        console.error('Error fetching owner bookings:', error);
        res.status(500).json({ message: 'Server error fetching owner bookings' });
    }
});

app.put('/api/owner/bookings/:id', authenticateToken, async (req, res) => {
    if (req.user.role !== 'owner' && req.user.role !== 'admin') {
        return res.status(403).json({ message: 'Forbidden: Owners only' });
    }
    try {
        const booking = await Booking.findOne({ id: req.params.id });
        if (!booking) return res.status(404).json({ message: 'Booking not found' });

        const venueName = booking.hall || booking.venue;
        const venue = await Venue.findOne({ name: venueName });

        if (req.user.role === 'owner' && (!venue || venue.ownerId !== req.user.email)) {
            return res.status(403).json({ message: 'Unauthorized: You can only edit bookings for your own venues.' });
        }

        const updatedBooking = await Booking.findOneAndUpdate(
            { id: req.params.id }, 
            req.body, 
            { new: true } 
        );
        res.status(200).json({ message: 'Booking updated', booking: updatedBooking });
    } catch (error) {
        console.error('Error updating owner booking:', error);
        res.status(500).json({ message: 'Server error updating booking' });
    }
});

app.delete('/api/owner/bookings/:id', authenticateToken, async (req, res) => {
    if (req.user.role !== 'owner' && req.user.role !== 'admin') {
        return res.status(403).json({ message: 'Forbidden: Owners only' });
    }
    try {
        const booking = await Booking.findOne({ id: req.params.id });
        if (!booking) return res.status(404).json({ message: 'Booking not found' });

        const venueName = booking.hall || booking.venue;
        const venue = await Venue.findOne({ name: venueName });

        if (req.user.role === 'owner' && (!venue || venue.ownerId !== req.user.email)) {
            return res.status(403).json({ message: 'Unauthorized: You can only delete bookings for your own venues.' });
        }

        await Booking.findOneAndDelete({ id: req.params.id });
        res.status(200).json({ message: 'Booking deleted successfully' });
    } catch (error) {
        console.error('Error deleting owner booking:', error);
        res.status(500).json({ message: 'Server error deleting booking' });
    }
});

app.post('/api/owner/venues', authenticateToken, async (req, res) => {
    if (req.user.role !== 'owner' && req.user.role !== 'admin') {
        return res.status(403).json({ message: 'Forbidden: Owners only' });
    }
    try {
        const newVenue = new Venue({
            ...req.body,
            ownerId: req.user.email 
        });
        await newVenue.save();
        res.status(201).json({ message: 'Venue added successfully', venue: newVenue });
    } catch (error) {
        console.error('Error saving owner venue:', error);
        res.status(400).json({ message: 'Error saving venue', error });
    }
});

app.delete('/api/owner/venues/:id', authenticateToken, async (req, res) => {
    if (req.user.role !== 'owner' && req.user.role !== 'admin') {
        return res.status(403).json({ message: 'Forbidden: Owners only' });
    }
    try {
        const venue = await Venue.findById(req.params.id);
        if (!venue) return res.status(404).json({ message: 'Venue not found' });

        if (req.user.role === 'owner' && venue.ownerId !== req.user.email) {
            return res.status(403).json({ message: 'Unauthorized: You can only delete your own venues.' });
        }

        await Venue.findByIdAndDelete(req.params.id);
        res.status(200).json({ message: 'Venue deleted successfully' });
    } catch (error) {
        console.error('Error deleting venue:', error);
        res.status(500).json({ message: 'Server error deleting venue' });
    }
});

app.get('/api/owner/venues', authenticateToken, async (req, res) => {
    if (req.user.role !== 'owner') return res.status(403).json({ message: 'Forbidden: Owners only' });
    try {
        const currentOwnerEmail = req.user.email; 
        const ownerVenues = await Venue.find({ ownerId: currentOwnerEmail });
        res.status(200).json(ownerVenues);
    } catch (error) {
        console.error('Error fetching owner venues:', error);
        res.status(500).json({ message: 'Server error fetching venues' });
    }
});


// ==========================================
//        ADMIN USER MANAGEMENT ROUTES
// ==========================================

app.get('/api/admin/users', authenticateToken, async (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ message: 'Forbidden' });
    try {
        const users = await User.find().select('-password'); 
        res.status(200).json(users);
    } catch (error) {
        res.status(500).json({ message: 'Server error fetching users' });
    }
});

app.post('/api/admin/users', authenticateToken, async (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ message: 'Forbidden' });
    try {
        const { name, email, password, role } = req.body;

        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(400).json({ message: 'Email already exists' });
        }

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        const newUser = new User({
            name,
            email,
            password: hashedPassword,
            role,
            isVerified: true 
        });

        const savedUser = await newUser.save();
        savedUser.password = undefined; 
        res.status(201).json(savedUser);
    } catch (error) {
        res.status(500).json({ message: 'Server error creating user' });
    }
});

app.put('/api/admin/users/:id', authenticateToken, async (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ message: 'Forbidden' });
    try {
        const { name, email, role, password } = req.body;
        
        let updateData = { name, email, role };

        if (password && password.trim() !== '') {
            const salt = await bcrypt.genSalt(10);
            updateData.password = await bcrypt.hash(password, salt);
        }

        const updatedUser = await User.findByIdAndUpdate(
            req.params.id, 
            updateData, 
            { new: true } 
        ).select('-password'); 
        
        if (updatedUser) {
            res.status(200).json({ message: 'User updated successfully', user: updatedUser });
        } else {
            res.status(404).json({ message: 'User not found' });
        }
    } catch (error) {
        console.error('Error updating user:', error);
        res.status(500).json({ message: 'Server error updating user' });
    }
});

app.delete('/api/admin/users/:id', authenticateToken, async (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ message: 'Forbidden' });
    try {
        const userId = req.params.id;
        
        if (req.user.userId.toString() === userId) {
            return res.status(400).json({ message: 'Cannot delete your own admin account' });
        }

        const deletedUser = await User.findByIdAndDelete(userId);
        if (deletedUser) {
            res.status(200).json({ message: 'User deleted successfully' });
        } else {
            res.status(404).json({ message: 'User not found' });
        }
    } catch (error) {
        res.status(500).json({ message: 'Server error deleting user' });
    }
});
// ==========================================
//      USER PROFILE & BOOKING ROUTES
// ==========================================

// Fetch logged-in user's bookings securely
app.get('/api/my-bookings', authenticateToken, async (req, res) => {
    try {
        // FIX: Find bookings using the unique userId from the token, NOT the name.
        // This ensures a user only ever sees their own exact data.
        const myBookings = await Booking.find({ userId: req.user.userId }).sort({ _id: -1 });
        
        res.status(200).json(myBookings);
    } catch (error) {
        console.error('Error fetching user bookings:', error);
        res.status(500).json({ message: 'Server error fetching bookings' });
    }
});

// User cancels their own booking securely
app.delete('/api/bookings/:id', authenticateToken, async (req, res) => {
    try {
        // FIX: Require both the booking ID AND the token's userId to match.
        // This prevents users from deleting someone else's booking.
        const deletedBooking = await Booking.findOneAndDelete({ 
            id: req.params.id, 
            userId: req.user.userId 
        });

        if (deletedBooking) {
            res.status(200).json({ message: 'Booking cancelled successfully' });
        } else {
            // If the booking doesn't exist OR doesn't belong to this user
            res.status(404).json({ message: 'Booking not found or unauthorized' });
        }
    } catch (error) {
        res.status(500).json({ message: 'Error cancelling booking', error });
    }
});

// Update user profile (Name & Phone) - This remains unchanged and works perfectly!
app.put('/api/users/profile', authenticateToken, async (req, res) => {
    try {
        const { name, phone } = req.body;
        
        const updatedUser = await User.findByIdAndUpdate(
            req.user.userId, 
            { name, phone }, 
            { new: true }
        ).select('-password');

        if (updatedUser) {
            res.status(200).json({ message: 'Profile updated successfully', user: updatedUser });
        } else {
            res.status(404).json({ message: 'User not found' });
        }
    } catch (error) {
        console.error('Error updating profile:', error);
        res.status(500).json({ message: 'Server error updating profile' });
    }
});

// --- START SERVER ---
app.listen(PORT, () => {
    console.log(`🚀 Server is running on http://localhost:${PORT}`);
});