/**
 * ============================================================
 * PROJECT: SLSU EExpress+ Smart Cloud Locker
 * VERSION: 10.3 (Strict Hardware Camera Enforcement)
 * ============================================================
 */

import { initializeApp } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js";
import { getDatabase, ref, onValue, push, update, get, set, runTransaction } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-database.js";
import { getStorage, ref as sRef, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-storage.js";

// ==========================================
// 1. FIREBASE SECURE INITIALIZATION
// ==========================================
const firebaseConfig = {
    apiKey: "AIzaSyCA9WYXtv_-SBu0mXuenjIweUjgm8qza9Y",
    authDomain: "slsu-eexpress-plus.firebaseapp.com",
    databaseURL: "https://slsu-eexpress-plus-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "slsu-eexpress-plus",
    storageBucket: "slsu-eexpress-plus.firebasestorage.app",
    messagingSenderId: "1077938592700",
    appId: "1:1077938592700:web:0616ecbb43c611c8c269b9"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth();
const db = getDatabase(app);
const storage = getStorage(app);

// ==========================================
// 2. GLOBAL SYSTEM STATE & CAMERA VARS
// ==========================================
let systemInit = false;
let lastOccupiedState = { 1: false, 2: false };
let selPayment = "Prepaid";
let walletBal = 0.00;

// Use direct hardware API variable instead of the UI Scanner
let html5QrCode = null; 
let currentRetrievingLocker = 0;
let expectedRetrievalToken = "";
let currentActiveTxnId = "";

// Injecting Cyber-Veridian Keyframes for dynamic animations
const styleInject = document.createElement('style');
styleInject.innerHTML = `
    @keyframes pulseVeridian { 0% { opacity: 0.4; text-shadow: 0 0 5px #39ff14; } 50% { opacity: 1; text-shadow: 0 0 20px #39ff14; } 100% { opacity: 0.4; text-shadow: 0 0 5px #39ff14; } }
    @keyframes scanReticle { 0% { border-color: #39ff14; box-shadow: 0 0 10px #39ff14; } 50% { border-color: #a0e8af; box-shadow: inset 0 0 20px #39ff14; } 100% { border-color: #39ff14; box-shadow: 0 0 10px #39ff14; } }
`;
document.head.appendChild(styleInject);

// ==========================================
// 3. UI ENGINE & HAPTIC FEEDBACK
// ==========================================
window.notify = (msg, type = "info") => {
    const container = document.getElementById('toast-container');
    if (!container) return; 

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    let icon = "ℹ️";
    
    // Cyber-Veridian UI Overrides
    toast.style.background = "rgba(18, 22, 20, 0.85)";
    toast.style.backdropFilter = "blur(10px)";
    toast.style.fontFamily = "monospace";
    toast.style.color = "#ffffff";
    toast.style.border = "1px solid #00ffcc";

    if (type === 'success') {
        icon = "[✓]";
        toast.style.border = "1px solid #39ff14";
        toast.style.color = "#39ff14";
        toast.style.boxShadow = "0 0 15px rgba(57, 255, 20, 0.3)";
    }
    if (type === 'error') {
        icon = "[!]";
        toast.style.border = "1px solid #ff3333";
        toast.style.color = "#ff3333";
    }
    
    toast.innerHTML = `<span style="font-size:1.5rem;">${icon}</span> <div>${msg}</div>`;
    container.appendChild(toast);
    
    setTimeout(() => toast.classList.add('show'), 100);
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 500);
    }, 4000);

    if ("vibrate" in navigator) {
        if (type === 'error') navigator.vibrate([200, 100, 200]);
        if (type === 'success') navigator.vibrate([50, 50, 100]); 
    }
};

window.toggleLoader = (show, text = "ENERGIZING CLOUD...") => {
    const loader = document.getElementById('loading-overlay');
    const lText = document.getElementById('loading-text');
    if (lText) lText.innerText = text.toUpperCase();
    if (loader) loader.style.display = show ? 'flex' : 'none';
};

