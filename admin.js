// --- Security Check ---
if (localStorage.getItem('adminSession') !== 'true') {
    console.warn("No session found, redirecting...");
    window.location.href = 'login.html';
}

// Global Actions
window.logout = () => { localStorage.removeItem('adminSession'); window.location.href = 'login.html'; };

let useFirebase = false;
let currentOrders = [];
let currentProducts = [];

try {
    if (typeof firebase !== 'undefined' && firebase.apps.length && firebaseConfig.apiKey !== "YOUR_API_KEY") {
        useFirebase = true;
    }
} catch (e) {}

// ===== Toast Notification Helper =====
let toastTimer = null;
function showToast(title, subtitle = '', type = 'success') {
    const toast    = document.getElementById('toast-notification');
    const iconEl   = document.getElementById('toast-icon');
    const titleEl  = document.getElementById('toast-title');
    const subEl    = document.getElementById('toast-subtitle');
    const progress = document.getElementById('toast-progress');

    // Reset
    clearTimeout(toastTimer);
    toast.classList.remove('show');

    // Set content
    iconEl.className  = `toast-icon ${type}`;
    iconEl.textContent = type === 'success' ? '✓' : '✕';
    titleEl.textContent = title;
    subEl.textContent   = subtitle;

    // Re-trigger progress animation
    progress.style.animation = 'none';
    void progress.offsetWidth;
    progress.style.animation = 'toastProgress 3s linear forwards';

    // Show
    requestAnimationFrame(() => {
        requestAnimationFrame(() => toast.classList.add('show'));
    });

    // Auto-hide after 3s
    toastTimer = setTimeout(() => toast.classList.remove('show'), 3000);
}

const orderListContainer = document.getElementById('admin-order-list');
const productListContainer = document.getElementById('admin-product-list');

// --- Tab Management ---
window.switchTab = function(tab) {
    document.querySelectorAll('.admin-nav-item').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.admin-section').forEach(sec => sec.style.display = 'none');
    const activeBtn = document.getElementById(`nav-${tab}`);
    if(activeBtn) activeBtn.classList.add('active');
    document.getElementById(`${tab}-section`).style.display = 'block';
    
    if(tab === 'products') {
        document.getElementById('action-area').innerHTML = `
            <button type="button" class="btn btn-primary btn-sm" onclick="openProductModal()">+ เพิ่มเมนูใหม่</button>
            <button type="button" class="btn btn-delete btn-sm" onclick="clearAllProducts()" style="margin-left: 10px;">🗑️ ล้างเมนูทั้งหมด</button>
        `;
        renderProducts();
    } else {
        document.getElementById('action-area').innerHTML = '';
        renderOrders();
    }
};

// --- Order Logic ---
function renderOrders() {
    if (useFirebase) {
        db.collection('orders').orderBy('timestamp', 'desc').onSnapshot(snap => {
            currentOrders = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            displayOrders(currentOrders);
        });
    } else {
        currentOrders = (JSON.parse(localStorage.getItem('orders')) || []).reverse();
        displayOrders(currentOrders);
    }
}

function displayOrders(orders) {
    if(!orderListContainer) return;

    // Update stats cards
    updateStats(orders);

    if (orders.length === 0) {
        orderListContainer.innerHTML = `
            <div style="text-align:center; padding:60px 20px; color:#aaa;">
                <p style="font-size:1.1rem;">📋 ยังไม่มีออเดอร์</p>
            </div>`;
        return;
    }

    orderListContainer.innerHTML = orders.map(order => {
        const idStr = String(order.id);
        const shortId = idStr.length > 10 ? idStr.slice(-6).toUpperCase() : idStr;
        
        return `
        <div class="admin-card" style="grid-template-columns: 2.5fr 1fr 1fr 1fr;">
            <div>
                <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 5px;">
                    <span style="background: #fff0e5; color: #ff6b00; padding: 2px 8px; border-radius: 6px; font-size: 0.75rem; font-weight: 800;">#${shortId}</span>
                    <h4 style="margin: 0;">${order.customerName || 'ลูกค้า'}</h4>
                </div>
                <p style="font-size: 0.8rem; color: #888;">ยอดรวม: ฿${order.total}</p>
            </div>
            <div><button type="button" class="btn-sm btn-view" data-id="${order.id}">รายละเอียด</button></div>
            <div>
                <select class="status-select" data-id="${order.id}" style="padding: 5px; border-radius: 8px;">
                    <option value="รอดำเนินการ" ${order.status === 'รอดำเนินการ' ? 'selected' : ''}>รอดำเนินการ</option>
                    <option value="กำลังเตรียม" ${order.status === 'กำลังเตรียม' ? 'selected' : ''}>กำลังเตรียม</option>
                    <option value="สำเร็จแล้ว" ${order.status === 'สำเร็จแล้ว' ? 'selected' : ''}>สำเร็จแล้ว</option>
                    <option value="ยกเลิก" ${order.status === 'ยกเลิก' ? 'selected' : ''}>ยกเลิก</option>
                </select>
            </div>
            <div class="action-btns"><button type="button" class="btn-sm btn-delete-order" data-id="${order.id}">ลบ</button></div>
        </div>
        `;
    }).join('');
}


