// --- Fallback & Initial Data ---
let menuItems = [];
let cart = [];
let pendingProduct = null;
let useFirebase = false;

// Check if Firebase is properly configured
try {
    if (firebase.apps.length && firebaseConfig.apiKey !== "YOUR_API_KEY") {
        useFirebase = true;
        console.log("Firebase initialized successfully.");
    } else {
        console.warn("Firebase not configured. Using LocalStorage fallback.");
    }
} catch (e) {
    console.warn("Firebase initialization failed. Using LocalStorage fallback.");
}

// DOM Elements
const menuGrid = document.getElementById('menu-grid');
const cartSidebar = document.getElementById('cart-sidebar');
const cartItemsContainer = document.getElementById('cart-items-container');
const cartTotalElement = document.getElementById('cart-total');
const cartCountElement = document.querySelector('.cart-count');
const customModal = document.getElementById('custom-modal');
const checkoutModal = document.getElementById('checkout-modal');

// --- Slip Upload Logic ---
let slipBase64 = null;

const slipFileInput   = document.getElementById('slip-file');
const slipDropZone    = document.getElementById('slip-drop-zone');
const slipPlaceholder = document.getElementById('slip-placeholder');
const slipPreviewWrap = document.getElementById('slip-preview-wrap');
const slipPreviewImg  = document.getElementById('slip-preview-img');

function handleSlipFile(file) {
    if (!file || !file.type.startsWith('image/')) return;
    if (file.size > 5 * 1024 * 1024) {
        return alert('ไฟล์ใหญ่เกิน 5MB กรุณาเลือกไฟล์ใหม่');
    }
    const reader = new FileReader();
    reader.onload = (e) => {
        slipBase64 = e.target.result;
        slipPreviewImg.src = slipBase64;
        slipPlaceholder.style.display = 'none';
        slipPreviewWrap.style.display = 'inline-block';
        lucide.createIcons();
    };
    reader.readAsDataURL(file);
}

function removeSlip() {
    slipBase64 = null;
    slipFileInput.value = '';
    slipPreviewImg.src = '';
    slipPlaceholder.style.display = 'flex';
    slipPreviewWrap.style.display = 'none';
}

slipFileInput.addEventListener('change', (e) => handleSlipFile(e.target.files[0]));

slipDropZone.addEventListener('dragover',  (e) => { e.preventDefault(); slipDropZone.classList.add('drag-over'); });
slipDropZone.addEventListener('dragleave', ()  => slipDropZone.classList.remove('drag-over'));
slipDropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    slipDropZone.classList.remove('drag-over');
    handleSlipFile(e.dataTransfer.files[0]);
});

// --- Data Fetching ---
function loadMenu() {
    if (useFirebase) {
        db.collection('menu').onSnapshot((snapshot) => {
            menuItems = snapshot.docs.map(doc => {
                const data = doc.data();
                return { ...data, id: doc.id };
            });
            renderMenu();
        });
    } else {
        menuItems = JSON.parse(localStorage.getItem('menuItems')) || [];
        renderMenu();
    }
}

async function seedInitialMenu() {
    for (const item of initialMenu) {
        await db.collection('menu').add(item);
    }
}

// --- Initialization ---
function renderMenu(filter = 'all') {
    const filtered = filter === 'all' ? menuItems : menuItems.filter(item => item.category === filter);
    if (!menuGrid) return;
    
    if (filtered.length === 0) {
        menuGrid.innerHTML = '<p style="text-align: center; grid-column: 1/-1; padding: 50px; color: #888;">ไม่พบรายการเมนูในหมวดหมู่นี้</p>';
        return;
    }

    menuGrid.innerHTML = filtered.map(item => {
        const isAvailable = item.isAvailable !== false;
        return `
        <div class="menu-card ${!isAvailable ? 'sold-out' : ''}">
            <div class="menu-card-img-wrap">
                <img src="${item.image}" alt="${item.name}" onerror="this.src='https://images.unsplash.com/photo-1586816001966-79b736744398?auto=format&fit=crop&q=80&w=600'">
                ${!isAvailable ? '<div class="sold-out-badge">ของหมด</div>' : ''}
            </div>
            <div class="menu-card-content">
                <div class="menu-card-header">
                    <h3 class="menu-card-title">${item.name}</h3>
                    <span class="menu-card-price">฿${item.price}</span>
                </div>
                <p class="menu-card-desc">${item.description}</p>
                <button class="btn ${isAvailable ? 'btn-primary' : 'btn-outline'}" 
                        style="width: 100%; margin-top: 15px;" 
                        onclick="${isAvailable ? `openCustomModal('${item.id}')` : 'void(0)'}"
                        ${!isAvailable ? 'disabled' : ''}>
                    ${isAvailable ? 'เพิ่มลงตะกร้า' : 'สินค้าหมดชั่วคราว'}
                </button>
            </div>
        </div>
    `;}).join('');
}

