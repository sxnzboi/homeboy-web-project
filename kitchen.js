let useFirebase = false;
let pendingOrders = [];
let previousOrderCount = 0;

try {
    if (typeof firebase !== 'undefined' && firebase.apps.length && firebaseConfig.apiKey !== "YOUR_API_KEY") {
        useFirebase = true;
    }
} catch (e) {
    console.warn("Firebase not configured for KDS.");
}

const grid = document.getElementById('kds-grid');
const audio = document.getElementById('notification-sound');

let lastCompletedOrder = null;
let undoTimeout = null;

function updateClock() {
    const now = new Date();
    document.getElementById('clock').innerText = now.toLocaleTimeString('th-TH');
    
    // Re-render KDS every minute to update the late-order timer
    if (now.getSeconds() === 0 && pendingOrders.length > 0) {
        renderKDS();
    }
}
setInterval(updateClock, 1000);
updateClock();

let allProducts = [];

function loadProducts() {
    if (useFirebase) {
        db.collection('menu').onSnapshot(snap => {
            allProducts = snap.docs.map(doc => ({ ...doc.data(), id: doc.id }));
            if (pendingOrders.length > 0) {
                renderKDS();
            }
        });
    } else {
        const fetchLocal = () => {
            allProducts = JSON.parse(localStorage.getItem('menuItems')) || [];
            renderKDS();
        };
        fetchLocal();
        window.addEventListener('storage', (e) => {
            if (e.key === 'menuItems') fetchLocal();
        });
    }
}

window.showRecipe = function(orderId, itemId) {
    const order = pendingOrders.find(o => String(o.id) === String(orderId));
    if (!order) return;
    
    const item = (order.items || []).find(i => String(i.id) === String(itemId) || String(i.cartItemId) === String(itemId));
    if (!item) return;

    const prodInfo = allProducts.find(p => String(p.id) === String(item.id)) || item;
    
    document.getElementById('recipe-modal-title').innerText = item.name;
    
    let html = '';
    if (prodInfo.ingredients) {
        html += `<h4 style="color:#10b981; margin-bottom: 5px;">วัตถุดิบ:</h4><p style="color:#ddd; margin-bottom: 15px; font-size: 1.1rem; line-height: 1.5;">${prodInfo.ingredients}</p>`;
    }
    if (prodInfo.recipeSteps) {
        html += `<h4 style="color:#10b981; margin-bottom: 5px;">วิธีทำ:</h4><div style="color:#ddd; white-space: pre-wrap; font-size: 1.1rem; line-height: 1.5;">${prodInfo.recipeSteps}</div>`;
    }
    
    if (!prodInfo.ingredients && !prodInfo.recipeSteps) {
        html = `<p style="color:#888;">ไม่มีข้อมูลสูตรและวิธีทำ</p>`;
    }
    
    document.getElementById('recipe-modal-body').innerHTML = html;
    document.getElementById('recipe-modal').style.display = 'flex';
};

function renderProductSummary() {
    const summaryContainer = document.getElementById('product-summary');
    if (!summaryContainer) return;
    
    if (pendingOrders.length === 0) {
        summaryContainer.style.display = 'none';
        return;
    }
    
    const productCount = {};
    pendingOrders.forEach(order => {
        (order.items || []).forEach(item => {
            productCount[item.name] = (productCount[item.name] || 0) + (item.quantity || 1);
        });
    });
    
    const summaryHtml = Object.entries(productCount).map(([name, qty]) => `
        <span class="summary-badge">
            <i data-lucide="utensils" style="width: 14px; height: 14px;"></i> 
            ${name} x${qty}
        </span>
    `).join('');
    
    summaryContainer.innerHTML = summaryHtml;
    summaryContainer.style.display = 'flex';
}