// Global Click Handlers for Orders (Improved)
orderListContainer.addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    const id = btn.getAttribute('data-id');
    if (!id) return;

    if (btn.classList.contains('btn-delete-order')) {
        if(!confirm('ยืนยันการลบออเดอร์นี้?')) return;
        if(useFirebase) {
            db.collection('orders').doc(id).delete()
                .then(() => showToast('ลบออเดอร์สำเร็จ! 🗑️', 'ออเดอร์ถูกลบออกจากระบบแล้ว', 'success'))
                .catch(err => showToast('เกิดข้อผิดพลาด', err.message, 'error'));
        } else {
            const filtered = (JSON.parse(localStorage.getItem('orders')) || []).filter(o => String(o.id) !== String(id));
            localStorage.setItem('orders', JSON.stringify(filtered));
            renderOrders();
            showToast('ลบออเดอร์สำเร็จ! 🗑️', 'ออเดอร์ถูกลบออกจากระบบแล้ว', 'success');
        }
    } else if (btn.classList.contains('btn-view')) {
        viewOrderDetails(id);
    }
});

// Status change
orderListContainer.addEventListener('change', (e) => {
    const sel = e.target.closest('.status-select');
    if (sel) {
        const id = sel.getAttribute('data-id');
        const status = sel.value;
        if(useFirebase) db.collection('orders').doc(id).update({ status: status });
        else {
            let orders = JSON.parse(localStorage.getItem('orders')) || [];
            const idx = orders.findIndex(o => String(o.id) === String(id));
            if(idx !== -1) { orders[idx].status = status; localStorage.setItem('orders', JSON.stringify(orders)); renderOrders(); }
        }
    }
});

// --- Product Logic ---
function renderProducts() {
    if (useFirebase) {
        db.collection('menu').onSnapshot(snap => {
            currentProducts = snap.docs.map(doc => {
                const data = doc.data();
                return { ...data, id: doc.id }; // บังคับให้ใช้ doc.id ของ Firebase เท่านั้น
            });
            displayProducts(currentProducts);
        });
    } else {
        currentProducts = JSON.parse(localStorage.getItem('menuItems')) || [];
        displayProducts(currentProducts);
    }
}

function displayProducts(products) {
    if(!productListContainer) return;
    productListContainer.innerHTML = products.map(p => {
        const isAvailable = p.isAvailable !== false; // Default เป็น true ถ้าไม่มีฟิลด์นี้
        return `
        <div class="admin-card ${!isAvailable ? 'sold-out-card' : ''}">
            <div style="display: flex; align-items: center;">
                <img src="${p.image}" class="product-img" style="${!isAvailable ? 'filter: grayscale(1); opacity: 0.6;' : ''}">
                <div>
                    <h4 style="margin:0;">${p.name} ${!isAvailable ? '<span style="color:#ff5252; font-size:0.7rem;">(ของหมด)</span>' : ''}</h4>
                    <p style="font-size:0.8rem; color:#888;">${p.category}</p>
                </div>
            </div>
            <div style="font-weight:600; color:var(--primary);">฿${p.price}</div>
            <div class="action-btns">
                <button type="button" class="btn-sm ${isAvailable ? 'btn-available' : 'btn-sold-out'} btn-toggle-stock" data-id="${p.id}" data-status="${isAvailable}">
                    ${isAvailable ? 'มีของ' : 'ของหมด'}
                </button>
                <button type="button" class="btn-sm btn-edit btn-edit-prod" data-id="${p.id}">แก้ไข</button>
                <button type="button" class="btn-sm btn-delete btn-delete-prod" data-id="${p.id}">ลบ</button>
            </div>
        </div>
    `;}).join('');
}