// --- Category Logic ---
function filterCategory(cat) {
    document.querySelectorAll('.cat-btn').forEach(btn => {
        btn.classList.remove('active');
        if(btn.innerText.toLowerCase().includes(cat === 'food' ? 'อาหาร' : cat === 'drink' ? 'เครื่องดื่ม' : cat === 'dessert' ? 'ของหวาน' : 'ทั้งหมด')) {
            btn.classList.add('active');
        }
    });
    renderMenu(cat);
}

// --- Customization Modal ---
function openCustomModal(id) {
    pendingProduct = menuItems.find(i => i.id == id);
    if (!pendingProduct) return;

    // ถ้าเป็นของหวาน (dessert) ให้เพิ่มลงตะกร้าทันที
    if (pendingProduct.category === 'dessert') {
        addToCartDirectly(pendingProduct);
        return;
    }

    // ตั้งชื่อหัวข้อ Modal
    document.getElementById('modal-product-name').innerText = `ปรับแต่ง ${pendingProduct.name}`;
    
    // เลือกแสดงชุดตัวเลือกตามประเภท
    const foodDiv = document.getElementById('food-options');
    const drinkDiv = document.getElementById('drink-options');
    
    if (pendingProduct.category === 'drink') {
        foodDiv.style.display = 'none';
        drinkDiv.style.display = 'block';
    } else {
        foodDiv.style.display = 'block';
        drinkDiv.style.display = 'none';
    }

    customModal.classList.add('active');
}

function addToCartDirectly(product) {
    cart.push({
        ...product,
        cartItemId: Date.now(),
        finalPrice: product.price,
        customOptions: { note: '', isDirect: true }
    });
    updateCart();
    openCart();
}

document.getElementById('close-custom').onclick = () => customModal.classList.remove('active');

document.getElementById('confirm-add').onclick = () => {
    let options = {
        note: document.getElementById('opt-note').value
    };
    
    let price = pendingProduct.price;

    if (pendingProduct.category === 'drink') {
        // ดึงค่าความหวาน
        const sweetness = document.querySelector('input[name="sweetness"]:checked').value;
        options.sweetness = sweetness;
    } else {
        // ตัวเลือกอาหาร
        options.noVeggie = document.getElementById('opt-no-veggie').checked;
        options.noSauce = document.getElementById('opt-no-sauce').checked;
        options.extraCheese = document.getElementById('opt-extra-cheese').checked;
        if(options.extraCheese) price += 20;
    }
    
    cart.push({
        ...pendingProduct,
        cartItemId: Date.now(), 
        finalPrice: price,
        customOptions: options
    });

    updateCart();
    customModal.classList.remove('active');
    resetCustomOptions();
    openCart();
};

function resetCustomOptions() {
    document.getElementById('opt-no-veggie').checked = false;
    document.getElementById('opt-no-sauce').checked = false;
    document.getElementById('opt-extra-cheese').checked = false;
    document.getElementById('opt-note').value = '';
    // Reset sweetness to 50%
    const defaultSweet = document.querySelector('input[name="sweetness"][value="50%"]');
    if (defaultSweet) defaultSweet.checked = true;
}

// --- Cart Logic ---
function updateCart() {
    // Update Floating Checkout (Mobile)
    const floatingBtn = document.getElementById('mobile-checkout-btn');
    const floatingCount = document.getElementById('floating-count');
    const floatingTotal = document.getElementById('floating-total');
    
    const total = cart.reduce((sum, item) => sum + item.finalPrice, 0);
    
    if (cart.length > 0) {
        floatingBtn.classList.add('active');
        if(floatingCount) floatingCount.innerText = cart.length;
        if(floatingTotal) floatingTotal.innerText = `฿${total.toLocaleString()}`;
    } else {
        if(floatingBtn) floatingBtn.classList.remove('active');
    }

    cartItemsContainer.innerHTML = cart.map(item => {
        let customParts = [];
        
        if (item.category === 'drink' && item.customOptions.sweetness) {
            customParts.push(`หวาน ${item.customOptions.sweetness}`);
        } else if (item.category === 'food') {
            if (item.customOptions.noVeggie) customParts.push('ไม่ผัก');
            if (item.customOptions.noSauce) customParts.push('ไม่ซอส');
            if (item.customOptions.extraCheese) customParts.push('เพิ่มชีส');
        }
        
        if (item.customOptions.note) customParts.push(item.customOptions.note);

        const customText = customParts.join(', ');

        return `
        <div class="cart-item">
            <img src="${item.image}" alt="${item.name}">
            <div class="cart-item-info">
                <h4>${item.name}</h4>
                <p style="font-size: 0.7rem; color: #888;">${customText || 'ปกติ'}</p>
                <span>฿${item.finalPrice}</span>
            </div>
            <div style="margin-left: auto; cursor: pointer;" onclick="removeFromCart(${item.cartItemId})">
                <i data-lucide="trash-2" style="width: 18px; color: #ff6b00;"></i>
            </div>
        </div>
        `;
    }).join('');

    lucide.createIcons();
    cartTotalElement.innerText = `฿${total}`;
    cartCountElement.innerText = cart.length;
}