// ==========================================
// 4. AUTHENTICATION MODULE
// ==========================================
const loginBtn = document.getElementById("loginBtn");
if (loginBtn) {
    loginBtn.onclick = async () => {
        const email = document.getElementById("emailField").value;
        const pass = document.getElementById("passwordField").value;
        if(!email || !pass) return notify("Enter Credentials", "error");

        toggleLoader(true, "AUTHORIZING...");
        try {
            const userCredential = await signInWithEmailAndPassword(auth, email, pass);
            const uid = userCredential.user.uid;
            
            let role = "recipient";
            if (uid === "CzTMNl1oIwefB1t6iuVa6Cg65dD3" || email === "alexis_courier@gmail.com") role = "courier";
            else if (uid === "iNS6Y20LdpQAe8tqUUjedRi1gMr1" || email === "alexis_monitor@gmail.com") role = "monitor";
            
            localStorage.setItem("userRole", role);
            location.reload();
        } catch (e) {
            toggleLoader(false);
            notify("Access Denied: Invalid Account", "error");
        }
    };
}

onAuthStateChanged(auth, (user) => {
    const authOverlay = document.getElementById("auth-pane") || document.getElementById("auth-overlay");
    const appBody = document.getElementById("app-body");

    if (user) {
        let role = localStorage.getItem("userRole");
        if (!role) {
            if (user.email === "alexis_courier@gmail.com") role = "courier";
            else if (user.email === "alexis_monitor@gmail.com") role = "monitor";
            else role = "recipient";
            localStorage.setItem("userRole", role);
        }
        window.userRole = role;
        
        const navCourier = document.getElementById("nav-courier");
        const navRecipient = document.getElementById("nav-recipient");
        const navMonitor = document.getElementById("nav-monitor"); 

        if (authOverlay) authOverlay.style.display = "none";
        if (appBody) appBody.style.display = "flex";
        
        if (navCourier) navCourier.style.display = window.userRole === "courier" ? "flex" : "none";
        if (navRecipient) navRecipient.style.display = window.userRole === "recipient" ? "flex" : "none";
        if (navMonitor) navMonitor.style.display = window.userRole === "monitor" ? "flex" : "none";
        
        let targetPane = window.userRole === "courier" ? "c-dashboard" : (window.userRole === "monitor" ? "m-dashboard" : "r-dashboard");
        window.showPane(targetPane);
        startGlobalListeners();
    } else {
        if (authOverlay) authOverlay.style.display = "flex";
        if (appBody) appBody.style.display = "none";
        toggleLoader(false);
    }
});

const logoutBtn = document.getElementById("logoutBtn");
if (logoutBtn) {
    logoutBtn.onclick = () => { signOut(auth).then(() => { localStorage.clear(); location.reload(); }); };
}

