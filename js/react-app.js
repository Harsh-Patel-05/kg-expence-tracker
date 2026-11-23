// React Components for Restaurant Expense Management
const { useState, useEffect, useCallback } = React;
const { BrowserRouter, Routes, Route, Link, useNavigate } = ReactRouterDOM;
const { LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } = Recharts;

// Global state management
const AppState = React.createContext();

// Utility functions
const formatCurrency = (amount) => `${APP_CONFIG.currency}${Number(amount || 0).toFixed(2)}`;
const formatDate = (date) => new Date(date).toLocaleDateString();
const getToday = () => new Date().toISOString().split('T')[0];
const getCurrentMonth = () => new Date().toISOString().slice(0, 7);

// Colors for charts
const COLORS = ['#6366f1', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#3b82f6'];

// Main App Component
function App() {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const [showWelcome, setShowWelcome] = useState(true);

    useEffect(() => {
        // Initialize Firebase and check auth
        const initApp = async () => {
            try {
                // Simulate user login (in real app, use Firebase Auth)
                setTimeout(() => {
                    setUser({ name: 'Mihir', email: 'mihir@restaurant.com' });
                    setLoading(false);
                    // Hide welcome screen after 2 seconds
                    setTimeout(() => setShowWelcome(false), 2000);
                }, 1000);
            } catch (error) {
                console.error('App initialization error:', error);
                setLoading(false);
            }
        };

        initApp();
    }, []);

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
            </div>
        );
    }

    if (showWelcome) {
        return (
            <div className="fixed inset-0 bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center z-50 welcome-animation">
                <div className="text-center text-white">
                    <div className="text-6xl font-bold mb-4">🍽️</div>
                    <h1 className="text-5xl font-bold mb-4">{APP_CONFIG.welcomeMessage}</h1>
                    <p className="text-xl opacity-90">Your restaurant is ready to serve</p>
                </div>
            </div>
        );
    }

    return (
        <AppState.Provider value={{ user }}>
            <BrowserRouter>
                <div className="min-h-screen bg-gray-50">
                    <Sidebar />
                    <div className="ml-64">
                        <Routes>
                            <Route path="/" element={<Dashboard />} />
                            <Route path="/sales" element={<SalesModule />} />
                            <Route path="/staff" element={<StaffModule />} />
                            <Route path="/suppliers" element={<SuppliersModule />} />
                            <Route path="/expenses" element={<ExpensesModule />} />
                            <Route path="/analytics" element={<AnalyticsModule />} />
                            <Route path="/reminders" element={<RemindersModule />} />
                        </Routes>
                    </div>
                </div>
            </BrowserRouter>
        </AppState.Provider>
    );
}

// Sidebar Navigation Component
function Sidebar() {
    const location = window.location.pathname;
    const menuItems = [
        { path: '/', icon: '📊', label: 'Dashboard' },
        { path: '/sales', icon: '💰', label: 'Sales' },
        { path: '/staff', icon: '👥', label: 'Staff' },
        { path: '/suppliers', icon: '🏪', label: 'Suppliers' },
        { path: '/expenses', icon: '💸', label: 'Expenses' },
        { path: '/analytics', icon: '📈', label: 'Analytics' },
        { path: '/reminders', icon: '⏰', label: 'Reminders' }
    ];

    return (
        <div className="fixed left-0 top-0 h-full w-64 bg-white shadow-lg z-40">
            <div className="p-6 border-b">
                <h1 className="text-2xl font-bold text-gray-800">🍽️ KG Tracker</h1>
                <p className="text-sm text-gray-600 mt-1">Restaurant Expense Manager</p>
            </div>
            <nav className="p-4">
                {menuItems.map((item) => (
                    <Link
                        key={item.path}
                        to={item.path}
                        className={`flex items-center space-x-3 px-4 py-3 rounded-lg mb-2 transition-colors ${
                            location === item.path
                                ? 'bg-indigo-100 text-indigo-700 border-l-4 border-indigo-600'
                                : 'hover:bg-gray-100 text-gray-700'
                        }`}
                    >
                        <span className="text-xl">{item.icon}</span>
                        <span className="font-medium">{item.label}</span>
                    </Link>
                ))}
            </nav>
        </div>
    );
}