function renderKDS() {
    renderProductSummary();
    
    if (pendingOrders.length === 0) {
        grid.innerHTML = `
            <div class="empty-state">
                <i data-lucide="coffee"></i>
                <h2>ไม่มีออเดอร์ในคิว</h2>
                <p>ห้องครัวว่างแล้ว!</p>
            </div>
        `;
        lucide.createIcons();
        return;
    }

    grid.innerHTML = pendingOrders.map(order => {
        let typeClass = 'type-delivery';
        let typeText = '<i data-lucide="bike" style="width: 18px; height: 18px; margin-right: 4px; vertical-align: text-bottom;"></i> Delivery';
        
        if (order.orderType === 'dining') {
            typeClass = 'type-dining';
            typeText = '<i data-lucide="utensils" style="width: 18px; height: 18px; margin-right: 4px; vertical-align: text-bottom;"></i> ทานที่ร้าน';
        } else if (order.orderType === 'walk-in') {
            typeClass = 'type-walkin';
            typeText = '<i data-lucide="shopping-bag" style="width: 18px; height: 18px; margin-right: 4px; vertical-align: text-bottom;"></i> สั่งกลับบ้าน';
        }

        const dateObj = order.timestamp && order.timestamp.toDate 
            ? order.timestamp.toDate() 
            : new Date(order.timestamp || Date.now());
        const timeStr = dateObj.toLocaleTimeString('th-TH');

        const itemsHtml = (order.items || []).map(item => {
            let optStr = '';
            if (item.customOptions) {
                let parts = [];
                if (item.customOptions.dynamic) parts.push(item.customOptions.dynamic.map(d => d.name || d).join(', '));
                if (item.customOptions.note) parts.push(item.customOptions.note);
                optStr = parts.join(', ');
            }
            
            // Get latest recipe from menuItems if available, else fallback to item snapshot
            const prodInfo = allProducts.find(p => String(p.id) === String(item.id)) || item;
            
            let recipeBtn = '';
            if (prodInfo.ingredients || prodInfo.recipeSteps) {
                const uniqueId = item.id || item.cartItemId || item.name;
                recipeBtn = `<button type="button" onclick="showRecipe('${order.id}', '${uniqueId}')" style="margin-top: 8px; background: transparent; color: #10b981; border: 1px solid #10b981; border-radius: 6px; padding: 4px 10px; font-size: 0.85rem; cursor: pointer; display: inline-flex; align-items: center; gap: 5px;">
                    <i data-lucide="book-open" style="width: 14px; height: 14px;"></i> ดูสูตร / วิธีทำ
                </button>`;
            }

            return `
                <div class="item-row" style="margin-bottom: 15px; padding-bottom: 10px; border-bottom: 1px dashed #333;">
                    <div class="item-name">
                        <span style="font-weight: 600; font-size: 1.05rem;">${item.name}</span>
                        <span class="item-qty" style="color: #ff6b00; font-weight: 700;">x${item.quantity || 1}</span>
                    </div>
                    ${optStr ? `<div class="item-note" style="color: #ffb380; font-size: 0.9rem; margin-top: 5px;">** ${optStr} **</div>` : ''}
                    ${recipeBtn}
                </div>
            `;
        }).join('');

        const orderAgeMinutes = (Date.now() - dateObj.getTime()) / 60000;
        const isLate = orderAgeMinutes >= 15;
        const isCooking = order.status === 'กำลังปรุง';
        let cardClass = 'order-card';
        if (isLate) cardClass = 'order-card late-order';
        else if (isCooking) cardClass = 'order-card cooking-order';

        // Status badge
        const statusBadge = isCooking
            ? `<span class="kds-status-badge cooking"><i data-lucide="flame" style="width:12px;height:12px;"></i> กำลังปรุง</span>`
            : `<span class="kds-status-badge pending"><i data-lucide="clock" style="width:12px;height:12px;"></i> รอดำเนินการ</span>`;

        // Action button depends on current status
        const actionBtn = isCooking
            ? `<div style="display:flex;border-top:1px solid #333;">
                   <button class="btn-cancel-small" onclick="cancelOrder('${order.id}')">
                       <i data-lucide="x-circle" style="width:18px;height:18px;"></i> ยกเลิก
                   </button>
                   <button class="btn-done" style="flex:1;border-top:none;" onclick="markAsReady('${order.id}')">
                       <i data-lucide="check-circle"></i> ทำเสร็จแล้ว
                   </button>
               </div>`
            : `<div style="display:flex;border-top:1px solid #333;">
                   <button class="btn-cancel-small" onclick="cancelOrder('${order.id}')">
                       <i data-lucide="x-circle" style="width:18px;height:18px;"></i> ยกเลิก
                   </button>
                   <button class="btn-start" style="flex:1;" onclick="markAsCooking('${order.id}')">
                       <i data-lucide="flame"></i> เริ่มปรุงอาหาร
                   </button>
               </div>`;

        return `
            <div class="${cardClass}">
                <div class="order-header">
                    <span class="order-id">#${String(order.id).slice(-4).toUpperCase()}</span>
                    <div style="display:flex;align-items:center;gap:8px;">
                        ${statusBadge}
                        <span class="order-type ${typeClass}">${typeText}</span>
                    </div>
                </div>
                <div class="order-time">เข้ามาเมื่อ: ${timeStr} <span style="margin-left: 10px; color: ${isLate ? '#ef4444' : '#aaa'}; font-weight: ${isLate ? 'bold' : 'normal'}">${isLate ? '(ช้าเกินไป!)' : ''}</span></div>
                <div class="order-items">
                    ${itemsHtml}
                </div>
                ${actionBtn}
            </div>
        `;
    }).join('');
    
    lucide.createIcons();
}