// Click for Floating Checkout
const mobileCheckBtn = document.getElementById('mobile-checkout-btn');
if (mobileCheckBtn) {
    mobileCheckBtn.onclick = () => {
        cartSidebar.classList.remove('active');
        setTimeout(() => {
            checkoutModal.classList.add('active');
        }, 300);
    };
}

function removeFromCart(id) {
    cart = cart.filter(item => item.cartItemId !== id);
    updateCart();
}

function openCart() { cartSidebar.classList.add('active'); }
document.getElementById('cart-toggle').onclick = () => cartSidebar.classList.toggle('active');
document.getElementById('close-cart').onclick = () => cartSidebar.classList.remove('active');

document.getElementById('checkout-trigger').onclick = () => {
    if(cart.length === 0) return alert('กรุณาเลือกเมนูก่อนชำระเงิน');
    cartSidebar.classList.remove('active'); // ปิดตะกร้าก่อน
    setTimeout(() => {
        checkoutModal.classList.add('active'); // แล้วเปิดหน้าชำระเงิน
    }, 300);
};

document.getElementById('close-checkout').onclick = () => checkoutModal.classList.remove('active');

document.getElementById('submit-order').onclick = () => {
    const orderData = {
        customerName: document.getElementById('cust-name').value.trim(),
        phone: document.getElementById('cust-phone').value.trim(),
        address: document.getElementById('cust-address').value.trim(),
        slipImage: slipBase64 || null,
        items: cart,
        total: cart.reduce((sum, item) => sum + item.finalPrice, 0),
        status: 'รอดำเนินการ',
        timestamp: useFirebase ? firebase.firestore.FieldValue.serverTimestamp() : new Date().toISOString()
    };

    if (!orderData.customerName || !orderData.phone || !orderData.address) {
        return alert('กรุณากรอกข้อมูลให้ครบถ้วน');
    }
    if (!orderData.slipImage) {
        return alert('กรุณาแนบสลิปการโอนเงินก่อนยืนยัน');
    }

    if (useFirebase) {
        db.collection('orders').add(orderData).then((docRef) => {
            orderSuccess(docRef.id);
        }).catch(err => alert('เกิดข้อผิดพลาด: ' + err.message));
    } else {
        const orders = JSON.parse(localStorage.getItem('orders')) || [];
        const newId = Date.now();
        orders.push({ id: newId, ...orderData });
        localStorage.setItem('orders', JSON.stringify(orders));
        orderSuccess(newId);
    }
};

function orderSuccess(orderId) {
    cart = [];
    updateCart();
    checkoutModal.classList.remove('active');
    cartSidebar.classList.remove('active');

    // Clear form fields & slip
    document.getElementById('cust-name').value = '';
    document.getElementById('cust-phone').value = '';
    document.getElementById('cust-address').value = '';
    removeSlip();

    // Show success popup
    const refNum = orderId ? String(orderId).slice(-6).toUpperCase() : Math.random().toString(36).slice(-6).toUpperCase();
    document.getElementById('success-order-ref').textContent = `หมายเลขออเดอร์: #${refNum}`;

    // Generate Tracking URL
    const baseUrl = window.location.origin + window.location.pathname.replace('index.html', '');
    const trackUrl = `${baseUrl}track.html?id=${orderId}`;
    
    const trackInput = document.getElementById('track-url-input');
    const trackBtn = document.getElementById('track-order-btn');
    
    trackInput.value = trackUrl;
    trackBtn.href = trackUrl;

    // Copy Link Logic
    document.getElementById('copy-track-btn').onclick = () => {
        trackInput.select();
        document.execCommand('copy');
        const originalText = document.getElementById('copy-track-btn').innerText;
        document.getElementById('copy-track-btn').innerText = 'คัดลอกแล้ว!';
        setTimeout(() => {
            document.getElementById('copy-track-btn').innerText = originalText;
        }, 2000);
    };

    const popup = document.getElementById('success-popup');
    popup.classList.add('active');

    // Re-trigger animations each time popup opens
    const circle = popup.querySelector('.success-circle');
    const check  = popup.querySelector('.checkmark-check');
    circle.style.animation = 'none';
    check.style.animation  = 'none';
    void circle.offsetWidth;
    circle.style.animation = 'popIn 0.5s cubic-bezier(0.68, -0.55, 0.265, 1.55) both';
    check.style.animation  = 'drawCheck 0.55s ease 0.35s forwards';
}

document.getElementById('success-popup-close').onclick = () => {
    document.getElementById('success-popup').classList.remove('active');
};

// --- Mobile Navigation ---
function toggleMobileMenu() {
    document.getElementById('mobile-nav').classList.toggle('active');
}
document.getElementById('mobile-menu-toggle').onclick = toggleMobileMenu;

// --- Initialize ---
loadMenu();
window.onscroll = () => {
    const nav = document.getElementById('navbar');
    if (window.scrollY > 50) nav.classList.add('scrolled');
    else nav.classList.remove('scrolled');
};