// Dashboard Component
function Dashboard() {
    const [kpis, setKpis] = useState({
        cashBalance: 0,
        bankBalance: 0,
        totalBalance: 0,
        totalRevenue: 0,
        unpaidBills: 0,
        netProfit: 0,
        totalSales: 0
    });
    const [recentTransactions, setRecentTransactions] = useState([]);
    const [upcomingPayments, setUpcomingPayments] = useState([]);
    const [salesData, setSalesData] = useState([]);
    const [expenseData, setExpenseData] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadDashboardData();
    }, []);

    const loadDashboardData = async () => {
        try {
            setLoading(true);
            // Load data from Firebase
            const sales = await getData(COLLECTIONS.SALES);
            const expenses = await getData(COLLECTIONS.EXPENSES);
            const supplierBills = await getData(COLLECTIONS.SUPPLIER_BILLS);
            const salaries = await getData(COLLECTIONS.ATTENDANCE);

            // Calculate KPIs
            const cashSales = sales.reduce((sum, sale) => sum + (sale.cashAmount || 0), 0);
            const swiggySales = sales.reduce((sum, sale) => sum + (sale.swiggyAmount || 0), 0);
            const zomatoSales = sales.reduce((sum, sale) => sum + (sale.zomatoAmount || 0), 0);
            const otherOnlineSales = sales.reduce((sum, sale) => sum + (sale.otherOnlineAmount || 0), 0);
            const totalOnlineSales = swiggySales + zomatoSales + otherOnlineSales;
            const totalRevenue = cashSales + totalOnlineSales;
            const totalExpenses = expenses.reduce((sum, exp) => sum + (exp.amount || 0), 0);
            const unpaidBills = supplierBills
                .filter(bill => bill.status === 'unpaid')
                .reduce((sum, bill) => sum + (bill.amount || 0), 0);
            const netProfit = totalRevenue - totalExpenses;

            setKpis({
                cashBalance: cashSales,
                bankBalance: totalOnlineSales,
                totalBalance: totalRevenue,
                totalRevenue,
                unpaidBills,
                netProfit,
                totalSales: sales.length
            });

            // Prepare chart data
            const last7Days = Array.from({ length: 7 }, (_, i) => {
                const date = new Date();
                date.setDate(date.getDate() - (6 - i));
                return date.toISOString().split('T')[0];
            });

            const salesChartData = last7Days.map(date => {
                const daySales = sales.filter(sale => sale.date === date);
                return {
                    date: date.slice(5),
                    cash: daySales.reduce((sum, sale) => sum + (sale.cashAmount || 0), 0),
                    swiggy: daySales.reduce((sum, sale) => sum + (sale.swiggyAmount || 0), 0),
                    zomato: daySales.reduce((sum, sale) => sum + (sale.zomatoAmount || 0), 0),
                    otherOnline: daySales.reduce((sum, sale) => sum + (sale.otherOnlineAmount || 0), 0)
                };
            });

            setSalesData(salesChartData);

            // Recent transactions
            const recent = [...sales, ...expenses]
                .sort((a, b) => new Date(b.date) - new Date(a.date))
                .slice(0, 5);
            setRecentTransactions(recent);

            // Upcoming payments (mock data for now)
            setUpcomingPayments([
                { name: 'Rent', amount: 2500, dueDate: '2024-01-01', type: 'expense' },
                { name: 'Staff Salary', amount: 3200, dueDate: '2024-01-05', type: 'salary' },
                { name: 'Electricity Bill', amount: 450, dueDate: '2024-01-10', type: 'utility' }
            ]);

        } catch (error) {
            console.error('Error loading dashboard data:', error);
        } finally {
            setLoading(false);
        }
    };

    if (loading) {
        return (
            <div className="p-8">
                <div className="animate-pulse">
                    <div className="h-8 bg-gray-200 rounded w-1/4 mb-8"></div>
                    <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-6 mb-8">
                        {[...Array(7)].map((_, i) => (
                            <div key={i} className="h-32 bg-gray-200 rounded"></div>
                        ))}
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="p-8">
            <div className="mb-8">
                <h1 className="text-3xl font-bold text-gray-800 mb-2">Dashboard</h1>
                <p className="text-gray-600">Restaurant expense management overview</p>
            </div>

            {/* KPI Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-6 mb-8">
                <KPICard
                    title="💰 Cash Balance"
                    value={formatCurrency(kpis.cashBalance)}
                    subtitle="Available cash"
                    color="bg-green-500"
                />
                <KPICard
                    title="🏦 Bank Balance"
                    value={formatCurrency(kpis.bankBalance)}
                    subtitle="Bank funds"
                    color="bg-blue-500"
                />
                <KPICard
                    title="🧾 Total Balance"
                    value={formatCurrency(kpis.totalBalance)}
                    subtitle="Cash + Bank"
                    color="bg-purple-500"
                />
                <KPICard
                    title="📈 Total Revenue"
                    value={formatCurrency(kpis.totalRevenue)}
                    subtitle="All sales"
                    color="bg-indigo-500"
                />
                <KPICard
                    title="⚠️ Unpaid Bills"
                    value={formatCurrency(kpis.unpaidBills)}
                    subtitle="Pending payments"
                    color="bg-red-500"
                />
                <KPICard
                    title="💵 Net Profit"
                    value={formatCurrency(kpis.netProfit)}
                    subtitle="Revenue - Expenses"
                    color={kpis.netProfit >= 0 ? "bg-green-500" : "bg-red-500"}
                />
                <KPICard
                    title="🛒 Total Sales"
                    value={kpis.totalSales.toString()}
                    subtitle="Transactions"
                    color="bg-orange-500"
                />
            </div>

            {/* Charts */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
                <div className="bg-white p-6 rounded-lg shadow">
                    <h2 className="text-xl font-semibold mb-4">Daily Sales Breakdown</h2>
                    <ResponsiveContainer width="100%" height={300}>
                        <BarChart data={salesData}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="date" />
                            <YAxis />
                            <Tooltip formatter={(value) => formatCurrency(value)} />
                            <Legend />
                            <Bar dataKey="cash" fill="#10b981" name="Cash Sales" />
                            <Bar dataKey="swiggy" fill="#fb923c" name="🍔 Swiggy" />
                            <Bar dataKey="zomato" fill="#ef4444" name="🍴 Zomato" />
                            <Bar dataKey="otherOnline" fill="#3b82f6" name="Other Online" />
                        </BarChart>
                    </ResponsiveContainer>
                </div>

                <div className="bg-white p-6 rounded-lg shadow">
                    <h2 className="text-xl font-semibold mb-4">Swiggy vs Zomato Performance</h2>
                    <ResponsiveContainer width="100%" height={300}>
                        <PieChart>
                            <Pie
                                data={[
                                    { name: '🍔 Swiggy', value: swiggySales },
                                    { name: '🍴 Zomato', value: zomatoSales },
                                    { name: 'Other Online', value: otherOnlineSales }
                                ]}
                                cx="50%"
                                cy="50%"
                                outerRadius={80}
                                fill="#8884d8"
                                dataKey="value"
                                label
                            >
                                {[
                                    { name: '🍔 Swiggy', value: swiggySales },
                                    { name: '🍴 Zomato', value: zomatoSales },
                                    { name: 'Other Online', value: otherOnlineSales }
                                ].map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={['#fb923c', '#ef4444', '#3b82f6'][index]} />
                                ))}
                            </Pie>
                            <Tooltip formatter={(value) => formatCurrency(value)} />
                            <Legend />
                        </PieChart>
                    </ResponsiveContainer>
                </div>
            </div>

            {/* Recent Transactions and Upcoming Payments */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-white p-6 rounded-lg shadow">
                    <h2 className="text-xl font-semibold mb-4">Recent Transactions</h2>
                    <div className="space-y-3">
                        {recentTransactions.map((transaction, index) => (
                            <div key={index} className="flex justify-between items-center p-3 bg-gray-50 rounded">
                                <div>
                                    <p className="font-medium">{transaction.type || 'Sale'}</p>
                                    <p className="text-sm text-gray-600">{formatDate(transaction.date)}</p>
                                </div>
                                <p className="font-semibold">
                                    {transaction.type === 'expense' ? '-' : '+'}
                                    {formatCurrency(transaction.amount || transaction.totalAmount)}
                                </p>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="bg-white p-6 rounded-lg shadow">
                    <h2 className="text-xl font-semibold mb-4">Upcoming Payments</h2>
                    <div className="space-y-3">
                        {upcomingPayments.map((payment, index) => (
                            <div key={index} className="flex justify-between items-center p-3 bg-yellow-50 rounded">
                                <div>
                                    <p className="font-medium">{payment.name}</p>
                                    <p className="text-sm text-gray-600">Due: {formatDate(payment.dueDate)}</p>
                                </div>
                                <p className="font-semibold text-red-600">
                                    {formatCurrency(payment.amount)}
                                </p>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}

// KPI Card Component
function KPICard({ title, value, subtitle, color }) {
    return (
        <div className={`${color} p-6 rounded-lg shadow text-white card-hover`}>
            <div className="flex justify-between items-start">
                <div>
                    <p className="text-sm opacity-90 mb-1">{title}</p>
                    <p className="text-2xl font-bold">{value}</p>
                    <p className="text-xs opacity-75 mt-1">{subtitle}</p>
                </div>
            </div>
        </div>
    );
}

// Sales Module Component
function SalesModule() {
    const [sales, setSales] = useState([]);
    const [formData, setFormData] = useState({
        date: getToday(),
        cashAmount: '',
        swiggyAmount: '',
        zomatoAmount: '',
        otherOnlineAmount: '',
        notes: ''
    });

    useEffect(() => {
        loadSales();
    }, []);

    const loadSales = async () => {
        try {
            const data = await getData(COLLECTIONS.SALES);
            setSales(data.sort((a, b) => new Date(b.date) - new Date(a.date)));
        } catch (error) {
            console.error('Error loading sales:', error);
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            const cashAmount = Number(formData.cashAmount || 0);
            const swiggyAmount = Number(formData.swiggyAmount || 0);
            const zomatoAmount = Number(formData.zomatoAmount || 0);
            const otherOnlineAmount = Number(formData.otherOnlineAmount || 0);
            const totalOnlineAmount = swiggyAmount + zomatoAmount + otherOnlineAmount;
            const totalAmount = cashAmount + totalOnlineAmount;
            
            await addData(COLLECTIONS.SALES, {
                ...formData,
                cashAmount,
                swiggyAmount,
                zomatoAmount,
                otherOnlineAmount,
                totalOnlineAmount,
                totalAmount
            });
            
            setFormData({
                date: getToday(),
                cashAmount: '',
                swiggyAmount: '',
                zomatoAmount: '',
                otherOnlineAmount: '',
                notes: ''
            });
            
            await loadSales();
            alert('Sales entry added successfully!');
        } catch (error) {
            console.error('Error adding sales:', error);
            alert('Error adding sales entry');
        }
    };

    return (
        <div className="p-8">
            <h1 className="text-3xl font-bold text-gray-800 mb-8">Sales Management</h1>
            
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Add Sales Form */}
                <div className="lg:col-span-1">
                    <div className="bg-white p-6 rounded-lg shadow">
                        <h2 className="text-xl font-semibold mb-4">Add Sales Entry</h2>
                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
                                <input
                                    type="date"
                                    value={formData.date}
                                    onChange={(e) => setFormData({...formData, date: e.target.value})}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                    required
                                />
                            </div>
                            
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Cash Amount</label>
                                <input
                                    type="number"
                                    step="0.01"
                                    value={formData.cashAmount}
                                    onChange={(e) => setFormData({...formData, cashAmount: e.target.value})}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                    placeholder="0.00"
                                />
                            </div>
                            
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">🍔 Swiggy Amount</label>
                                <input
                                    type="number"
                                    step="0.01"
                                    value={formData.swiggyAmount}
                                    onChange={(e) => setFormData({...formData, swiggyAmount: e.target.value})}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500"
                                    placeholder="0.00"
                                />
                            </div>
                            
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">🍴 Zomato Amount</label>
                                <input
                                    type="number"
                                    step="0.01"
                                    value={formData.zomatoAmount}
                                    onChange={(e) => setFormData({...formData, zomatoAmount: e.target.value})}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500"
                                    placeholder="0.00"
                                />
                            </div>
                            
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Other Online Amount</label>
                                <input
                                    type="number"
                                    step="0.01"
                                    value={formData.otherOnlineAmount}
                                    onChange={(e) => setFormData({...formData, otherOnlineAmount: e.target.value})}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                    placeholder="Other online platforms..."
                                />
                            </div>
                            
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                                <textarea
                                    value={formData.notes}
                                    onChange={(e) => setFormData({...formData, notes: e.target.value})}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                    rows={3}
                                    placeholder="Optional notes..."
                                />
                            </div>
                            
                            <button
                                type="submit"
                                className="w-full bg-indigo-600 text-white py-2 px-4 rounded-md hover:bg-indigo-700 transition-colors"
                            >
                                Add Sales Entry
                            </button>
                        </form>
                    </div>
                </div>

                {/* Sales List */}
                <div className="lg:col-span-2">
                    <div className="bg-white p-6 rounded-lg shadow">
                        <h2 className="text-xl font-semibold mb-4">Recent Sales</h2>
                        <div className="overflow-x-auto">
                            <table className="min-w-full divide-y divide-gray-200">
                                <thead className="bg-gray-50">
                                    <tr>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Cash</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">🍔 Swiggy</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">🍴 Zomato</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Other Online</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Total</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Notes</th>
                                    </tr>
                                </thead>
                                <tbody className="bg-white divide-y divide-gray-200">
                                    {sales.map((sale) => (
                                        <tr key={sale.id}>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                                {formatDate(sale.date)}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                                {formatCurrency(sale.cashAmount)}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                                {formatCurrency(sale.swiggyAmount)}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                                {formatCurrency(sale.zomatoAmount)}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                                {formatCurrency(sale.otherOnlineAmount)}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                                                {formatCurrency(sale.totalAmount)}
                                            </td>
                                            <td className="px-6 py-4 text-sm text-gray-500">
                                                {sale.notes || '-'}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

// Placeholder components for other modules
function StaffModule() {
    return (
        <div className="p-8">
            <h1 className="text-3xl font-bold text-gray-800 mb-8">Staff Management</h1>
            <div className="bg-white p-6 rounded-lg shadow">
                <p className="text-gray-600">Staff management module coming soon...</p>
            </div>
        </div>
    );
}

function SuppliersModule() {
    return (
        <div className="p-8">
            <h1 className="text-3xl font-bold text-gray-800 mb-8">Supplier Management</h1>
            <div className="bg-white p-6 rounded-lg shadow">
                <p className="text-gray-600">Supplier management module coming soon...</p>
            </div>
        </div>
    );
}

function ExpensesModule() {
    return (
        <div className="p-8">
            <h1 className="text-3xl font-bold text-gray-800 mb-8">Expense Management</h1>
            <div className="bg-white p-6 rounded-lg shadow">
                <p className="text-gray-600">Expense management module coming soon...</p>
            </div>
        </div>
    );
}

function AnalyticsModule() {
    return (
        <div className="p-8">
            <h1 className="text-3xl font-bold text-gray-800 mb-8">Analytics</h1>
            <div className="bg-white p-6 rounded-lg shadow">
                <p className="text-gray-600">Analytics module coming soon...</p>
            </div>
        </div>
    );
}

function RemindersModule() {
    return (
        <div className="p-8">
            <h1 className="text-3xl font-bold text-gray-800 mb-8">Reminders</h1>
            <div className="bg-white p-6 rounded-lg shadow">
                <p className="text-gray-600">Reminders module coming soon...</p>
            </div>
        </div>
    );
}

// Initialize the app
document.addEventListener('DOMContentLoaded', function() {
    const root = ReactDOM.createRoot(document.getElementById('root'));
    root.render(React.createElement(App));
});
