# KG Restaurant Expense Tracker — The Kilogram

Restaurant / takeaway ops for **The Kilogram** (India, **₹**). Production UI is the **legacy Firebase app** (`index.html` + `js/`).

## 🚀 Features

### POS (PetPooja-style upgrade)
- Three-pane POS: categories · menu search · cart
- Order types: Dine-In / Takeaway / Delivery / Swiggy / Zomato
- Hold bills, tables, discount/charges, GST (default 5%), split payments
- Keyboard: F2 search, F4 KOT, F6 Bill, F8 Settle
- Local-first checkout + background Firestore sync; sequential bill nos `KG-YYYYMMDD-0001`
- USB / Serial / Bluetooth / system-printer thermal printing with **Hindi KOT** (see `docs/PRINTING.md`)

### Live sales & net margin
- Settled POS bills auto-create `sales` (`source: "pos"`) + `dailySalesSummary`
- Dashboard **LIVE** KPIs (cash vs online, Swiggy/Zomato chips) + hourly chart
- **Net Margin** box (1st → today) with fixed costs (rent, electricity, …) and CSV breakdown

### Main Dashboard
- **Real-time KPIs**: Cash balance, bank balance, total revenue, net profit
- **Interactive Charts**: Daily sales trends (cash vs online), expense breakdown
- **Recent Transactions**: Latest sales and expense entries
- **Upcoming Payments**: Bill reminders and payment alerts
- **Welcome Animation**: Personalized greeting for the user

### Modules

#### 1. Sales Management
- Add daily sales entries with cash and online payment tracking
- Automatic balance updates
- Sales history with filtering and sorting
- Real-time revenue calculations

#### 2. Staff Management
- Add staff members with monthly salary setup
- Daily attendance tracking (present, absent, half-day)
- Salary calculation based on attendance (30-day fixed logic)
- Advance payment tracking and deduction
- Complete salary history

#### 3. Supplier Management
- Add and manage suppliers
- Track bills with paid/unpaid status
- Monitor unpaid totals
- Supplier payment history

#### 4. Expense Management
- Track rent, utilities, and miscellaneous expenses
- Categorize expenses for better insights
- Payment status tracking
- Expense analytics

#### 5. Analytics Dashboard
- Sales trends over time
- Profit analysis
- Expense insights and breakdowns
- Performance metrics

#### 6. Reminder System
- Payment due date notifications
- Customizable reminder periods
- Alert system for upcoming expenses

## 🛠️ Technology Stack

### Frontend
- **React 18**: Modern UI framework
- **React Router**: Client-side routing
- **Recharts**: Interactive charts and visualizations
- **Tailwind CSS**: Utility-first CSS framework
- **Font Awesome**: Icon library

### Backend
- **Firebase Firestore**: NoSQL database for real-time data
- **Firebase Authentication**: User authentication
- **Firebase Hosting**: Static site hosting

### Data Structure
```
Collections:
- users: User profiles and preferences
- sales: Daily sales entries (cash, online, total)
- staff: Staff member information
- attendance: Daily attendance records
- advances: Staff advance payments
- suppliers: Supplier information
- supplierBills: Supplier bills and payments
- expenses: General expenses (rent, utilities, etc.)
- reminders: Payment reminders and notifications
- balances: Account balance tracking
```

## 📦 Installation & Setup

### Prerequisites
- Node.js (v14 or higher)
- Firebase account
- Git

### 1. Clone the Repository
```bash
git clone <repository-url>
cd "kg expence tracker"
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Firebase Setup
1. Create a new Firebase project at [Firebase Console](https://console.firebase.google.com/)
2. Enable Firestore Database
3. Enable Authentication (Email/Password)
4. Copy your Firebase configuration

### 4. Configure Firebase
Update `js/config.js` with your Firebase project details:
```javascript
const firebaseConfig = {
    apiKey: "your-api-key",
    authDomain: "your-project.firebaseapp.com",
    projectId: "your-project-id",
    storageBucket: "your-project.appspot.com",
    messagingSenderId: "your-sender-id",
    appId: "your-app-id"
};
```

### 5. Deploy Firestore Rules
Deploy the security rules from `firestore.rules`:
```bash
firebase deploy --only firestore:rules
```

### 6. Run the Application
```bash
npm run dev
```

The application will be available at `http://localhost:3000`

## 🔧 Development

### Project Structure
```
kg-expense-tracker/
├── index.html              # Main HTML file
├── js/
│   ├── config.js          # Firebase configuration
│   ├── firebase.js        # Firebase operations
│   └── react-app.js      # React application
├── firebase.json          # Firebase configuration
├── firestore.rules        # Firestore security rules
├── package.json          # Dependencies and scripts
└── README.md           # This file
```

### Available Scripts
- `npm start` / `npm run dev`: Serve legacy app on port **3000** (`serve -s . -l 3000`)
- `npm test`: Unit tests (`node --test` for money, salesBridge, netMargin, escpos)
- `npm run firebase:deploy`: Deploy Hosting
- `npm run firebase:deploy:all`: Deploy all Firebase resources
- Deploy rules + indexes: `firebase deploy --only firestore:rules,firestore:indexes`

### Docs
- `docs/AUDIT.md` — baseline audit before POS upgrade
- `docs/PRINTING.md` — USB/Serial/system printer setup
- `docs/TEST_REPORT.md` — test results and manual checklist

## 💡 Usage Guide

### Adding Sales
1. Navigate to the Sales module
2. Enter cash and/or online payment amounts
3. Add optional notes
4. Click "Add Sales Entry"
5. Balances update automatically

### Managing Staff
1. Add staff members in the Staff module
2. Set monthly salaries for each staff member
3. Track daily attendance
4. Calculate salaries based on attendance:
   - Daily Salary = Monthly Salary ÷ 30
   - Final Salary = Daily Salary × Days Present - Advances

### Supplier Bills
1. Add suppliers in the Suppliers module
2. Create bills with payment status
3. Track unpaid amounts
4. Update payment status when paid

### Expense Tracking
1. Use the Expenses module for regular costs
2. Categorize expenses (rent, utilities, etc.)
3. Set payment status
4. Monitor expense trends in analytics

## 🔒 Security

- Firebase Authentication for user access
- Firestore security rules for data protection
- Client-side input validation
- Secure Firebase configuration

## 📱 Responsive Design

The application is fully responsive and works on:
- Desktop computers
- Tablets
- Mobile phones

## 🚀 Deployment

### Firebase Hosting
1. Build the application (if needed)
2. Deploy to Firebase:
```bash
firebase deploy --only hosting
```

### Custom Domain
1. Add custom domain in Firebase Console
2. Update DNS records
3. Deploy SSL certificates

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## 📝 License

This project is licensed under the ISC License.

## 🆘 Support

For support and questions:
- Create an issue in the repository
- Check the documentation
- Review Firebase documentation for backend issues

## 🔄 Updates & Future Features

Planned enhancements:
- [ ] Advanced reporting and export features
- [ ] Multi-user support with role-based access
- [ ] Inventory management integration
- [ ] Mobile app development
- [ ] Advanced analytics with AI insights
- [ ] Integration with payment gateways
- [ ] Multi-location support
- [ ] Tax calculation and reporting

## 📊 Performance

- Real-time data synchronization
- Optimized Firebase queries
- Efficient React rendering
- Minimal bundle size
- Fast loading times

---

**Built with ❤️ for restaurant owners and managers**
