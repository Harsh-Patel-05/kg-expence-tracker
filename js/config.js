// Firebase Configuration
const firebaseConfig = {
    apiKey: "AIzaSyAJOjwJ94w5hYtux2pCT68vZN4b7_dscP4",
    authDomain: "kilogram-expance-trakker.firebaseapp.com",
    projectId: "kilogram-expance-trakker",
    storageBucket: "kilogram-expance-trakker.firebasestorage.app",
    messagingSenderId: "229357156392",
    appId: "1:229357156392:web:3f635f44f00e3b1e321d1d",
    measurementId: "G-ZKF372MVSP"
};

// Expose for other scripts that check `window.firebaseConfig`
window.firebaseConfig = firebaseConfig;

// App Configuration
const APP_CONFIG = {
    appName: "KG Restaurant Expense Tracker",
    welcomeMessage: "Welcome back Mihir 👋",
    currency: "$",
    dateFormat: "MM/DD/YYYY",
    monthFormat: "MMMM YYYY"
};

// Firestore Collections
const COLLECTIONS = {
    USERS: "users",
    SALES: "sales",
    STAFF: "staff",
    ATTENDANCE: "attendance",
    ADVANCES: "advances",
    SUPPLIERS: "suppliers",
    SUPPLIER_BILLS: "supplierBills",
    EXPENSES: "expenses",
    REMINDERS: "reminders",
    BALANCES: "balances"
};

// Salary Calculation Constants
const SALARY_CONFIG = {
    DAYS_IN_MONTH: 30,
    ATTENDANCE_VALUES: {
        present: 1,
        half_day: 0.5,
        absent: 0
    }
};