// ==========================================
// 5. MASTER SYNC: CLOUD, HARDWARE & MONITOR
// ==========================================
function startGlobalListeners() {
    const userUID = auth.currentUser.uid;

    onValue(ref(db, `user_wallets/${userUID}`), (snap) => {
        walletBal = snap.val() !== null ? parseFloat(snap.val()) : 0.00;
        const balUI = document.getElementById('wallet-bal');
        if (balUI) balUI.innerText = walletBal.toFixed(2);
    });

    onValue(ref(db, "system_stats/total_revenue"), (snap) => {
        const rev = parseFloat(snap.val()) || 0;
        const el = document.getElementById('total-rev');
        if(el) el.innerText = rev.toFixed(2);
    });

    // LISTENING TO NEW ESP32 DATABASE STRUCTURE
    onValue(ref(db, "system_control"), (snapshot) => {
        const data = snapshot.val();
        if (!data) return;

        [1, 2].forEach(num => {
            const lockerNode = data[`locker_${num}`];
            if(!lockerNode) return;

            const card = document.getElementById(`grid-l${num}`);
            const statusLabel = document.getElementById(`status-l${num}`);
            const weightBadge = document.getElementById(`weight-l${num}`);
            const ledDot = document.getElementById(`dot-l${num}`);

            if (card) {
                if (weightBadge) weightBadge.innerText = `${Math.round(lockerNode.weight_status || 0)}g`;
                
                if (ledDot) { lockerNode.lock_command === "UNLOCKED" ? ledDot.classList.add('led-on') : ledDot.classList.remove('led-on'); }

                // ESP32 State Machine Check
                if (lockerNode.state === "DEPOSIT_BREACH") {
                    card.className = "locker-card locker-breach";
                    if(statusLabel) statusLabel.innerText = "SECURITY BREACH";
                    document.body.classList.add("alarm-active");
                }
                else if (lockerNode.state === "OCCUPIED") {
                    card.className = "locker-card locker-occupied";
                    if(statusLabel) statusLabel.innerText = "SECURED";
                    document.body.classList.remove("alarm-active");
                    
                    // Auto-hide the loading screen if the ESP32 successfully secured the locker
                    const overlay = document.getElementById('opening-overlay');
                    if (overlay && overlay.getAttribute('data-locker') == num && overlay.style.display === 'flex') {
                        overlay.style.display = 'none';
                        notify("Parcel Secured Successfully.", "success");
                    }
                }
                else if (lockerNode.state === "REJECTED_RETURN_PROCESSING") {
                    card.className = "locker-card locker-warning";
                    if(statusLabel) statusLabel.innerText = "REJECTED RETURN";
                }
                else if (lockerNode.state === "DEPOSIT_PROCESSING") {
                    card.className = "locker-card locker-warning";
                    if(statusLabel) statusLabel.innerText = "DETECTING PARCEL...";
                }
                else {
                    card.className = "locker-card locker-available";
                    if(statusLabel) statusLabel.innerText = "READY";
                    document.body.classList.remove("alarm-active");
                }
                lastOccupiedState[num] = (lockerNode.state === "OCCUPIED");
            }
        });
        systemInit = true;
    });

    // TRANSACTIONS SYNC - UPDATED TO USE 'parcels' NODE
    onValue(ref(db, "parcels"), (snapshot) => {
        const courierList = document.getElementById("pending-list");
        const recList = document.getElementById("recipient-content");
        const courierHist = document.getElementById("courier-past-list");
        const recHist = document.getElementById("history-content");

        if (courierList) courierList.innerHTML = "";
        if (recList) recList.innerHTML = "";
        if (courierHist) courierHist.innerHTML = "";
        if (recHist) recHist.innerHTML = "";

        snapshot.forEach((child) => {
            const p = child.val();
            const id = child.key;
            if (id === "init_node") return; 

            const activityHtml = `
                <div class="card" style="padding:25px; display:flex; justify-content:space-between; align-items:center; border:1px solid rgba(57, 255, 20, 0.2); background: rgba(10, 15, 12, 0.6); margin-bottom: 15px;">
                    <div>
                        <span style="font-size:1.4rem; font-family: monospace; font-weight:900; color: #fff;">${p.receiver}</span> 
                        <span style="color:#39ff14; font-weight:800; font-family: monospace;">(L-0${p.locker})</span><br>
                        <small style="color:var(--text-secondary); font-size:0.95rem; display:block; margin-top:5px; font-family: var(--font-primary);">Agent: ${p.courier_name}</small>
                    </div>
                    <span class="status-tag" style="color:#39ff14; border: 1px solid #39ff14; padding: 8px 16px; border-radius: 4px; font-weight: bold; font-family: monospace; background: rgba(57, 255, 20, 0.1);">${p.status.toUpperCase()}</span>
                </div>`;

            if (window.userRole === "courier") {
                if (p.status === "COMPLETED" || p.status === "REJECTED") {
                    if (courierHist) courierHist.innerHTML += activityHtml;
                } else {
                    if (courierList) courierList.innerHTML += activityHtml;
                }
            } else if (window.userRole === "recipient") {
                if (p.status === "COMPLETED" || p.status === "REJECTED") {
                    if (recHist) recHist.innerHTML += activityHtml;
                }
                else if (p.status === "AWAITING_CONFIRMATION") {
                    if (recList) {
                        recList.innerHTML += `
                            <div class="card" style="background: rgba(15, 20, 15, 0.8); backdrop-filter: blur(10px); border: 1px solid rgba(57, 255, 20, 0.4); box-shadow: 0 0 20px rgba(57, 255, 20, 0.1); border-radius: 12px;">
                                <h3 style="color: #39ff14; font-family: monospace;">> Rider Info Dashboard</h3>
                                <img src="${p.photo}" style="width:100%; border-radius:8px; margin-bottom:15px; border: 1px solid #39ff14;">
                                <p style="font-size:1.4rem; font-weight:bold; color: #fff; font-family: monospace;">TARGET: <span style="color: #39ff14;">${p.receiver}</span></p>
                                <p style="font-size:1.1rem; color: #fff; font-family: monospace;">Agent: ${p.courier_name}</p>
                                
                                <div style="display:flex; gap:15px; justify-content: center; margin-top:20px;">
                                    <button class="btn" style="background: rgba(57, 255, 20, 0.1); border: 1px solid #39ff14; color: #39ff14; font-family: monospace;" onclick="window.vfy('${id}', true, '${p.payment_status}', '${p.amount}', ${p.locker})">[ AUTHORIZE ]</button>
                                    <button class="btn" style="background: transparent; border: 1px solid #ff3333; color: #ff3333; font-family: monospace;" onclick="window.vfy('${id}', false, '', '0', ${p.locker})">[ REJECT ]</button>
                                </div>
                            </div>`;
                    }
                } else if (p.status === "VERIFIED_UNPAID") {
                    if (recList) {
                        recList.innerHTML += `
                        <div class="card" style="border: 1px solid #ff3333;">
                            <h3 style="color: #ff3333; font-family: monospace; margin-bottom: 15px;">FUNDS REQUIRED: ₱${p.amount}</h3>
                            <button class="btn" style="background: #ff3333; color: #fff; border: none;" onclick="window.payWallet('${id}', '${p.amount}')">SETTLE VIA WALLET</button>
                        </div>`;
                    }
                } else if (p.status === "READY_TO_SCAN") {
                    if (recList) {
                        recList.innerHTML += `
                            <div class="card" style="background: rgba(10, 15, 12, 0.9); border: 1px solid #39ff14; text-align: center;">
                                <h3 style="color: #39ff14; font-family: monospace; margin-bottom: 15px;">SYSTEM SECURED: L-0${p.locker}</h3>
                                <button class="btn" style="background: #39ff14; color: #0a0f0c; font-family: monospace; font-weight: bold;" onclick="window.triggerReadyToScan(${p.locker}, '${id}', '${p.token}')">> GENERATE QR _</button>
                            </div>`;
                    }
                }
            }
        });
        toggleLoader(false); 
    });
}