function fetchPendingOrders() {
    if (useFirebase) {
        db.collection('orders')
          .where('status', 'in', ['รอดำเนินการ', 'กำลังปรุง'])
          .onSnapshot(snapshot => {
              pendingOrders = snapshot.docs
                  .map(doc => ({ id: doc.id, ...doc.data() }))
                  .sort((a, b) => {
                      const tA = a.timestamp && a.timestamp.toDate ? a.timestamp.toDate() : new Date(a.timestamp || 0);
                      const tB = b.timestamp && b.timestamp.toDate ? b.timestamp.toDate() : new Date(b.timestamp || 0);
                      return tA - tB;
                  });
              
              if (pendingOrders.length > previousOrderCount) {
                  audio.play().catch(e => console.log("Audio play blocked by browser."));
              }
              previousOrderCount = pendingOrders.length;
              
              renderKDS();
          }, error => {
              console.error("Error fetching orders:", error);
          });
    } else {
        const poll = () => {
            const allOrders = JSON.parse(localStorage.getItem('orders')) || [];
            pendingOrders = allOrders.filter(o => o.status === 'รอดำเนินการ' || o.status === 'กำลังปรุง');
            
            if (pendingOrders.length > previousOrderCount) {
                audio.play().catch(e => console.log("Audio blocked."));
            }
            previousOrderCount = pendingOrders.length;
            
            renderKDS();
        };
        poll();
        setInterval(poll, 1000);
        window.addEventListener('orderAdded', poll);
        window.addEventListener('storage', (e) => {
            if (e.key === 'orders') poll();
        });
    }
}

// เชฟกด "เริ่มปรุงอาหาร" → เปลี่ยนสถานะเป็น กำลังปรุง
window.markAsCooking = function(orderId) {
    if (useFirebase) {
        db.collection('orders').doc(orderId).update({ status: 'กำลังปรุง' })
          .catch(err => alert("เกิดข้อผิดพลาด: " + err.message));
    } else {
        let allOrders = JSON.parse(localStorage.getItem('orders')) || [];
        const idx = allOrders.findIndex(o => String(o.id) === String(orderId));
        if (idx > -1) {
            allOrders[idx].status = 'กำลังปรุง';
            localStorage.setItem('orders', JSON.stringify(allOrders));
        }
        renderKDS();
    }
};

