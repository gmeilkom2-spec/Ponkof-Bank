import { initializeApp } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-app.js";
import {
  getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword,
  onAuthStateChanged, signOut
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";
import {
  getFirestore, doc, getDoc, setDoc, updateDoc, collection, query,
  orderBy, getDocs, addDoc, serverTimestamp, increment, where
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";

/* 1. Вставь сюда конфигурацию своего Firebase-проекта. */
const firebaseConfig = {
  apiKey: "AIzaSyCqAJr5gUwWbcMmzDoFhknqrnjqK4UDcTc",
  authDomain: "ponkofbank.firebaseapp.com",
  projectId: "ponkofbank",
  storageBucket: "ponkofbank.firebasestorage.app",
  messagingSenderId: "980025588057",
  appId: "1:980025588057:web:6d6e1929542142979cf448",
  measurementId: "G-0DB4TG8VSL"
};

/* 2. Здесь укажи email администратора. Тот же email нужно указать в firestore.rules. */
const ADMIN_EMAIL = "gmeilkom2@gmail.com";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

let mode = "login";
const $ = (id) => document.getElementById(id);

document.querySelectorAll(".tab").forEach(btn => {
  btn.addEventListener("click", () => {
    mode = btn.dataset.mode;
    document.querySelectorAll(".tab").forEach(x => x.classList.toggle("active", x === btn));
    $("nameField").classList.toggle("hidden", mode !== "register");
    $("authSubmit").textContent = mode === "login" ? "Войти" : "Создать аккаунт";
    $("authMessage").textContent = "";
  });
});

$("authForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = $("email").value.trim();
  const password = $("password").value;
  const name = $("name").value.trim() || "Клиент";
  $("authMessage").textContent = "Загрузка…";

  try {
    if (mode === "register") {
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      await setDoc(doc(db, "users", cred.user.uid), {
        uid: cred.user.uid, email, name, balance: 0, status: "Стандарт",
        card: null, createdAt: serverTimestamp()
      });
    } else {
      await signInWithEmailAndPassword(auth, email, password);
    }
  } catch (err) {
    $("authMessage").textContent = humanError(err);
  }
});

$("logoutBtn").addEventListener("click", () => signOut(auth));

$("openCardBtn").addEventListener("click", async () => {
  const user = auth.currentUser;
  if (!user) return;
  const ref = doc(db, "users", user.uid);
  const snap = await getDoc(ref);
  if (snap.exists() && snap.data().card) {
    renderCard(snap.data().card);
    return;
  }
  const card = createCard();
  await updateDoc(ref, { card });
  renderCard(card);
});

$("creditForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = $("creditEmail").value.trim().toLowerCase();
  const amount = Number($("creditAmount").value);
  const reason = $("creditReason").value.trim() || "Начисление";
  const msg = $("creditMessage");

  if (!amount || amount <= 0) { msg.textContent = "Введите положительную сумму."; return; }

  try {
    const q = query(collection(db, "users"), where("email", "==", email));
    const result = await getDocs(q);
    if (result.empty) { msg.textContent = "Клиент с таким email не найден."; return; }

    const client = result.docs[0];
    await updateDoc(client.ref, { balance: increment(amount) });
    await addDoc(collection(db, "users", client.id, "transactions"), {
      type: "credit", amount, reason, adminEmail: auth.currentUser.email,
      createdAt: serverTimestamp()
    });
    msg.textContent = `Начислено ${amount.toLocaleString("ru-RU")} ₸.`;
    e.target.reset();
  } catch (err) {
    msg.textContent = humanError(err);
  }
});

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    $("authView").classList.remove("hidden");
    $("appView").classList.add("hidden");
    $("userArea").classList.add("hidden");
    return;
  }

  $("authView").classList.add("hidden");
  $("appView").classList.remove("hidden");
  $("userArea").classList.remove("hidden");
  $("userEmail").textContent = user.email;

  const snap = await getDoc(doc(db, "users", user.uid));
  if (snap.exists()) {
    const data = snap.data();
    $("displayName").textContent = data.name || "клиент";
    $("balance").textContent = Number(data.balance || 0).toLocaleString("ru-RU", {minimumFractionDigits:2});
    $("status").textContent = data.status || "Стандарт";
    if (data.card) renderCard(data.card);
    await loadTransactions(user.uid);
  }

  if (user.email.toLowerCase() === ADMIN_EMAIL.toLowerCase()) {
    $("adminSection").classList.remove("hidden");
  }
});

function createCard() {
  const digits = Array.from({length: 16}, () => Math.floor(Math.random() * 10));
  const number = digits.join("");
  const now = new Date();
  const expiry = String((now.getMonth() + 1)).padStart(2,"0") + "/" + String((now.getFullYear()+4)).slice(-2);
  const cvv = String(Math.floor(100 + Math.random() * 900));
  return { number, expiry, cvv, holder: (auth.currentUser.email || "CLIENT").split("@")[0].slice(0,18).toUpperCase() };
}

function renderCard(card) {
  $("cardSection").classList.remove("hidden");
  $("cardNumber").textContent = card.number.replace(/(.{4})/g, "$1 ").trim();
  $("cardExpiry").textContent = card.expiry;
  $("cardCvv").textContent = card.cvv;
  $("cardHolder").textContent = card.holder;
  $("openCardBtn").textContent = "Карта открыта";
}

async function loadTransactions(uid) {
  const box = $("transactions");
  const q = query(collection(db, "users", uid, "transactions"), orderBy("createdAt", "desc"));
  const snap = await getDocs(q);
  if (snap.empty) { box.innerHTML = '<p class="muted">Операций пока нет.</p>'; return; }
  box.innerHTML = "";
  snap.forEach(d => {
    const x = d.data();
    const date = x.createdAt?.toDate ? x.createdAt.toDate().toLocaleString("ru-RU") : "только что";
    box.insertAdjacentHTML("beforeend",
      `<div class="tx"><div><div class="tx-title">${escapeHtml(x.reason || "Операция")}</div><div class="tx-date">${date}</div></div><div class="tx-amount">+${Number(x.amount || 0).toLocaleString("ru-RU")} ₸</div></div>`
    );
  });
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
}

function humanError(err) {
  const map = {
    "auth/email-already-in-use":"Этот email уже зарегистрирован.",
    "auth/invalid-credential":"Неверный email или пароль.",
    "auth/weak-password":"Пароль слишком простой.",
    "auth/invalid-email":"Некорректный email.",
    "permission-denied":"Нет прав для этой операции."
  };
  return map[err.code] || err.message || "Произошла ошибка.";
}