// ==========================================
// 6. PHASE 1: COURIER OPERATIONS
// ==========================================
window.setPayment = (type) => {
    selPayment = type;
    document.getElementById('btn-pre').style.borderColor = (type === 'Prepaid') ? '#39ff14' : 'rgba(255,255,255,0.2)';
    document.getElementById('btn-pay').style.borderColor = (type === 'Pay Later') ? '#39ff14' : 'rgba(255,255,255,0.2)';
};

window.previewPhoto = (input) => {
    if (input.files && input.files[0]) {
        const reader = new FileReader();
        reader.onload = (e) => { const img = document.getElementById("preview-img"); if(img) { img.src = e.target.result; img.style.display = "block"; } };
        reader.readAsDataURL(input.files[0]);
    }
};

window.proceedToGrid = () => {
    const recName = document.getElementById("rec-name");
    const courName = document.getElementById("cour-name");
    const fCam = document.getElementById("f-cam");

    if (!recName || !recName.value || !courName || !courName.value) return notify("Missing Details", "error");
    
    // STRICT PHOTO ENFORCEMENT
    if (!fCam || !fCam.files || fCam.files.length === 0) {
        return notify("Photo Evidence is STRICTLY REQUIRED.", "error");
    }

    document.getElementById("drop-step-1").style.display = "none";
    document.getElementById("drop-step-2").style.display = "block";
};

window.backToStep1 = () => {
    document.getElementById("drop-step-1").style.display = "block";
    document.getElementById("drop-step-2").style.display = "none";
};

window.selectLocker = async (num) => {
    if (lastOccupiedState[num]) return notify(`Locker 0${num} is occupied!`, "error");

    const fCam = document.getElementById("f-cam");
    if (!fCam || !fCam.files[0]) return notify("Photo Evidence Required", "error");
    
    toggleLoader(true, "ENERGIZING LOCKER...");
    try {
        const sPath = sRef(storage, `parcels/${Date.now()}`);
        const uploadSnap = await uploadBytes(sPath, fCam.files[0]);
        const photoLink = await getDownloadURL(uploadSnap.ref);

        const newTxnRef = push(ref(db, "parcels"));
        const txnId = newTxnRef.key;
        
        const amt = parseFloat(document.getElementById('amount-due').value || 0).toFixed(2);
        const secureToken = Math.random().toString(36).substring(2, 10).toUpperCase();

        await set(newTxnRef, {
            locker: num,
            courier_name: document.getElementById('cour-name').value,
            courier_phone: document.getElementById('cour-phone').value,
            receiver: document.getElementById('rec-name').value,
            phone: document.getElementById('rec-phone').value,
            photo: photoLink,
            amount: amt,
            payment_type: selPayment,
            payment_status: (selPayment === 'Prepaid' ? 'Completed' : 'Pending'),
            token: secureToken,
            status: "AWAITING_CONFIRMATION",
            timestamp: new Date().toLocaleString()
        });

        // ESP32 HARDWARE TRIGGER: Unlock Command
        await update(ref(db, `system_control/locker_${num}`), { lock_command: "UNLOCKED" });

        toggleLoader(false);
        const overlay = document.getElementById('opening-overlay');
        if (overlay) { overlay.setAttribute('data-locker', num); overlay.style.display = 'flex'; }
    } catch (err) { toggleLoader(false); notify("Cloud Sync Failed", "error"); }
};