// --- Product Event Listeners ---
if (productListContainer) {
    productListContainer.addEventListener('click', (e) => {
        const btn = e.target.closest('button');
        if (!btn) return;
        
        const id = btn.getAttribute('data-id');
        console.log("Product Button Clicked:", btn.className, "ID:", id);
        
        if (!id) return;

        if (btn.classList.contains('btn-delete-prod')) {
            if(!confirm('ยืนยันการลบเมนูนี้ออกจากระบบ?')) return;
            
            if(useFirebase) {
                db.collection('menu').doc(id).delete()
                    .then(() => {
                        showToast('ลบสำเร็จ! 🗑️', 'เมนูถูกลบแล้ว', 'success');
                        // ไม่ต้องรัน render ใหม่เพราะ onSnapshot จะจัดการเอง
                    })
                    .catch(err => showToast('เกิดข้อผิดพลาด', err.message, 'error'));
            } else {
                const filtered = currentProducts.filter(p => String(p.id) !== String(id));
                localStorage.setItem('menuItems', JSON.stringify(filtered));
                renderProducts();
                showToast('ลบสำเร็จ! 🗑️', 'เมนูถูกลบออกจากเครื่องแล้ว', 'success');
            }
        } else if (btn.classList.contains('btn-edit-prod')) {
            editProduct(id);
        } else if (btn.classList.contains('btn-toggle-stock')) {
            const currentStatus = btn.getAttribute('data-status') === 'true';
            const newStatus = !currentStatus;
            
            if(useFirebase) {
                db.collection('menu').doc(id).update({ isAvailable: newStatus })
                    .then(() => showToast(newStatus ? 'เปิดขายแล้ว! 🥗' : 'ปิดการขาย! ❌', 'อัปเดตสถานะสินค้าเรียบร้อย', 'success'))
                    .catch(err => showToast('เกิดข้อผิดพลาด', err.message, 'error'));
            }
        }
    });
}