// เชฟยกเลิกออเดอร์ (ingredients หมด / ปัญหา)
window.cancelOrder = function(orderId) {
    if (!confirm(`ยืนยันยกเลิกออเดอร์ #${String(orderId).slice(-4).toUpperCase()}?\nลูกค้าจะเห็นสถานะยกเลิกทันที`)) return;

    if (useFirebase) {
        db.collection('orders').doc(orderId).update({ status: 'ยกเลิก' })
          .catch(err => alert("เกิดข้อผิดพลาด: " + err.message));
    } else {
        let allOrders = JSON.parse(localStorage.getItem('orders')) || [];
        const idx = allOrders.findIndex(o => String(o.id) === String(orderId));
        if (idx > -1) {
            allOrders[idx].status = 'ยกเลิก';
            localStorage.setItem('orders', JSON.stringify(allOrders));
        }
    }
    // ลบออเดอร์ออกจากคิว KDS
    pendingOrders = pendingOrders.filter(o => String(o.id) !== String(orderId));
    previousOrderCount = pendingOrders.length;
    renderKDS();
};

window.markAsReady = function(orderId) {
    // Save state for undo
    const orderObj = pendingOrders.find(o => String(o.id) === String(orderId));
    if (orderObj) {
        lastCompletedOrder = { ...orderObj };
        
        // Show undo toast
        const toast = document.getElementById('undo-toast');
        document.getElementById('undo-text').innerText = `ออเดอร์ #${String(orderId).slice(-4).toUpperCase()} ทำเสร็จแล้ว`;
        toast.classList.add('show');
        
        if (undoTimeout) clearTimeout(undoTimeout);
        undoTimeout = setTimeout(() => {
            toast.classList.remove('show');
            lastCompletedOrder = null;
        }, 10000);
    }

    if (useFirebase) {
        db.collection('orders').doc(orderId).update({ status: 'พร้อมเสิร์ฟ' })
          .catch(err => alert("เกิดข้อผิดพลาด: " + err.message));
    } else {
        let allOrders = JSON.parse(localStorage.getItem('orders')) || [];
        const idx = allOrders.findIndex(o => String(o.id) === String(orderId));
        if (idx > -1) {
            allOrders[idx].status = 'พร้อมเสิร์ฟ';
            localStorage.setItem('orders', JSON.stringify(allOrders));
        }
    }
    pendingOrders = pendingOrders.filter(o => String(o.id) !== String(orderId));
    previousOrderCount = pendingOrders.length;
    renderKDS();
};

window.undoOrder = function() {
    if (!lastCompletedOrder) return;
    
    const orderId = lastCompletedOrder.id;
    const oldStatus = lastCompletedOrder.status || 'กำลังปรุง';

    if (useFirebase) {
        db.collection('orders').doc(orderId).update({ status: oldStatus })
          .catch(err => alert("เกิดข้อผิดพลาดในการย้อนกลับ: " + err.message));
    } else {
        let allOrders = JSON.parse(localStorage.getItem('orders')) || [];
        const idx = allOrders.findIndex(o => String(o.id) === String(orderId));
        if (idx > -1) {
            allOrders[idx].status = oldStatus;
            localStorage.setItem('orders', JSON.stringify(allOrders));
        }
    }
    
    // Hide toast and clear
    document.getElementById('undo-toast').classList.remove('show');
    lastCompletedOrder = null;
    if (undoTimeout) clearTimeout(undoTimeout);
    
    // Order will be fetched automatically via polling or firebase snapshot
    if (!useFirebase) {
        // Trigger manual update
        window.dispatchEvent(new Event('orderAdded'));
    }
};

document.addEventListener('click', () => {
    audio.play().then(() => {
        audio.pause();
        audio.currentTime = 0;
    }).catch(() => {});
}, { once: true });

fetchPendingOrders();