window.closeOpeningOverlay = () => {
    const overlay = document.getElementById('opening-overlay');
    if (overlay) overlay.style.display = 'none';
    location.reload();
};

// ==========================================
// 7. PHASE 2 & 3: RECIPIENT OPS
// ==========================================
window.vfy = async (id, isMine, payStatus, amountStr, lockerNum) => {
    const amount = parseFloat(amountStr) || 0;
    if (isMine) {
        if (payStatus === 'Pending' && amount > 0) {
            await update(ref(db, `parcels/${id}`), { status: "VERIFIED_UNPAID" });
            notify("Verified. Please clear your balance.", "success");
        } else {
            await update(ref(db, `parcels/${id}`), { status: "READY_TO_SCAN" });
            notify("Ownership Authorized.", "success");
        }
    } else {
        if (confirm("Reject this delivery?")) {
            await update(ref(db, `parcels/${id}`), { status: "REJECTED" });
            // ESP32 HARDWARE TRIGGER: Rejection State
            await update(ref(db, `system_control/locker_${lockerNum}`), { rejection_state: true });
            notify("Parcel Rejected. Courier Notified.", "error");
        }
    }
};

window.payWallet = async (id, costStr) => {
    const cost = parseFloat(costStr) || 0;
    if (walletBal >= cost) {
        toggleLoader(true, "Processing Payment...");
        setTimeout(async () => {
            try {
                const userUID = auth.currentUser.uid;
                const newBal = walletBal - cost;
                await set(ref(db, `user_wallets/${userUID}`), newBal);
                await update(ref(db, `parcels/${id}`), { payment_status: 'Completed', status: 'READY_TO_SCAN' });
                
                await runTransaction(ref(db, "system_stats/total_revenue"), (current) => {
                    return (parseFloat(current) || 0) + cost;
                });

                document.getElementById('inv-id').innerText = id.substring(1, 8).toUpperCase();
                document.getElementById('inv-locker').innerText = `Paid`;
                document.getElementById('inv-amount').innerText = `₱${cost.toFixed(2)}`;

                toggleLoader(false);
                document.getElementById('invoice-overlay').style.display = 'flex';
                notify("Payment Settled", "success");
            } catch (error) {
                toggleLoader(false);
                notify("Payment Error.", "error");
            }
        }, 1500);
    } else { notify("Insufficient Funds", "error"); }
};

window.closeInvoice = () => document.getElementById('invoice-overlay').style.display = 'none';

window.triggerReadyToScan = async (lockerNum, txnId, token) => {
    // Cloud writes to trigger ESP32 UART string to Mega
    await update(ref(db, `system_control/locker_${lockerNum}`), { 
        active_token: token,
        ready_to_scan: true
    });

    window.openCameraScanner(token, lockerNum, txnId);
    notify("Link established. Scan terminal QR.", "success");
};