// Helpers
function viewOrderDetails(id) {
    const order = currentOrders.find(o => String(o.id) === String(id));
    if (!order) return;

    const slipHTML = order.slipImage
        ? `<div style="margin-top:18px;">
               <p style="font-weight:700; margin-bottom:10px; color:#ff6b00;">
                   🧾 สลิปการโอนเงิน
               </p>
               <div style="position:relative; display:inline-block; cursor:zoom-in;"
                    onclick="window.open(this.querySelector('img').src,'_blank')">
                   <img src="${order.slipImage}"
                        style="max-width:100%; max-height:280px; border-radius:14px;
                               object-fit:contain; border:1px solid #eee;
                               box-shadow:0 6px 20px rgba(0,0,0,0.1);">
                   <span style="position:absolute; bottom:10px; right:10px;
                                background:rgba(0,0,0,0.55); color:#fff;
                                padding:4px 10px; border-radius:8px; font-size:0.75rem;">
                       🔍 คลิกขยาย
                   </span>
               </div>
           </div>`
        : `<div style="margin-top:18px; padding:14px; background:#fff8f5;
                       border-radius:12px; border:1px dashed #ffb380; text-align:center;
                       color:#aaa; font-size:0.88rem;">
               ⚠️ ไม่พบสลิปการโอนเงิน
           </div>`;

    const ts = order.timestamp
        ? (order.timestamp.toDate
            ? order.timestamp.toDate().toLocaleString('th-TH')
            : new Date(order.timestamp).toLocaleString('th-TH'))
        : '-';

    document.getElementById('order-details-content').innerHTML = `
        <div style="background: #fff0e5; color: #ff6b00; padding: 10px 15px; border-radius: 10px; margin-bottom: 16px; font-weight: 800; font-size: 0.9rem; display: flex; align-items: center; gap: 8px;">
            <i data-lucide="hash" style="width: 16px;"></i> ออเดอร์ ID: ${order.id}
        </div>
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:16px;">
            <div style="background:#f9f9f9; padding:14px; border-radius:12px;">
                <p style="font-size:0.75rem; color:#aaa; margin-bottom:4px;">ชื่อลูกค้า</p>
                <p style="font-weight:700;">${order.customerName || '-'}</p>
            </div>
            <div style="background:#f9f9f9; padding:14px; border-radius:12px;">
                <p style="font-size:0.75rem; color:#aaa; margin-bottom:4px;">เบอร์โทรศัพท์</p>
                <p style="font-weight:700;">${order.phone || '-'}</p>
            </div>
        </div>
        <div style="background:#f9f9f9; padding:14px; border-radius:12px; margin-bottom:16px;">
            <p style="font-size:0.75rem; color:#aaa; margin-bottom:4px;">ที่อยู่จัดส่ง</p>
            <p style="font-weight:600; line-height:1.5;">${order.address || '-'}</p>
        </div>
        <div style="background:#f9f9f9; padding:14px; border-radius:12px; margin-bottom:4px;">
            <p style="font-size:0.75rem; color:#aaa; margin-bottom:8px;">รายการสินค้า</p>
            ${(order.items || []).map(i => {
                let customParts = [];
                const opt = i.customOptions || {};
                
                // เช็คจากค่าที่มีจริง (ยืดหยุ่นขึ้น)
                if (opt.sweetness) customParts.push(`หวาน ${opt.sweetness}`);
                if (opt.noVeggie) customParts.push('ไม่ผัก');
                if (opt.noSauce) customParts.push('ไม่ซอส');
                if (opt.extraCheese) customParts.push('เพิ่มชีส');
                if (opt.note) customParts.push(opt.note);
                
                const desc = customParts.join(', ');

                return `
                <div style="padding:8px 0; border-bottom:1px solid #eee;">
                    <div style="display:flex; justify-content:space-between; font-size:0.9rem;">
                        <span style="font-weight:600;">${i.name}</span>
                        <span style="font-weight:700; color:#ff6b00;">฿${i.finalPrice}</span>
                    </div>
                    ${desc ? `<p style="font-size:0.75rem; color:#888; margin-top:2px; font-weight:500;">• ${desc}</p>` : ''}
                </div>`;
            }).join('')}
            <div style="display:flex; justify-content:space-between; margin-top:12px;
                        font-weight:800; font-size:1.05rem;">
                <span>ยอดรวม</span>
                <span style="color:#ff6b00;">฿${order.total}</span>
            </div>
        </div>
        <div style="font-size:0.78rem; color:#bbb; margin-top:8px; text-align:right;">
            🕐 ${ts}
        </div>
        
        <div style="margin-top: 20px; border-top: 1px solid #eee; padding-top: 20px;">
            <!-- สลิปการโอน -->
            <div style="margin-bottom: 25px;">
                <p style="font-size: 0.8rem; color: #666; margin-bottom: 10px; font-weight: 700; display: flex; align-items: center; gap: 5px;">
                    <i data-lucide="receipt"></i> 🧾 สลิปการโอนเงินจากลูกค้า
                </p>
                <div style="max-width: 100%; border-radius: 16px; overflow: hidden; border: 1px solid #eee;">
                    ${slipHTML}
                </div>
            </div>

            <!-- หลักฐานการส่งของ -->
            <div>
                <p style="font-size: 0.8rem; color: #666; margin-bottom: 10px; font-weight: 700; display: flex; align-items: center; gap: 5px;">
                    <i data-lucide="truck"></i> 🚚 หลักฐานการจัดส่ง (จากหน้า Delivery)
                </p>
                ${order.deliveryPhoto 
                    ? `<div style="max-width: 100%; border-radius: 16px; overflow: hidden; border: 1px solid #eee; background: #f0f9ff;">
                         <img src="${order.deliveryPhoto}" style="width: 100%; display: block; cursor: zoom-in;" onclick="window.open('${order.deliveryPhoto}')">
                       </div>`
                    : `<div style="padding:30px; background:#f9f9f9; border-radius:16px; border:1px dashed #ddd; 
                                   text-align:center; color:#bbb; font-size:0.85rem;">
                         <i data-lucide="camera-off" style="width:24px; margin-bottom:8px; opacity:0.5;"></i><br>
                         ยังไม่มีรูปหลักฐานการส่งของ
                       </div>`
                }
            </div>
        </div>
    `;
    document.getElementById('order-details-modal').classList.add('active');
}

