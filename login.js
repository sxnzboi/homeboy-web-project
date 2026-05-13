document.getElementById('login-form').addEventListener('submit', function (e) {
    e.preventDefault();

    const user = document.getElementById('username').value;
    const pass = document.getElementById('password').value;
    const errorMsg = document.getElementById('login-error');

    // Login Logic
    if (user === 'niran' && pass === '43999934') {
        localStorage.setItem('adminSession', 'true');
        window.location.href = 'admin.html';
    } 
    else if (user === 'rider' && pass === 'rider123') {
        localStorage.setItem('riderSession', 'true');
        window.location.href = 'delivery.html';
    }
    else {
        errorMsg.style.display = 'block';
    }
});

// Auto Redirect if session exists
if (localStorage.getItem('adminSession') === 'true') {
    window.location.href = 'admin.html';
} else if (localStorage.getItem('riderSession') === 'true') {
    window.location.href = 'delivery.html';
}