// ==========================================
// 8. PHASE 7: RETRIEVAL SCANNER (NATIVE CAMERA ENFORCEMENT)
// ==========================================
window.openCameraScanner = (tokenToMatch, lockerNum, txnId) => {
    currentRetrievingLocker = lockerNum;
    expectedRetrievalToken = tokenToMatch;
    currentActiveTxnId = txnId;
    
    let camOverlay = document.getElementById('camera-overlay');
    // Create the overlay dynamically if it doesn't exist in HTML
    if (!camOverlay) {
        camOverlay = document.createElement('div');
        camOverlay.id = 'camera-overlay';
        camOverlay.style = "position:fixed; inset:0; background:rgba(10, 15, 12, 0.98); z-index:90000; display:flex; flex-direction:column; justify-content:center; align-items:center; padding:20px;";
        camOverlay.innerHTML = `
            <h3 style="color:#39ff14; font-family:monospace; margin-bottom:20px;">Scan TFT Monitor</h3>
            <div id="qr-reader" style="width:100%; max-width:400px; border:4px solid #39ff14; border-radius:15px; overflow:hidden; background:#000; min-height:300px;"></div>
            <button class="btn btn-ghost" style="margin-top:30px; background: rgba(255,50,50,0.2); border: 1px solid #ff3333; color: #ff3333;" onclick="window.stopCameraScanner()">Cancel Scan</button>
        `;
        document.body.appendChild(camOverlay);
    } else {
        camOverlay.style.display = 'flex';
    }

    // DIRECT HARDWARE API: Bypasses the UI Simulator and forces the physical phone camera
    if (!html5QrCode) {
        html5QrCode = new Html5Qrcode("qr-reader");
    }

    html5QrCode.start(
        { facingMode: "environment" }, // Forces rear camera
        { fps: 15, qrbox: { width: 250, height: 250 } },
        onScanSuccess,
        onScanFailure
    ).catch((err) => {
        window.stopCameraScanner();
        notify("CAMERA BLOCKED: Ensure site is using HTTPS!", "error");
        console.error("Camera Error:", err);
    });
};

window.stopCameraScanner = () => {
    if (html5QrCode && html5QrCode.isScanning) {
        html5QrCode.stop().then(() => {
            html5QrCode.clear();
        }).catch(err => console.log(err));
    }
    const camOverlay = document.getElementById('camera-overlay');
    if (camOverlay) camOverlay.style.display = 'none';
};

async function onScanSuccess(decodedText) {
    if (decodedText === expectedRetrievalToken) {
        window.stopCameraScanner();
        
        if ("vibrate" in navigator) navigator.vibrate([100, 50, 100, 50, 200]);

        const authPulse = document.createElement('div');
        authPulse.style = "position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(10, 15, 12, 0.98); z-index:99999; display:flex; align-items:center; justify-content:center; flex-direction:column; font-family:monospace;";
        authPulse.innerHTML = `
            <div style="font-size: 5rem; color: #39ff14; text-shadow: 0 0 40px rgba(57, 255, 20, 0.8); margin-bottom: 20px;">[ VALIDATED ]</div>
            <div style="font-size: 1.5rem; color: #a0e8af; animation: pulseVeridian 1s infinite;">Executing Hardware Command...</div>
        `;
        document.body.appendChild(authPulse);
        setTimeout(() => authPulse.remove(), 2500);
        
        // ESP32 HARDWARE TRIGGER: QR Validated Unlock
        await update(ref(db, `system_control/locker_${currentRetrievingLocker}`), {
             qr_validated: true 
        });

        await update(ref(db, `parcels/${currentActiveTxnId}`), {
            status: "COMPLETED"
        });

        notify("Solenoid Unlocked. Secure retrieval.", "success");

    } else {
        notify("Invalid Token Signature", "error");
    }
}
function onScanFailure(error) {}

// ==========================================
// 9. NAVIGATION & SYSTEM TOOLS
// ==========================================
window.showPane = (id) => {
    document.querySelectorAll(".pane").forEach(p => p.style.display = "none");
    const pane = document.getElementById(id);
    if(pane) pane.style.display = "block";
    document.querySelectorAll(".nav-item").forEach(n => n.classList.remove("active"));
};

window.toggleCourierHistory = () => {
    const el = document.getElementById('courier-history-card');
    if (el) el.style.display = (el.style.display === 'none') ? 'block' : 'none';
};

const devResetBtn = document.getElementById("devResetBtn");
if (devResetBtn) {
    devResetBtn.onclick = async () => {
        if(!confirm("⚠️ FACTORY RESET?")) return;
        toggleLoader(true, "FORMATTING CLOUD...");
        try {
            const safeLocker = { state: "AVAILABLE", workflow_phase: "PHASE_1_2_READY", transaction_status: "CLOSED", is_occupied: false, lock_command: "LOCKED", breach_alarm: false, active_token: "EMPTY", ready_to_scan: false, qr_validated: false, rejection_state: false, door_state: "CLOSED", weight_status: 0 };
            await set(ref(db, "system_control"), { locker_1: safeLocker, locker_2: safeLocker });
            await set(ref(db, "parcels"), { init_node: { status: "COMPLETED" } });
            location.reload();
        } catch (e) { toggleLoader(false); }
    };
}
