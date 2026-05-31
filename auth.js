/**
 * HomieBoy Auth & Security helpers
 * Requires: firebase-app, firebase-auth, firebase-firestore, firebase-config.js
 */
const HomieAuth = (() => {
    let _auth = null;

    function isFirebaseConfigured() {
        try {
            return typeof firebaseConfig !== 'undefined'
                && firebaseConfig.apiKey
                && firebaseConfig.apiKey !== 'YOUR_API_KEY';
        } catch (e) {
            return false;
        }
    }

    function getAuth() {
        if (!_auth && typeof firebase !== 'undefined' && firebase.auth) {
            _auth = firebase.auth();
        }
        return _auth;
    }

    function generateTrackToken() {
        const arr = new Uint8Array(24);
        crypto.getRandomValues(arr);
        return Array.from(arr, b => b.toString(16).padStart(2, '0')).join('');
    }

    function escapeHtml(str) {
        if (str == null) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function buildPublicOrderPayload(orderId, trackToken, orderData) {
        return {
            orderId,
            trackToken,
            status: orderData.status || 'รอดำเนินการ',
            customerName: orderData.customerName || '',
            phone: orderData.phone || '',
            address: orderData.address || '',
            items: (orderData.items || []).map(i => ({
                name: i.name,
                quantity: i.quantity || 1,
                finalPrice: i.finalPrice
            })),
            total: orderData.total,
            timestamp: orderData.timestamp || new Date().toISOString()
        };
    }

    async function createPublicOrder(orderId, trackToken, orderData) {
        if (!isFirebaseConfigured() || typeof db === 'undefined') return;
        const payload = buildPublicOrderPayload(orderId, trackToken, orderData);
        await db.collection('publicOrders').doc(trackToken).set(payload);
    }

    async function syncPublicOrder(trackToken, updates) {
        if (!trackToken || !isFirebaseConfigured() || typeof db === 'undefined') return;
        try {
            await db.collection('publicOrders').doc(trackToken).update(updates);
        } catch (e) {
            console.warn('syncPublicOrder failed:', e.message);
        }
    }

    async function syncPublicOrderByOrderId(orderId, updates) {
        if (!isFirebaseConfigured() || typeof db === 'undefined') return;
        try {
            const snap = await db.collection('orders').doc(orderId).get();
            const trackToken = snap.exists ? snap.data().trackToken : null;
            if (trackToken) await syncPublicOrder(trackToken, updates);
        } catch (e) {
            console.warn('syncPublicOrderByOrderId failed:', e.message);
        }
    }

    async function updateOrderStatus(orderId, status, extra = {}) {
        const payload = { status, ...extra };
        if (isFirebaseConfigured() && typeof db !== 'undefined') {
            await db.collection('orders').doc(orderId).update(payload);
            await syncPublicOrderByOrderId(orderId, payload);
        } else {
            const orders = JSON.parse(localStorage.getItem('orders') || '[]');
            const idx = orders.findIndex(o => String(o.id) === String(orderId));
            if (idx > -1) {
                orders[idx] = { ...orders[idx], ...payload };
                localStorage.setItem('orders', JSON.stringify(orders));
                const trackToken = orders[idx].trackToken;
                if (trackToken) {
                    const publicOrders = JSON.parse(localStorage.getItem('publicOrders') || '{}');
                    publicOrders[trackToken] = { ...(publicOrders[trackToken] || {}), ...payload };
                    localStorage.setItem('publicOrders', JSON.stringify(publicOrders));
                }
            }
        }
    }

    async function getStaffRole(uid) {
        const doc = await db.collection('staff').doc(uid).get();
        if (!doc.exists) return null;
        return doc.data().role || null;
    }

    function requireRole(allowedRoles) {
        if (!isFirebaseConfigured()) {
            return Promise.resolve({ role: 'dev', user: null });
        }

        return new Promise((resolve, reject) => {
            const auth = getAuth();
            if (!auth) {
                window.location.href = 'login.html';
                return reject(new Error('Auth unavailable'));
            }

            const unsub = auth.onAuthStateChanged(async (user) => {
                unsub();
                if (!user) {
                    window.location.href = 'login.html';
                    return reject(new Error('Not signed in'));
                }
                try {
                    const role = await getStaffRole(user.uid);
                    if (!role || !allowedRoles.includes(role)) {
                        await auth.signOut();
                        window.location.href = 'login.html';
                        return reject(new Error('Insufficient role'));
                    }
                    resolve({ user, role });
                } catch (err) {
                    console.error('Auth role check failed:', err);
                    window.location.href = 'login.html';
                    reject(err);
                }
            });
        });
    }

    function logout() {
        if (isFirebaseConfigured() && getAuth()) {
            return getAuth().signOut().then(() => {
                window.location.href = 'login.html';
            });
        }
        localStorage.removeItem('adminSession');
        localStorage.removeItem('riderSession');
        localStorage.removeItem('kdsSession');
        window.location.href = 'login.html';
    }

    function redirectIfSignedIn() {
        if (!isFirebaseConfigured()) return;
        const auth = getAuth();
        if (!auth) return;
        auth.onAuthStateChanged(async (user) => {
            if (!user) return;
            try {
                const role = await getStaffRole(user.uid);
                if (role === 'admin') window.location.href = 'admin.html';
                else if (role === 'rider') window.location.href = 'delivery.html';
                else if (role === 'kitchen') window.location.href = 'kitchen.html';
            } catch (e) { /* stay on login */ }
        });
    }

    return {
        isFirebaseConfigured,
        getAuth,
        generateTrackToken,
        escapeHtml,
        buildPublicOrderPayload,
        createPublicOrder,
        syncPublicOrder,
        syncPublicOrderByOrderId,
        updateOrderStatus,
        requireRole,
        logout,
        redirectIfSignedIn
    };
})();

window.HomieAuth = HomieAuth;
