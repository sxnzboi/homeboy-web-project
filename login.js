// Secure login handling using Firebase Firestore
// Assumes firebase is initialized and db is exported from firebase-config.js

document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();

    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value.trim();
    const errorMsg = document.getElementById('login-error');
    errorMsg.style.display = 'none';

    if (!username || !password) {
        errorMsg.innerText = 'กรุณากรอกชื่อผู้ใช้และรหัสผ่าน';
        errorMsg.style.display = 'block';
        return;
    }

    try {
        const snapshot = await db.collection('users')
            .where('username', '==', username)
            .limit(1)
            .get();

        if (!snapshot.empty) {
            const userDoc = snapshot.docs[0];
            const data = userDoc.data();
            // NOTE: In production, passwords should be hashed.
            if (data.password === password) {
                if (data.role === 'admin') {
                    localStorage.setItem('adminSession', 'true');
                    window.location.href = 'admin.html';
                } else if (data.role === 'rider') {
                    localStorage.setItem('riderSession', 'true');
                    window.location.href = 'delivery.html';
                } else {
                    errorMsg.innerText = 'บทบาทผู้ใช้ไม่ถูกต้อง';
                    errorMsg.style.display = 'block';
                }
                return;
            }
        }
        // Login failed
        errorMsg.innerText = 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง';
        errorMsg.style.display = 'block';
    } catch (err) {
        console.error('Login error:', err);
        errorMsg.innerText = 'เกิดข้อผิดพลาดในการเข้าสู่ระบบ';
        errorMsg.style.display = 'block';
    }
});

// Auto-redirect if session already exists
if (localStorage.getItem('adminSession') === 'true') {
    window.location.href = 'admin.html';
} else if (localStorage.getItem('riderSession') === 'true') {
    window.location.href = 'delivery.html';
}
