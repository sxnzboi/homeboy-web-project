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

// --- Slip Upload Logic (Firebase Storage) ---
let slipFile = null; // เก็บ File object แทน base64

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
    slipFile = file;
    // แสดง preview ด้วย Object URL (ไม่ต้องแปลงเป็น base64)
    const previewUrl = URL.createObjectURL(file);
    slipPreviewImg.src = previewUrl;
    slipPlaceholder.style.display = 'none';
    slipPreviewWrap.style.display = 'inline-block';
    lucide.createIcons();
}

function removeSlip() {
    slipFile = null;
    slipFileInput.value = '';
    if (slipPreviewImg.src.startsWith('blob:')) URL.revokeObjectURL(slipPreviewImg.src);
    slipPreviewImg.src = '';
    slipPlaceholder.style.display = 'flex';
    slipPreviewWrap.style.display = 'none';
}

// อัปโหลดสลิปไปยัง Firebase Storage และคืน URL
async function uploadSlipToStorage(file, orderId) {
    if (!useFirebase || typeof firebase.storage === 'undefined') {
        // Fallback: แปลงเป็น base64 ถ้าไม่มี Storage
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target.result);
            reader.readAsDataURL(file);
        });
    }
    const storage = firebase.storage();
    const ext = file.name.split('.').pop() || 'jpg';
    const ref = storage.ref(`slips/${orderId}_${Date.now()}.${ext}`);
    await ref.put(file);
    return await ref.getDownloadURL();
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
                    ${isAvailable ? 'เพิ่มลงตะกร้า' : 'สินค้าหมด'}
                </button>
            </div>
        </div>
    `;}).join('');
}

// --- Category Logic ---
function filterCategory(cat) {
    document.querySelectorAll('.cat-btn').forEach(btn => {
        btn.classList.remove('active');
        const text = btn.innerText.toLowerCase();
        if (cat === 'all' && text.includes('ทั้งหมด')) btn.classList.add('active');
        else if (cat === 'food' && text.includes('อาหาร')) btn.classList.add('active');
        else if (cat === 'drink' && text.includes('เครื่องดื่ม')) btn.classList.add('active');
        else if (cat === 'dessert' && text.includes('ของหวาน')) btn.classList.add('active');
        else if (cat === 'set' && text.includes('เซ็ต')) btn.classList.add('active');
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
    
    // แสดงชุดตัวเลือกจากฐานข้อมูล (ถ้ามี)
    const dynamicContainer = document.getElementById('dynamic-options-container');
    dynamicContainer.innerHTML = '';
    
    if (pendingProduct.options && pendingProduct.options.trim() !== '') {
        const optionsList = pendingProduct.options.split(',').map(opt => opt.trim()).filter(opt => opt);
        
        if (optionsList.length > 0) {
            dynamicContainer.style.display = 'block';
            let html = '<p style="margin-bottom: 10px; font-weight: 600;">ตัวเลือกเพิ่มเติม:</p>';
            html += '<div style="display: flex; flex-direction: column; gap: 10px;">';
            
            optionsList.forEach((opt, index) => {
                const optId = `dynamic-opt-${index}`;
                let label = opt;
                let price = 0;
                
                if (opt.includes(':')) {
                    const parts = opt.split(':');
                    label = parts[0].trim();
                    price = parseInt(parts[1]) || 0;
                }

                html += `
                    <label style="display: flex; align-items: center; justify-content: space-between; cursor: pointer; background: #f9f9f9; padding: 10px 15px; border-radius: 10px; transition: 0.2s;" onmouseover="this.style.background='#f0f0f0'" onmouseout="this.style.background='#f9f9f9'">
                        <div style="display: flex; align-items: center; gap: 10px;">
                            <input type="checkbox" class="dynamic-checkbox" id="${optId}" value="${label}" data-price="${price}">
                            <span style="font-weight: 500;">${label}</span>
                        </div>
                        ${price > 0 ? `<span style="color: var(--primary); font-weight: 600;">+฿${price}</span>` : ''}
                    </label>
                `;
            });
            html += '</div>';
            dynamicContainer.innerHTML = html;
        } else {
            dynamicContainer.style.display = 'none';
        }
    } else {
        dynamicContainer.style.display = 'none';
    }

    customModal.classList.add('active');
}

// Add item with quantity merging
function addItemToCart(itemToAdd) {
    const existing = cart.find(i => 
        i.id === itemToAdd.id && 
        JSON.stringify(i.customOptions) === JSON.stringify(itemToAdd.customOptions)
    );
    if (existing) {
        existing.quantity = (existing.quantity || 1) + 1;
    } else {
        itemToAdd.quantity = 1;
        cart.push(itemToAdd);
    }
    updateCart();
}

function addToCartDirectly(product) {
    addItemToCart({
        ...product,
        cartItemId: Date.now(),
        finalPrice: product.price,
        customOptions: { note: '', isDirect: true }
    });
}

document.getElementById('close-custom').onclick = () => customModal.classList.remove('active');

document.getElementById('confirm-add').onclick = () => {
    let options = {
        note: document.getElementById('opt-note').value
    };
    
    let price = pendingProduct.price;

    // ดึงค่าจาก Dynamic Checkboxes และคำนวณราคาเพิ่ม
    const dynamicCheckboxes = document.querySelectorAll('.dynamic-checkbox:checked');
    const selectedOptions = [];
    let extraPrice = 0;

    dynamicCheckboxes.forEach(cb => {
        const itemPrice = parseInt(cb.getAttribute('data-price')) || 0;
        selectedOptions.push({
            name: cb.value,
            price: itemPrice
        });
        extraPrice += itemPrice;
    });
    
    price += extraPrice;

    if (selectedOptions.length > 0) {
        options.dynamic = selectedOptions.map(o => o.name);
    }
    
    addItemToCart({
        ...pendingProduct,
        cartItemId: Date.now(), 
        finalPrice: price,
        customOptions: options
    });

    customModal.classList.remove('active');
    resetCustomOptions();
};

function resetCustomOptions() {
    // Reset special note field
    const noteEl = document.getElementById('opt-note');
    if (noteEl) noteEl.value = '';
    // Reset dynamic checkboxes
    const dynamicCheckboxes = document.querySelectorAll('.dynamic-checkbox');
    dynamicCheckboxes.forEach(cb => cb.checked = false);
    // Reset legacy option checkboxes if they exist
    const veg = document.getElementById('opt-no-veggie');
    if (veg) veg.checked = false;
    const sauce = document.getElementById('opt-no-sauce');
    if (sauce) sauce.checked = false;
    const cheese = document.getElementById('opt-extra-cheese');
    if (cheese) cheese.checked = false;
}

window.changeQty = function(cartItemId, amount) {
    const idx = cart.findIndex(i => i.cartItemId === cartItemId);
    if (idx > -1) {
        cart[idx].quantity = (cart[idx].quantity || 1) + amount;
        if (cart[idx].quantity <= 0) {
            cart.splice(idx, 1);
        }
        updateCart();
    }
};

// --- Cart Logic ---
function updateCart() {
    // Update Floating Checkout (Mobile)
    const floatingBtn = document.getElementById('mobile-checkout-btn');
    const floatingCount = document.getElementById('floating-count');
    const floatingTotal = document.getElementById('floating-total');
    
    const total = cart.reduce((sum, item) => sum + (item.finalPrice * (item.quantity || 1)), 0);
    const count = cart.reduce((sum, item) => sum + (item.quantity || 1), 0);
    
    if (cart.length > 0) {
        floatingBtn.classList.add('active');
        if(floatingCount) floatingCount.innerText = count;
        if(floatingTotal) floatingTotal.innerText = `฿${total.toLocaleString()}`;
    } else {
        if(floatingBtn) floatingBtn.classList.remove('active');
    }

    cartItemsContainer.innerHTML = cart.map(item => {
        let customParts = [];
        
        if (item.customOptions.dynamic && item.customOptions.dynamic.length > 0) {
            customParts.push(item.customOptions.dynamic.map(d => `${d}`).join(', '));
        }
        
        if (item.customOptions.note) customParts.push(item.customOptions.note);

        const customText = customParts.join(', ');
        const qty = item.quantity || 1;
        const lineTotal = item.finalPrice * qty;

        return `
        <div class="cart-item" style="display: flex; align-items: center; justify-content: space-between; gap: 10px;">
            <img src="${item.image}" alt="${item.name}" style="width: 50px; height: 50px; border-radius: 8px; object-fit: cover;">
            <div class="cart-item-info" style="flex: 1;">
                <h4 style="font-size: 0.9rem; margin-bottom: 2px;">${item.name}</h4>
                <p style="font-size: 0.7rem; color: #888; margin-bottom: 4px;">${customText || 'ปกติ'}</p>
                <span style="font-weight: 700; color: var(--primary); font-size: 0.88rem;">฿${lineTotal.toLocaleString()}</span>
            </div>
            <div style="display: flex; align-items: center; gap: 6px;">
                <button class="btn-qty" onclick="changeQty(${item.cartItemId}, -1)" style="width: 24px; height: 24px; border-radius: 4px; border: 1px solid #ddd; background: white; cursor: pointer; font-weight: bold; font-size: 0.85rem;">-</button>
                <span style="font-weight: bold; min-width: 16px; text-align: center; font-size: 0.9rem;">${qty}</span>
                <button class="btn-qty" onclick="changeQty(${item.cartItemId}, 1)" style="width: 24px; height: 24px; border-radius: 4px; border: 1px solid #ddd; background: white; cursor: pointer; font-weight: bold; font-size: 0.85rem;">+</button>
            </div>
            <div style="cursor: pointer; padding: 5px;" onclick="removeFromCart(${item.cartItemId})">
                <i data-lucide="trash-2" style="width: 18px; color: #ff6b00;"></i>
            </div>
        </div>
        `;
    }).join('');

    lucide.createIcons();
    cartTotalElement.innerText = `฿${total.toLocaleString()}`;
    cartCountElement.innerText = count;
}

// Click for Floating Checkout
const mobileCheckBtn = document.getElementById('mobile-checkout-btn');
if (mobileCheckBtn) {
    mobileCheckBtn.onclick = () => {
        openCart();
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
    
    // Set total transfer display in checkout modal
    const total = cart.reduce((sum, item) => sum + (item.finalPrice * (item.quantity || 1)), 0);
    document.getElementById('checkout-total-display').innerText = `฿${total.toLocaleString()}`;

    cartSidebar.classList.remove('active'); // ปิดตะกร้าก่อน
    setTimeout(() => {
        checkoutModal.classList.add('active'); // แล้วเปิดหน้าชำระเงิน
    }, 300);
};

document.getElementById('close-checkout').onclick = () => checkoutModal.classList.remove('active');

document.getElementById('submit-order').onclick = async () => {
    const customerName = document.getElementById('cust-name').value.trim();
    const phone = document.getElementById('cust-phone').value.trim();
    const address = document.getElementById('cust-address').value.trim();

    if (!customerName || !phone || !address) {
        return alert('กรุณากรอกข้อมูลให้ครบถ้วน');
    }
    if (!slipFile) {
        return alert('กรุณาแนบสลิปการโอนเงินก่อนยืนยัน');
    }

    // ปิดปุ่มป้องกันกดซ้ำ + แสดง loading
    const submitBtn = document.getElementById('submit-order');
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<i data-lucide="loader" style="width:18px;height:18px;animation:spin 1s linear infinite;"></i> กำลังอัปโหลด...';
    lucide.createIcons();

    try {
        const total = cart.reduce((sum, item) => sum + (item.finalPrice * (item.quantity || 1)), 0);
        const trackToken = (typeof HomieAuth !== 'undefined')
            ? HomieAuth.generateTrackToken()
            : Date.now().toString(36) + Math.random().toString(36).slice(2);

        // อัปโหลดสลิปไป Storage ก่อน ได้ URL กลับมา
        const tempOrderId = Date.now().toString();
        const slipUrl = await uploadSlipToStorage(slipFile, tempOrderId);

        const orderData = {
            customerName,
            phone,
            address,
            slipImage: slipUrl,  // เก็บแค่ URL ไม่ใช่ base64
            items: cart,
            total,
            status: 'รอดำเนินการ',
            orderType: 'delivery',
            paymentMethod: 'promptpay',
            trackToken,
            timestamp: useFirebase ? firebase.firestore.FieldValue.serverTimestamp() : new Date().toISOString()
        };

        if (useFirebase) {
            const docRef = await db.collection('orders').add(orderData);
            try {
                await HomieAuth.createPublicOrder(docRef.id, trackToken, orderData);
            } catch (e) {
                console.warn('publicOrders sync failed:', e.message);
            }
            orderSuccess(docRef.id, trackToken);
        } else {
            const orders = JSON.parse(localStorage.getItem('orders')) || [];
            const newId = Date.now();
            orders.push({ id: newId, ...orderData });
            localStorage.setItem('orders', JSON.stringify(orders));
            const publicOrders = JSON.parse(localStorage.getItem('publicOrders') || '{}');
            publicOrders[trackToken] = HomieAuth.buildPublicOrderPayload(newId, trackToken, orderData);
            localStorage.setItem('publicOrders', JSON.stringify(publicOrders));
            window.dispatchEvent(new CustomEvent('orderAdded', { detail: { orderId: newId } }));
            orderSuccess(newId, trackToken);
        }
    } catch (err) {
        alert('เกิดข้อผิดพลาด: ' + err.message);
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<i data-lucide="check-circle" style="width:18px;height:18px;"></i> ยืนยันและชำระเงิน';
        lucide.createIcons();
    }
};

function orderSuccess(orderId, trackToken) {
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

    // Generate Tracking URL (token-based — do not share order doc id)
    const baseUrl = window.location.origin + window.location.pathname.replace('index.html', '');
    const trackUrl = `${baseUrl}track.html?token=${trackToken}`;
    
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

// --- Shop Status Monitor ---
function initShopStatus() {
    const overlay = document.getElementById('shop-closed-overlay');
    if (useFirebase) {
        db.collection('settings').doc('shop').onSnapshot(doc => {
            if (doc.exists) {
                const isOpen = doc.data().isOpen;
                if (!isOpen) overlay.classList.add('active');
                else overlay.classList.remove('active');
            }
        });
    } else {
        const isOpen = localStorage.getItem('shopOpen') !== 'false';
        if (!isOpen) overlay.classList.add('active');
        else overlay.classList.remove('active');
    }
}

// --- Initialize ---
loadMenu();
initShopStatus();
window.onscroll = () => {
    const nav = document.getElementById('navbar');
    if (nav) {
        if (window.scrollY > 50) nav.classList.add('scrolled');
        else nav.classList.remove('scrolled');
    }
};
