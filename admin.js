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
    iconEl.innerHTML = type === 'success' ? '<i data-lucide="check" style="width:24px;height:24px;"></i>' : '<i data-lucide="x" style="width:24px;height:24px;"></i>';
    titleEl.innerHTML = title;
    subEl.innerHTML   = subtitle;

    // Re-trigger progress animation
    progress.style.animation = 'none';
    void progress.offsetWidth;
    progress.style.animation = 'toastProgress 3s linear forwards';

    // Show
    requestAnimationFrame(() => {
        lucide.createIcons();
        requestAnimationFrame(() => toast.classList.add('show'));
    });

    // Auto-hide after 3s
    toastTimer = setTimeout(() => toast.classList.remove('show'), 3000);
}

const orderListContainer = document.getElementById('admin-order-list');
const productListContainer = document.getElementById('admin-product-list');

// --- Tab Management ---
window.switchTab = function(tab) {
    console.log('Switching to', tab); // Debug log
    document.querySelectorAll('.admin-nav-item').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.admin-section').forEach(sec => sec.style.display = 'none');
    const activeBtn = document.getElementById(`nav-${tab}`);
    if (activeBtn) activeBtn.classList.add('active');
    
    document.getElementById(`${tab}-section`).style.display = 'block';

    const actionArea = document.getElementById('action-area');
    actionArea.innerHTML = '';
    
    if (tab === 'products') {
        actionArea.innerHTML = `
            <button type="button" class="btn btn-primary btn-sm" onclick="window.openProductModal()">+ เพิ่มเมนูใหม่</button>
            <button type="button" class="btn btn-delete btn-sm" onclick="clearAllProducts()" style="display:inline-flex;align-items:center;gap:5px;margin-left: 10px;"><i data-lucide="trash-2" style="width:16px;height:16px;"></i> ล้างเมนูทั้งหมด</button>
        `;
        renderProducts();
    } else if (tab === 'orders') {
        renderOrders();
    } else if (tab === 'pos') {
        if (currentProducts.length === 0) {
            loadProducts(renderPosMenu);
        } else {
            renderPosMenu();
        }
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
            <div style="display:flex; align-items:center;">${getStatusBadge(order.status)}</div>
            <div class="action-btns">
                <button type="button" class="btn-sm btn-cancel-order" data-id="${order.id}" style="background:#fef2f2;color:#ef4444;border:1px solid #fca5a5;" ${order.status === 'ยกเลิก' ? 'disabled style="opacity:0.5;cursor:default;"' : ''}>ยกเลิก</button>
                <button type="button" class="btn-sm btn-delete-order" data-id="${order.id}">ลบ</button>
            </div>
        </div>
        `;
    }).join('');
}

// === Status Badge (Read-Only for Admin) ===
function getStatusBadge(status) {
    const map = {
        'รอดำเนินการ': { bg: '#fff0e5', color: '#ff6b00', border: '#ffb380', icon: 'clock' },
        'กำลังปรุง':   { bg: '#eff6ff', color: '#3b82f6', border: '#93c5fd', icon: 'flame' },
        'กำลังเตรียม': { bg: '#eff6ff', color: '#3b82f6', border: '#93c5fd', icon: 'flame' },
        'พร้อมเสิร์ฟ': { bg: '#f0fdf4', color: '#22c55e', border: '#86efac', icon: 'check-circle' },
        'สำเร็จสิ้น': { bg: '#f0fdf4', color: '#22c55e', border: '#86efac', icon: 'check-circle' },
        'เสร็จสิ้น':   { bg: '#f0fdf4', color: '#22c55e', border: '#86efac', icon: 'check-circle' },
        'ยกเลิก':      { bg: '#fef2f2', color: '#ef4444', border: '#fca5a5', icon: 'x-circle' },
    };
    const s = map[status] || { bg: '#f5f5f5', color: '#888', border: '#ddd', icon: 'help-circle' };
    return `<span style="display:inline-flex;align-items:center;gap:5px;background:${s.bg};color:${s.color};border:1px solid ${s.border};padding:5px 12px;border-radius:20px;font-size:0.78rem;font-weight:700;white-space:nowrap;">
        <i data-lucide="${s.icon}" style="width:12px;height:12px;"></i> ${status || 'รอดำเนินการ'}
    </span>`;
}

// --- Modal Close Handlers ---
document.getElementById('close-product-modal')?.addEventListener('click', () => {
    document.getElementById('product-modal').classList.remove('active');
});
document.getElementById('close-order-modal')?.addEventListener('click', () => {
    document.getElementById('order-details-modal').classList.remove('active');
});
document.getElementById('close-order-modal-btn')?.addEventListener('click', () => {
    document.getElementById('order-details-modal').classList.remove('active');
});
// POS custom modal close
document.getElementById('close-pos-custom-modal')?.addEventListener('click', () => {
    document.getElementById('pos-custom-modal').classList.remove('active');
});

// --- Global Click Handlers for Orders (Improved)---
orderListContainer.addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    const id = btn.getAttribute('data-id');
    if (!id) return;

    if (btn.classList.contains('btn-delete-order')) {
        if(!confirm('ยืนยันการลบออเดอร์นี้?')) return;
        if(useFirebase) {
            db.collection('orders').doc(id).delete()
                .then(() => showToast('<i data-lucide="trash-2" style="width:20px;height:20px;vertical-align:text-bottom;"></i> ลบออเดอร์สำเร็จ!', 'ออเดอร์ถูกลบออกจากระบบแล้ว', 'success'))
                .catch(err => showToast('เกิดข้อผิดพลาด', err.message, 'error'));
        } else {
            const filtered = (JSON.parse(localStorage.getItem('orders')) || []).filter(o => String(o.id) !== String(id));
            localStorage.setItem('orders', JSON.stringify(filtered));
            renderOrders();
            showToast('<i data-lucide="trash-2" style="width:20px;height:20px;vertical-align:text-bottom;"></i> ลบออเดอร์สำเร็จ!', 'ออเดอร์ถูกลบออกจากระบบแล้ว', 'success');
        }
    } else if (btn.classList.contains('btn-cancel-order')) {
        if (btn.disabled) return;
        if(!confirm('ยืนยันยกเลิกออเดอร์นี้?\nลูกค้าจะเห็นสถานะยกเลิกทันที')) return;
        if(useFirebase) {
            db.collection('orders').doc(id).update({ status: 'ยกเลิก' })
                .then(() => showToast('<i data-lucide="x-circle" style="width:20px;height:20px;vertical-align:text-bottom;"></i> ยกเลิกออเดอร์แล้ว', 'อัปเดตสถานะเป็นยกเลิกเรียบร้อย', 'success'))
                .catch(err => showToast('เกิดข้อผิดพลาด', err.message, 'error'));
        } else {
            let orders = JSON.parse(localStorage.getItem('orders')) || [];
            const idx = orders.findIndex(o => String(o.id) === String(id));
            if(idx !== -1) { orders[idx].status = 'ยกเลิก'; localStorage.setItem('orders', JSON.stringify(orders)); renderOrders(); }
            showToast('<i data-lucide="x-circle" style="width:20px;height:20px;vertical-align:text-bottom;"></i> ยกเลิกออเดอร์แล้ว', 'อัปเดตสถานะเป็นยกเลิกเรียบร้อย', 'success');
        }
    } else if (btn.classList.contains('btn-view')) {
        viewOrderDetails(id);
    }
});

// Status change is managed by Chef (KDS) only - Admin is read-only for status
// orderListContainer 'change' listener removed intentionally


// --- Helper to load products without rendering ---
function loadProducts(callback) {
    if (useFirebase) {
        db.collection('menu').get().then(snap => {
            currentProducts = snap.docs.map(doc => ({ ...doc.data(), id: doc.id }));
            if (callback) callback();
        }).catch(err => console.error('Failed to load products', err));
    } else {
        currentProducts = JSON.parse(localStorage.getItem('menuItems')) || [];
        if (callback) callback();
    }
}

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
            <div class="action-btns" style="display: flex; gap: 5px; flex-wrap: nowrap;">
                <button type="button" class="btn-sm ${isAvailable ? 'btn-available' : 'btn-sold-out'} btn-toggle-stock" data-id="${p.id}" data-status="${isAvailable}" style="white-space: nowrap;">
                    ${isAvailable ? 'มีของ' : 'ของหมด'}
                </button>
                <button type="button" class="btn-sm btn-edit btn-edit-prod" data-id="${p.id}" style="white-space: nowrap;">แก้ไข</button>
                <button type="button" class="btn-sm btn-edit-ingredients" data-id="${p.id}" style="background: #10b981; color: white; border: none; white-space: nowrap;">สูตร/วิธีทำ</button>
                <button type="button" class="btn-sm btn-delete btn-delete-prod" data-id="${p.id}" style="white-space: nowrap;">ลบ</button>
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
                    .then(() => showToast('<i data-lucide="trash-2" style="width:20px;height:20px;vertical-align:text-bottom;"></i> ลบสำเร็จ!', 'เมนูถูกลบแล้ว', 'success'));
            } else {
                const filtered = currentProducts.filter(p => String(p.id) !== String(id));
                localStorage.setItem('menuItems', JSON.stringify(filtered));
                renderProducts();
                showToast('<i data-lucide="trash-2" style="width:20px;height:20px;vertical-align:text-bottom;"></i> ลบสำเร็จ!', 'เมนูถูกลบออกจากเครื่องแล้ว', 'success');
            }
        } else if (btn.classList.contains('btn-edit-prod')) {
            editProduct(id);
        } else if (btn.classList.contains('btn-edit-ingredients')) {
            openIngredientModal(id);
        } else if (btn.classList.contains('btn-toggle-stock')) {
            const currentStatus = btn.getAttribute('data-status') === 'true';
            const newStatus = !currentStatus;
            
            if(useFirebase) {
                db.collection('menu').doc(id).update({ isAvailable: newStatus })
                    .then(() => showToast(newStatus ? '<i data-lucide="play" style="width:20px;height:20px;vertical-align:text-bottom;"></i> เปิดขายแล้ว!' : '<i data-lucide="pause" style="width:20px;height:20px;vertical-align:text-bottom;"></i> ปิดการขาย!', 'อัปเดตสถานะสินค้าเรียบร้อย', 'success'))
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
               <h5 style="color: #ffb380; margin-bottom: 5px;"><i data-lucide="receipt" style="width:16px;height:16px;vertical-align:text-bottom;"></i> สลิปการโอนเงิน</h5>
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
               <p style="color: #aaa; font-style: italic;"><i data-lucide="alert-triangle" style="width:16px;height:16px;vertical-align:text-bottom;"></i> ไม่พบสลิปการโอนเงิน</p>
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
                
                // ดึงตัวเลือกแบบไดนามิก (ระบบใหม่)
                if (opt.dynamic && Array.isArray(opt.dynamic)) {
                    const dynamicStrings = opt.dynamic.map(d => 
                        typeof d === 'object' ? `${d.name}${d.price > 0 ? ` (+฿${d.price})` : ''}` : d
                    );
                    customParts.push(...dynamicStrings);
                }
                
                // รองรับข้อมูลแบบเก่าเผื่อมีออเดอร์ค้างในระบบ
                if (opt.sweetness) customParts.push(`หวาน ${opt.sweetness}`);
                if (opt.noVeggie) customParts.push('ไม่ผัก');
                if (opt.noSauce) customParts.push('ไม่ซอส');
                if (opt.extraCheese) customParts.push('เพิ่มชีส');
                
                if (opt.note) customParts.push(`หมายเหตุ: ${opt.note}`);
                
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
                <h4 style="color: #ffb380; margin-bottom: 10px;"><i data-lucide="receipt"></i> สลิปการโอนเงินจากลูกค้า</h4>
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
        
        <div style="margin-top: 20px; display: flex; gap: 10px;">
            <button class="btn btn-primary" style="flex: 1; padding: 10px;" onclick="printReceipt('${order.id}')"><i data-lucide="printer"></i> พิมพ์ใบเสร็จ</button>
        </div>
    `;
    document.getElementById('order-details-modal').classList.add('active');
    lucide.createIcons();
}


// ==========================================
// ====== INGREDIENT / OPTIONS EDITOR =======
// ==========================================

window.openIngredientModal = function(id) {
    const p = currentProducts.find(prod => String(prod.id) === String(id));
    if(!p) return;

    document.getElementById('ingredient-product-id').value = id;
    document.getElementById('ingredient-product-name').innerText = p.name;
    
    // Load existing recipe data or default empty string
    document.getElementById('recipe-ingredients').value = p.ingredients || '';
    document.getElementById('recipe-steps').value = p.recipeSteps || '';

    document.getElementById('ingredient-edit-modal').classList.add('active');
};

const saveIngredientChangesBtn = document.getElementById('save-ingredient-changes');
if (saveIngredientChangesBtn) {
    saveIngredientChangesBtn.addEventListener('click', () => {
        const id = document.getElementById('ingredient-product-id').value;
        const ingredients = document.getElementById('recipe-ingredients').value;
        const recipeSteps = document.getElementById('recipe-steps').value;
        
        const updateData = {
            ingredients: ingredients,
            recipeSteps: recipeSteps
        };
        
        if (useFirebase) {
            db.collection('menu').doc(id).update(updateData)
                .then(() => {
                    showToast('<i data-lucide="check-circle" style="width:20px;height:20px;vertical-align:text-bottom;"></i> สำเร็จ!', 'บันทึกสูตรและวิธีทำเรียบร้อย', 'success');
                    document.getElementById('ingredient-edit-modal').classList.remove('active');
                })
                .catch(err => showToast('เกิดข้อผิดพลาด', err.message, 'error'));
        } else {
            let products = JSON.parse(localStorage.getItem('menuItems')) || [];
            const idx = products.findIndex(p => String(p.id) === String(id));
            if (idx !== -1) {
                products[idx].ingredients = ingredients;
                products[idx].recipeSteps = recipeSteps;
                localStorage.setItem('menuItems', JSON.stringify(products));
                renderProducts(); // Refresh list
                showToast('<i data-lucide="check-circle" style="width:20px;height:20px;vertical-align:text-bottom;"></i> สำเร็จ!', 'บันทึกสูตรและวิธีทำเรียบร้อย', 'success');
                document.getElementById('ingredient-edit-modal').classList.remove('active');
            }
        }
    });
}

// ==========================================

window.editProduct = function(id) {
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
    document.getElementById('prod-options').value = p.options || '';
    document.getElementById('prod-status').value = (p.isAvailable !== false).toString();
    
    document.getElementById('product-modal').classList.add('active');
};

window.openProductModal = () => {
    document.getElementById('modal-title').innerText = 'เพิ่มเมนูใหม่';
    document.getElementById('edit-prod-id').value = '';
    document.getElementById('prod-name').value = '';
    document.getElementById('prod-price').value = '';
    document.getElementById('prod-desc').value = '';
    document.getElementById('prod-image').value = '';
    document.getElementById('prod-options').value = '';
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
        isAvailable: document.getElementById('prod-status').value === 'true',
        options: document.getElementById('prod-options').value // เก็บเป็น String (เช่น "เพิ่มชีส, ไม่ผัก")
    };

    if(useFirebase) {
        const promise = editId 
            ? db.collection('menu').doc(editId).update(data) 
            : db.collection('menu').add(data);
            
        promise.then(() => {
            showToast('<i data-lucide="check-circle" style="width:20px;height:20px;vertical-align:text-bottom;"></i> สำเร็จ!', 'บันทึกข้อมูลเมนูเรียบร้อยแล้ว', 'success');
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
        showToast('<i data-lucide="check-circle" style="width:20px;height:20px;vertical-align:text-bottom;"></i> สำเร็จ!', 'บันทึกข้อมูลลงเครื่องเรียบร้อยแล้ว', 'success');
        document.getElementById('product-modal').classList.remove('active');
    }
};

// Events
const saveProductBtn = document.getElementById('save-product');
if (saveProductBtn) saveProductBtn.onclick = window.saveProduct;

document.getElementById('close-product-modal')?.addEventListener('click', () => {
    document.getElementById('product-modal').classList.remove('active');
});
document.getElementById('close-order-modal')?.addEventListener('click', () => {
    document.getElementById('order-details-modal').classList.remove('active');
});
document.getElementById('close-order-modal-btn')?.addEventListener('click', () => {
    document.getElementById('order-details-modal').classList.remove('active');
});

function updateStats(orders) {
    document.getElementById('today-orders').innerText = orders.length;
    
    let totalRev = 0;
    let deliveryRev = 0;
    let posRev = 0;

    orders.forEach(o => {
        if (o.status !== 'ยกเลิก') {
            const amt = Number(o.total) || 0;
            totalRev += amt;
            if (o.orderType === 'delivery' || !o.orderType) {
                deliveryRev += amt;
            } else if (o.orderType === 'walk-in' || o.orderType === 'dining') {
                posRev += amt;
            }
        }
    });

    document.getElementById('total-revenue').innerText = `฿${totalRev.toLocaleString()}`;
    const elDel = document.getElementById('delivery-revenue');
    const elPos = document.getElementById('pos-revenue');
    if (elDel) elDel.innerText = `฿${deliveryRev.toLocaleString()}`;
    if (elPos) elPos.innerText = `฿${posRev.toLocaleString()}`;
}

// --- Shop Status Toggle ---
const shopToggleSidebar = document.getElementById('shop-status-toggle');
const shopToggleMain = document.getElementById('shop-status-toggle-main');
const shopStatusText = document.getElementById('shop-status-text');
const shopStatusDot = document.getElementById('shop-status-dot');

function updateShopUI(isOpen) {
    if (shopToggleSidebar) shopToggleSidebar.checked = isOpen;
    if (shopToggleMain) shopToggleMain.checked = isOpen;
    if (shopStatusText) {
        shopStatusText.innerHTML = isOpen ? '<i data-lucide="store" style="width:16px;height:16px;vertical-align:text-bottom;"></i> เปิดร้านอยู่' : '<i data-lucide="moon" style="width:16px;height:16px;vertical-align:text-bottom;"></i> ปิดร้านอยู่';
        shopStatusText.style.color = isOpen ? '#22c55e' : '#ef4444';
    }
    if (shopStatusDot) {
        shopStatusDot.style.background = isOpen ? '#22c55e' : '#ef4444';
    }
}

function initShopStatus() {
    if (useFirebase) {
        db.collection('settings').doc('shop').onSnapshot(doc => {
            if (doc.exists) {
                updateShopUI(doc.data().isOpen);
            } else {
                db.collection('settings').doc('shop').set({ isOpen: true });
                updateShopUI(true);
            }
        });
    } else {
        const isOpen = localStorage.getItem('shopOpen') !== 'false';
        updateShopUI(isOpen);
    }
}

function handleShopToggle(isOpen) {
    if (useFirebase) {
        db.collection('settings').doc('shop').update({ isOpen: isOpen })
            .then(() => showToast(isOpen ? '<i data-lucide="store" style="width:20px;height:20px;vertical-align:text-bottom;"></i> เปิดร้านแล้ว!' : '<i data-lucide="moon" style="width:20px;height:20px;vertical-align:text-bottom;"></i> ปิดร้านแล้ว!', `ร้านอาหารเปลี่ยนสถานะเป็น ${isOpen ? 'เปิด' : 'ปิด'}`, 'success'))
            .catch(err => showToast('เกิดข้อผิดพลาด', err.message, 'error'));
    } else {
        localStorage.setItem('shopOpen', isOpen);
        updateShopUI(isOpen);
        showToast(isOpen ? '<i data-lucide="store" style="width:20px;height:20px;vertical-align:text-bottom;"></i> เปิดร้านแล้ว!' : '<i data-lucide="moon" style="width:20px;height:20px;vertical-align:text-bottom;"></i> ปิดร้านแล้ว!', `ร้านอาหารเปลี่ยนสถานะเป็น ${isOpen ? 'เปิด' : 'ปิด'}`, 'success');
    }
}

if (shopToggleSidebar) shopToggleSidebar.onchange = () => handleShopToggle(shopToggleSidebar.checked);
if (shopToggleMain) shopToggleMain.onchange = () => handleShopToggle(shopToggleMain.checked);

// Start
window.switchTab('orders');
initShopStatus();
lucide.createIcons();

// --- Helper to clear all products ---
window.clearAllProducts = async () => {
    if(!confirm('ยันยืนการลบสินค้าทุกอย่างออกจากร้าน? การกระทำนี้ไม่สามารถย้อนกลับได้!')) return;
    
    if(useFirebase) {
        const snap = await db.collection('menu').get();
        const batch = db.batch();
        snap.forEach(doc => batch.delete(doc.ref));
        await batch.commit();
        showToast('<i data-lucide="trash-2" style="width:20px;height:20px;vertical-align:text-bottom;"></i> ล้างข้อมูลสำเร็จ!', 'เมนูทั้งหมดถูกลบออกจากระบบแล้ว', 'success');
    } else {
        localStorage.removeItem('menuItems');
        renderProducts();
        showToast('<i data-lucide="trash-2" style="width:20px;height:20px;vertical-align:text-bottom;"></i> ล้างข้อมูลสำเร็จ!', 'เมนูทั้งหมดถูกลบออกจากเครื่องแล้ว', 'success');
    }
};

// ==========================================
// ========== POS SYSTEM LOGIC ==============
// ==========================================

let posCart = [];
let posCurrentCategory = 'all';
let posPendingProduct = null;

// --- Rendering POS Menu ---
window.renderPosMenu = function() {
    const grid = document.getElementById('pos-menu-grid');
    if (!grid) return;
    
    let items = currentProducts;
    if (posCurrentCategory !== 'all') {
        items = currentProducts.filter(p => p.category === posCurrentCategory);
    }
    
    if (items.length === 0) {
        grid.innerHTML = `<div class="empty-state" style="grid-column: 1/-1; text-align: center; padding: 50px;">
                <i data-lucide="clipboard-list" style="width:64px;height:64px;opacity:0.3;margin-bottom:15px;"></i>
                <p style="font-size:1.1rem;">ยังไม่มีออเดอร์</p>
            </div>`;
        return;
    }
    
    grid.innerHTML = items.map(p => {
        const isAvail = p.isAvailable !== false;
        return `
            <div class="pos-item-card ${!isAvail ? 'sold-out' : ''}" onclick="${isAvail ? `openPosCustomModal('${p.id}')` : 'void(0)'}">
                <img src="${p.image}" class="pos-item-img" onerror="this.src='https://images.unsplash.com/photo-1586816001966-79b736744398?auto=format&fit=crop&q=80&w=200'">
                <div class="pos-item-title">${p.name}</div>
                <div class="pos-item-price">฿${p.price}</div>
            </div>
        `;
    }).join('');
    lucide.createIcons();
};

window.filterPosMenu = function(cat, btnElement) {
    posCurrentCategory = cat;
    document.querySelectorAll('.pos-cat-btn').forEach(btn => {
        btn.style.background = 'transparent';
        btn.style.color = 'var(--primary)';
    });
    btnElement.style.background = 'var(--primary)';
    btnElement.style.color = 'white';
    renderPosMenu();
};

// --- Add to POS Cart ---
window.openPosCustomModal = function(id) {
    posPendingProduct = currentProducts.find(p => String(p.id) === String(id));
    if (!posPendingProduct) return;
    
    if (posPendingProduct.category === 'dessert') {
        addDirectToPosCart(posPendingProduct);
        return;
    }
    
    document.getElementById('pos-modal-product-name').innerText = `ปรับแต่ง ${posPendingProduct.name}`;
    const dynamicContainer = document.getElementById('pos-dynamic-options-container');
    dynamicContainer.innerHTML = '';
    
    if (posPendingProduct.options && posPendingProduct.options.trim() !== '') {
        const optionsList = posPendingProduct.options.split(',').map(opt => opt.trim()).filter(opt => opt);
        if (optionsList.length > 0) {
            dynamicContainer.style.display = 'block';
            let html = '<p style="margin-bottom: 10px; font-weight: 600;">ตัวเลือกเพิ่มเติม:</p>';
            html += '<div style="display: flex; flex-direction: column; gap: 10px;">';
            optionsList.forEach((opt, index) => {
                let label = opt;
                let price = 0;
                if (opt.includes(':')) {
                    const parts = opt.split(':');
                    label = parts[0].trim();
                    price = parseInt(parts[1]) || 0;
                }
                html += `
                    <label style="display: flex; align-items: center; justify-content: space-between; cursor: pointer; background: #f9f9f9; padding: 10px; border-radius: 10px;">
                        <div>
                            <input type="checkbox" class="pos-dynamic-cb" value="${label}" data-price="${price}">
                            <span style="font-weight: 500; margin-left: 8px;">${label}</span>
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
    
    document.getElementById('pos-opt-note').value = '';
    document.getElementById('pos-custom-modal').classList.add('active');
};

document.getElementById('pos-confirm-add').onclick = () => {
    let price = posPendingProduct.price;
    const cbs = document.querySelectorAll('.pos-dynamic-cb:checked');
    const selectedOpts = [];
    let extraPrice = 0;
    
    cbs.forEach(cb => {
        const itemPrice = parseInt(cb.getAttribute('data-price')) || 0;
        selectedOpts.push({ name: cb.value, price: itemPrice });
        extraPrice += itemPrice;
    });
    
    price += extraPrice;
    
    const options = { note: document.getElementById('pos-opt-note').value };
    if (selectedOpts.length > 0) options.dynamic = selectedOpts;
    
    posCart.push({
        ...posPendingProduct,
        cartItemId: Date.now(),
        finalPrice: price,
        customOptions: options,
        quantity: 1
    });
    
    updatePosCart();
    document.getElementById('pos-custom-modal').classList.remove('active');
};

window.addDirectToPosCart = function(product) {
    posCart.push({
        ...product,
        cartItemId: Date.now(),
        finalPrice: product.price,
        customOptions: { note: '', isDirect: true },
        quantity: 1
    });
    updatePosCart();
};

window.removePosCartItem = function(cartItemId) {
    posCart = posCart.filter(item => item.cartItemId !== cartItemId);
    updatePosCart();
};

window.clearPosCart = function() {
    if (posCart.length === 0) return;
    if (confirm('ยืนยันการล้างตะกร้า?')) {
        posCart = [];
        document.getElementById('pos-discount').value = 0;
        updatePosCart();
    }
};

window.updatePosTotals = function() {
    const subtotal = posCart.reduce((sum, item) => sum + (item.finalPrice * (item.quantity || 1)), 0);
    const discount = parseInt(document.getElementById('pos-discount').value) || 0;
    const total = Math.max(0, subtotal - discount);
    
    document.getElementById('pos-subtotal').innerText = `฿${subtotal}`;
    document.getElementById('pos-total').innerText = `฿${total}`;
    return { subtotal, discount, total };
};

window.updatePosCart = function() {
    const container = document.getElementById('pos-cart-items');
    document.getElementById('pos-cart-count').innerText = posCart.length;
    
    if (posCart.length === 0) {
        container.innerHTML = '<p style="text-align: center; color: #aaa; margin-top: 20px;">ไม่มีรายการในตะกร้า</p>';
    } else {
        container.innerHTML = posCart.map(item => {
            let customParts = [];
            if (item.customOptions.dynamic) {
                customParts.push(item.customOptions.dynamic.map(d => `${d.name}${d.price > 0 ? ` (+฿${d.price})` : ''}`).join(', '));
            }
            if (item.customOptions.note) customParts.push(item.customOptions.note);
            const customText = customParts.join(', ');
            
            return `
                <div class="pos-cart-item">
                    <div class="pos-cart-item-info">
                        <h5>${item.name}</h5>
                        <p>${customText || 'ปกติ'}</p>
                    </div>
                    <div class="pos-cart-controls">
                        <span class="pos-cart-item-price">฿${item.finalPrice}</span>
                        <button class="pos-qty-btn" onclick="removePosCartItem(${item.cartItemId})" style="color: #ef4444; border-color: #ef4444;"><i data-lucide="x" style="width:12px;height:12px;"></i></button>
                    </div>
                </div>
            `;
        }).join('');
        lucide.createIcons();
    }
    updatePosTotals();
};

// --- Checkout Modals ---
window.openPosCashModal = function() {
    if (posCart.length === 0) return showToast('ไม่สามารถชำระเงินได้', 'ตะกร้าสินค้าว่างเปล่า', 'error');
    const { total } = updatePosTotals();
    document.getElementById('cash-modal-total').innerText = total;
    document.getElementById('cash-received').value = '';
    document.getElementById('cash-change').innerText = '฿0';
    document.getElementById('pos-cash-modal').classList.add('active');
};

window.openPosQrModal = function() {
    if (posCart.length === 0) return showToast('ไม่สามารถชำระเงินได้', 'ตะกร้าสินค้าว่างเปล่า', 'error');
    const { total } = updatePosTotals();
    document.getElementById('qr-modal-total').innerText = total;
    document.getElementById('pos-qr-modal').classList.add('active');
};

window.calculateChange = function() {
    const { total } = updatePosTotals();
    const received = parseInt(document.getElementById('cash-received').value) || 0;
    const change = received - total;
    const el = document.getElementById('cash-change');
    if (change < 0) {
        el.innerText = 'จำนวนเงินไม่พอ';
        el.style.color = '#ef4444';
    } else {
        el.innerText = `฿${change}`;
        el.style.color = '#15803d';
    }
};

window.addQuickCash = function(amt) {
    const input = document.getElementById('cash-received');
    let curr = parseInt(input.value) || 0;
    input.value = curr + amt;
    calculateChange();
};

window.exactCash = function() {
    const { total } = updatePosTotals();
    document.getElementById('cash-received').value = total;
    calculateChange();
};

window.confirmPosOrder = function(method) {
    const { subtotal, discount, total } = updatePosTotals();
    let cashReceived = 0;
    
    if (method === 'cash') {
        cashReceived = parseInt(document.getElementById('cash-received').value) || 0;
        if (cashReceived < total) {
            return showToast('รับเงินไม่พอ', 'กรุณาระบุจำนวนเงินที่รับมาให้ถูกต้อง', 'error');
        }
    }
    
    const typeRadios = document.getElementsByName('pos-order-type');
    let orderType = 'walk-in';
    for (let r of typeRadios) { if (r.checked) orderType = r.value; }
    
    const orderData = {
        customerName: 'ลูกค้าหน้าร้าน',
        phone: '-',
        address: orderType === 'dining' ? 'ทานที่ร้าน' : 'สั่งกลับบ้าน',
        items: posCart,
        subtotal: subtotal,
        discount: discount,
        total: total,
        status: 'เสร็จสิ้น', // หน้าร้านมักจะเสร็จสิ้นทันที หรือเป็น 'รอดำเนินการ' ก็ได้
        orderType: orderType,
        paymentMethod: method,
        cashReceived: method === 'cash' ? cashReceived : null,
        timestamp: useFirebase ? firebase.firestore.FieldValue.serverTimestamp() : new Date().toISOString()
    };

    if (useFirebase) {
        db.collection('orders').add(orderData).then((docRef) => {
            finishPosOrder(docRef.id);
        }).catch(err => showToast('ข้อผิดพลาด', err.message, 'error'));
    } else {
        const orders = JSON.parse(localStorage.getItem('orders')) || [];
        const newId = Date.now();
        orders.push({ id: newId, ...orderData });
        localStorage.setItem('orders', JSON.stringify(orders));
        finishPosOrder(newId);
    }
};

window.finishPosOrder = function(orderId) {
    document.getElementById('pos-cash-modal').classList.remove('active');
    document.getElementById('pos-qr-modal').classList.remove('active');
    
    // พิมพ์ใบเสร็จอัตโนมัติ
    if (confirm('บันทึกออเดอร์สำเร็จ!\nต้องการพิมพ์ใบเสร็จรับเงินหรือไม่?')) {
        printReceipt(orderId);
    }
    
    posCart = [];
    document.getElementById('pos-discount').value = 0;
    updatePosCart();
    showToast('<i data-lucide="check-circle" style="width:20px;height:20px;vertical-align:text-bottom;"></i> เสร็จสิ้น!', 'บันทึกออเดอร์หน้าร้านเรียบร้อย', 'success');
};

// --- Print Logic ---
window.printReceipt = async function(orderId) {
    let order = null;
    if (useFirebase) {
        const doc = await db.collection('orders').doc(orderId).get();
        if(doc.exists) order = { id: doc.id, ...doc.data() };
    } else {
        const orders = JSON.parse(localStorage.getItem('orders')) || [];
        order = orders.find(o => String(o.id) === String(orderId));
    }
    if (!order) return showToast('ไม่พบออเดอร์', '', 'error');
    
    const dateObj = order.timestamp && order.timestamp.toDate ? order.timestamp.toDate() : new Date(order.timestamp);
    const dateStr = dateObj.toLocaleString('th-TH');
    
    let html = `
        <div class="receipt-header">
            <div class="receipt-title">HOMIE BOY</div>
            <div>ใบเสร็จรับเงิน / Receipt</div>
            <div>ออเดอร์: #${String(order.id).slice(-6).toUpperCase()}</div>
            <div>วันที่: ${dateStr}</div>
            <div>ประเภท: ${order.orderType === 'dining' ? 'ทานที่ร้าน' : order.orderType === 'walk-in' ? 'สั่งกลับบ้าน' : 'Delivery'}</div>
        </div>
        <div class="receipt-line"></div>
    `;
    
    order.items.forEach(item => {
        let optStr = '';
        if (item.customOptions) {
            let parts = [];
            if (item.customOptions.dynamic) parts.push(item.customOptions.dynamic.map(d=>d.name).join(', '));
            if (item.customOptions.note) parts.push(item.customOptions.note);
            optStr = parts.join(', ');
        }
        
        html += `
            <div class="receipt-item">
                <span>1x ${item.name}</span>
                <span>${item.finalPrice}</span>
            </div>
        `;
        if (optStr) html += `<div class="receipt-item-desc">- ${optStr}</div>`;
    });
    
    html += `<div class="receipt-line"></div>`;
    if (order.discount && order.discount > 0) {
        html += `
            <div class="receipt-item"><span>ส่วนลด</span><span>-${order.discount}</span></div>
        `;
    }
    html += `
        <div class="receipt-total">
            <span>ยอดสุทธิ</span>
            <span>฿${order.total}</span>
        </div>
    `;
    
    if (order.paymentMethod === 'cash') {
        html += `
            <div class="receipt-item" style="margin-top:5px;"><span>รับเงิน (เงินสด)</span><span>${order.cashReceived || order.total}</span></div>
            <div class="receipt-item"><span>เงินทอน</span><span>${(order.cashReceived || order.total) - order.total}</span></div>
        `;
    } else {
        html += `<div class="receipt-item" style="margin-top:5px;"><span>ชำระผ่าน</span><span>${order.paymentMethod === 'promptpay' ? 'PromptPay' : 'โอนเงิน'}</span></div>`;
    }
    
    html += `
        <div class="receipt-line"></div>
        <div class="receipt-footer">
            ขอบคุณที่อุดหนุน<br>
            Thank you!
        </div>
    `;
    
    const printArea = document.getElementById('print-area');
    printArea.innerHTML = html;
    
    // หน่วงเวลาเล็กน้อยเพื่อให้เบราว์เซอร์เรนเดอร์ก่อนสั่งปริ้น
    setTimeout(() => {
        window.print();
    }, 300);
};
