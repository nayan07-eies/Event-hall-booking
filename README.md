# EventHallBook 🏰

A premium, full-stack venue reservation and management system designed to digitalize the process of discovering, customizing, and booking event spaces. 

## 🚀 Overview
EventHallBook acts as a centralized digital marketplace connecting event planners directly with venue owners. Built using a robust Node.js and MongoDB backend with a Vanilla JavaScript frontend, it eliminates traditional booking friction by offering real-time availability, dynamic package pricing, and secure online payments.

## ✨ Key Features
* **Role-Based Access Control (RBAC):** Dedicated routing and secure dashboards for 3 distinct user roles: Customers, Venue Owners, and Super Admins.
* **Secure Authentication:** Passwords are cryptographically hashed using `bcryptjs`, and sessions are secured using JSON Web Tokens (JWT).
* **Payment Gateway Integration:** Secure, real-time transaction processing using the **Razorpay API** (Test Mode configured).
* **Dynamic PDF Invoicing:** Client-side generation of downloadable payment receipts instantly upon booking confirmation using `html2pdf.js`.
* **Analytics Dashboards:** Visual revenue tracking and data aggregation for venue owners utilizing `Chart.js`.
* **Dynamic Pricing Engine:** Real-time cost calculations based on user-selected catering, decor, and entertainment add-ons.

## 💻 Tech Stack
**Frontend:**
* HTML5 & CSS3 (Glassmorphism UI design)
* Vanilla JavaScript (ES6+)
* Bootstrap 5.3
* Libraries: `Chart.js`, `html2pdf.js`, `SweetAlert2`, `Canvas-Confetti`

**Backend:**
* Node.js
* Express.js (RESTful APIs)
* Razorpay API (Payments)
* Bcryptjs & JSON Web Tokens (Security)

**Database:**
* MongoDB Atlas (NoSQL)
* Mongoose (Object Data Modeling)

## ⚙️ Installation & Setup
Follow these steps to run the project locally on your machine.

**1. Clone the repository**
\`\`\`bash
git clone https://github.com/your-username/EventHallBook.git
cd EventHallBook
\`\`\`

**2. Install Backend Dependencies**
\`\`\`bash
npm install
\`\`\`

**3. Set up Environment Variables**
Create a `.env` file in the root directory and add the following keys:
\`\`\`env
PORT=3000
MONGO_URI=your_mongodb_connection_string
JWT_SECRET=your_jwt_secret_key
RAZORPAY_KEY_ID=your_razorpay_test_key_id
RAZORPAY_KEY_SECRET=your_razorpay_test_key_secret
\`\`\`

**4. Run the Server**
\`\`\`bash
node server.js
\`\`\`
*The server will start on `http://localhost:3000`. You can now open `index.html` in your browser to view the application.*

## 👨‍💻 Author
**Nayankumar**
* B.Tech IT Student 
* [LinkedIn](https://linkedin.com/in/your-profile) | [GitHub](https://github.com/your-username)