function editProduct(id) {
    console.log("Editing product ID:", id);
    // ค้นหาสินค้าโดยรองรับทั้ง string และ number
    const p = currentProducts.find(prod => String(prod.id) === String(id));
    
    if(!p) {
        console.error("Product not found for ID:", id);
        return;
    }

    document.getElementById('modal-title').innerText = 'แก้ไขเมนู';
    document.getElementById('edit-prod-id').value = id;
    document.getElementById('prod-name').value = p.name || '';
    document.getElementById('prod-price').value = p.price || 0;
    document.getElementById('prod-category').value = p.category || 'food';
    document.getElementById('prod-desc').value = p.description || '';
    document.getElementById('prod-image').value = p.image || '';
    document.getElementById('prod-status').value = (p.isAvailable !== false).toString();
    
    document.getElementById('product-modal').classList.add('active');
}

window.openProductModal = () => {
    document.getElementById('modal-title').innerText = 'เพิ่มเมนูใหม่';
    document.getElementById('edit-prod-id').value = '';
    document.getElementById('prod-name').value = '';
    document.getElementById('prod-price').value = '';
    document.getElementById('prod-desc').value = '';
    document.getElementById('prod-image').value = '';
    document.getElementById('prod-status').value = 'true';
    document.getElementById('product-modal').classList.add('active');
};

window.saveProduct = () => {
    const editId = document.getElementById('edit-prod-id').value;
    const data = {
        name: document.getElementById('prod-name').value,
        price: parseInt(document.getElementById('prod-price').value) || 0,
        category: document.getElementById('prod-category').value,
        description: document.getElementById('prod-desc').value,
        image: document.getElementById('prod-image').value || 'https://images.unsplash.com/photo-1586816001966-79b736744398?auto=format&fit=crop&q=80&w=200',
        isAvailable: document.getElementById('prod-status').value === 'true'
    };

    if(useFirebase) {
        const promise = editId 
            ? db.collection('menu').doc(editId).update(data) 
            : db.collection('menu').add(data);
            
        promise.then(() => {
            showToast('สำเร็จ! ✨', 'บันทึกข้อมูลเมนูเรียบร้อยแล้ว', 'success');
            document.getElementById('product-modal').classList.remove('active');
        }).catch(err => {
            showToast('เกิดข้อผิดพลาด', err.message, 'error');
        });
    } else {
        let products = JSON.parse(localStorage.getItem('menuItems')) || [];
        if(editId) { 
            const idx = products.findIndex(p => String(p.id) === String(editId)); 
            if(idx !== -1) products[idx] = {...data, id: editId}; 
        } else { 
            products.push({...data, id: Date.now().toString()}); 
        }
        localStorage.setItem('menuItems', JSON.stringify(products));
        renderProducts();
        showToast('สำเร็จ! ✨', 'บันทึกข้อมูลลงเครื่องเรียบร้อยแล้ว', 'success');
        document.getElementById('product-modal').classList.remove('active');
    }
};

// Events
document.getElementById('save-product').onclick = window.saveProduct;
document.getElementById('close-product-modal').onclick = () => document.getElementById('product-modal').classList.remove('active');
document.getElementById('close-order-modal').onclick = () => document.getElementById('order-details-modal').classList.remove('active');
document.getElementById('close-order-modal-btn').onclick = () => document.getElementById('order-details-modal').classList.remove('active');

function updateStats(orders) {
    document.getElementById('today-orders').innerText = orders.length;
    const total = orders.reduce((sum, o) => sum + (o.status !== 'ยกเลิก' ? (Number(o.total) || 0) : 0), 0);
    document.getElementById('total-revenue').innerText = `฿${total.toLocaleString()}`;
}

// Start
window.switchTab('orders');
lucide.createIcons();

// --- Helper to clear all products ---
window.clearAllProducts = async () => {
    if(!confirm('🚨 ยันยืนการลบสินค้าทุกอย่างออกจากร้าน? การกระทำนี้ไม่สามารถย้อนกลับได้!')) return;
    
    if(useFirebase) {
        const snap = await db.collection('menu').get();
        const batch = db.batch();
        snap.forEach(doc => batch.delete(doc.ref));
        await batch.commit();
        showToast('ล้างข้อมูลสำเร็จ! 🗑️', 'เมนูทั้งหมดถูกลบออกจากระบบแล้ว', 'success');
    } else {
        localStorage.removeItem('menuItems');
        renderProducts();
        showToast('ล้างข้อมูลสำเร็จ! 🗑️', 'เมนูทั้งหมดถูกลบออกจากเครื่องแล้ว', 'success');
    }
};
