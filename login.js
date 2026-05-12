document.getElementById('login-form').addEventListener('submit', function (e) {
    e.preventDefault();

    const user = document.getElementById('username').value;
    const pass = document.getElementById('password').value;
    const errorMsg = document.getElementById('login-error');

    // Simple hardcoded credentials
    if (user === 'niran' && pass === '43999934') {
        localStorage.setItem('adminSession', 'true');
        window.location.href = 'admin.html';
    } else {
        errorMsg.style.display = 'block';
        // Shake animation or visual feedback could be added here
    }
});

// If already logged in, redirect to admin
if (localStorage.getItem('adminSession') === 'true') {
    window.location.href = 'admin.html';
}
