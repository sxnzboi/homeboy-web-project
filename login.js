// Firebase Authentication + staff role lookup
// Setup: Firebase Console → Authentication → Email/Password
//         Firestore → staff/{uid} → { role: "admin"|"rider"|"kitchen", email: "..." }

document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();

    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;
    const errorMsg = document.getElementById('login-error');
    errorMsg.style.display = 'none';

    if (!email || !password) {
        errorMsg.innerText = 'กรุณากรอกอีเมลและรหัสผ่าน';
        errorMsg.style.display = 'block';
        return;
    }

    if (!HomieAuth.isFirebaseConfigured()) {
        errorMsg.innerText = 'Firebase ยังไม่ได้ตั้งค่า กรุณาตรวจสอบ firebase-config.js';
        errorMsg.style.display = 'block';
        return;
    }

    try {
        const auth = HomieAuth.getAuth();
        const credential = await auth.signInWithEmailAndPassword(email, password);
        const role = await db.collection('staff').doc(credential.user.uid).get();

        if (!role.exists) {
            await auth.signOut();
            errorMsg.innerText = 'บัญชีนี้ยังไม่ได้รับสิทธิ์ใช้งาน ติดต่อผู้ดูแลระบบ';
            errorMsg.style.display = 'block';
            return;
        }

        const staffRole = role.data().role;
        if (staffRole === 'admin') {
            window.location.href = 'admin.html';
        } else if (staffRole === 'rider') {
            window.location.href = 'delivery.html';
        } else if (staffRole === 'kitchen') {
            window.location.href = 'kitchen.html';
        } else {
            await auth.signOut();
            errorMsg.innerText = 'บทบาทผู้ใช้ไม่ถูกต้อง';
            errorMsg.style.display = 'block';
        }
    } catch (err) {
        console.error('Login error:', err);
        const messages = {
            'auth/user-not-found': 'ไม่พบบัญชีผู้ใช้นี้',
            'auth/wrong-password': 'รหัสผ่านไม่ถูกต้อง',
            'auth/invalid-email': 'รูปแบบอีเมลไม่ถูกต้อง',
            'auth/too-many-requests': 'ลองใหม่ภายหลัง มีการเข้าสู่ระบบผิดพลาดหลายครั้ง'
        };
        errorMsg.innerText = messages[err.code] || 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง';
        errorMsg.style.display = 'block';
    }
});

HomieAuth.redirectIfSignedIn();
