import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { 
  getAuth, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signOut, 
  onAuthStateChanged 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { 
  getFirestore, 
  doc, 
  getDoc, 
  setDoc, 
  collection, 
  query, 
  where, 
  getDocs, 
  onSnapshot, 
  orderBy, 
  runTransaction, 
  serverTimestamp 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyCqAJr5gUwWbcMmzDoFhknqrnjqK4UDcTc",
  authDomain: "ponkofbank.firebaseapp.com",
  projectId: "ponkofbank",
  storageBucket: "ponkofbank.firebasestorage.app",
  messagingSenderId: "980025588057",
  appId: "1:980025588057:web:6d6e1929542142979cf448",
  measurementId: "G-0DB4TG8VSL"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

let currentUser = null;
let currentAuthMode = 'login';
let userUnsub = null;
let txUnsub = null;

// DOM элементы
const authView = document.getElementById('authView');
const appView = document.getElementById('appView');
const userArea = document.getElementById('userArea');
const userEmailEl = document.getElementById('userEmail');
const authForm = document.getElementById('authForm');
const authSubmit = document.getElementById('authSubmit');
const authMessage = document.getElementById('authMessage');
const nameField = document.getElementById('nameField');
const tabs = document.querySelectorAll('.tab');
const logoutBtn = document.getElementById('logoutBtn');

const displayNameEl = document.getElementById('displayName');
const balanceEl = document.getElementById('balance');
const statusEl = document.getElementById('status');
const openCardBtn = document.getElementById('openCardBtn');

const cardSection = document.getElementById('cardSection');
const cardNumberEl = document.getElementById('cardNumber');
const cardExpiryEl = document.getElementById('cardExpiry');
const cardCvvEl = document.getElementById('cardCvv');
const cardHolderEl = document.getElementById('cardHolder');

const transactionsEl = document.getElementById('transactions');
const adminSection = document.getElementById('adminSection');
const creditForm = document.getElementById('creditForm');
const creditActionSelect = document.getElementById('creditAction');
const creditMessage = document.getElementById('creditMessage');

// Переключение Вход / Регистрация
tabs.forEach(tab => {
  tab.addEventListener('click', () => {
    tabs.forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    currentAuthMode = tab.dataset.mode;
    authMessage.textContent = '';
    
    if (currentAuthMode === 'register') {
      nameField.classList.remove('hidden');
      authSubmit.textContent = 'Зарегистрироваться';
    } else {
      nameField.classList.add('hidden');
      authSubmit.textContent = 'Войти';
    }
  });
});

// Авторизация
authForm?.addEventListener('submit', async (e) => {
  e.preventDefault();
  authMessage.textContent = 'Загрузка...';
  authMessage.className = 'message muted';

  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;
  const name = document.getElementById('name').value.trim();

  try {
    if (currentAuthMode === 'register') {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      await setDoc(doc(db, 'users', user.uid), {
        email: email,
        name: name || 'Клиент',
        balance: 0,
        status: 'Стандарт',
        isAdmin: false,
        createdAt: serverTimestamp()
      });
    } else {
      await signInWithEmailAndPassword(auth, email, password);
    }
  } catch (err) {
    authMessage.textContent = err.message;
    authMessage.className = 'message error';
  }
});

// Выход
logoutBtn?.addEventListener('click', () => {
  signOut(auth);
});

// Слушатель авторизации
onAuthStateChanged(auth, (user) => {
  currentUser = user;

  if (userUnsub) userUnsub();
  if (txUnsub) txUnsub();

  if (user) {
    authView.classList.add('hidden');
    appView.classList.remove('hidden');
    userArea.classList.remove('hidden');
    userEmailEl.textContent = user.email;

    listenUserData(user.uid);
    listenUserCard(user.uid);
    listenTransactions(user.uid);
  } else {
    authView.classList.remove('hidden');
    appView.classList.add('hidden');
    userArea.classList.add('hidden');
  }
});

function listenUserData(uid) {
  userUnsub = onSnapshot(doc(db, 'users', uid), (docSnap) => {
    if (docSnap.exists()) {
      const data = docSnap.data();
      displayNameEl.textContent = data.name || 'Клиент';
      balanceEl.textContent = (data.balance || 0).toLocaleString('ru-RU', { minimumFractionDigits: 2 });
      statusEl.textContent = data.status || 'Стандарт';

      if (data.isAdmin) {
        adminSection.classList.remove('hidden');
      } else {
        adminSection.classList.add('hidden');
      }
    }
  });
}

// Выпуск карты
openCardBtn?.addEventListener('click', async () => {
  if (!currentUser) return;
  openCardBtn.disabled = true;

  try {
    const cardRef = doc(db, 'cards', currentUser.uid);
    const cardSnap = await getDoc(cardRef);

    if (!cardSnap.exists()) {
      const randomCardNumber = '4400 ' + Array.from({length: 3}, () => Math.floor(1000 + Math.random() * 9000)).join(' ');
      const randomCvv = Math.floor(100 + Math.random() * 900).toString();

      await setDoc(cardRef, {
        uid: currentUser.uid,
        cardNumber: randomCardNumber,
        expiry: '12/28',
        cvv: randomCvv,
        holder: (displayNameEl.textContent || 'КЛИЕНТ').toUpperCase(),
        createdAt: serverTimestamp()
      });
    }
  } catch (err) {
    alert('Ошибка создания карты: ' + err.message);
  } finally {
    openCardBtn.disabled = false;
  }
});

function listenUserCard(uid) {
  onSnapshot(doc(db, 'cards', uid), (docSnap) => {
    if (docSnap.exists()) {
      const data = docSnap.data();
      cardNumberEl.textContent = data.cardNumber;
      cardExpiryEl.textContent = data.expiry;
      cardCvvEl.textContent = data.cvv;
      cardHolderEl.textContent = data.holder;
      cardSection.classList.remove('hidden');
      openCardBtn.classList.add('hidden');
    } else {
      cardSection.classList.add('hidden');
      openCardBtn.classList.remove('hidden');
    }
  });
}

// Загрузка транзакций
function listenTransactions(uid) {
  const q = query(
    collection(db, `users/${uid}/transactions`), 
    orderBy('createdAt', 'desc')
  );

  txUnsub = onSnapshot(q, (snapshot) => {
    if (snapshot.empty) {
      transactionsEl.innerHTML = '<p class="muted">Операций пока нет.</p>';
      return;
    }

    transactionsEl.innerHTML = '';
    snapshot.forEach((docSnap) => {
      const tx = docSnap.data();
      const isNegative = tx.amount < 0;
      const amountFormatted = (isNegative ? '' : '+') + tx.amount.toLocaleString('ru-RU', { minimumFractionDigits: 2 }) + ' ₸';
      const dateFormatted = tx.createdAt ? new Date(tx.createdAt.toDate()).toLocaleString('ru-RU') : 'Только что';

      const item = document.createElement('div');
      item.className = 'tx';
      item.innerHTML = `
        <div>
          <div class="tx-title">${tx.title}</div>
          <div class="tx-date">${dateFormatted}</div>
        </div>
        <div class="tx-amount ${isNegative ? 'negative' : ''}">${amountFormatted}</div>
      `;
      transactionsEl.appendChild(item);
    });
  });
}

// АДМИН-ПАНЕЛЬ: Начисление / Списание средств
creditForm?.addEventListener('submit', async (e) => {
  e.preventDefault();
  creditMessage.textContent = 'Обработка...';
  creditMessage.className = 'message muted';

  const action = creditActionSelect.value; // 'add' или 'sub'
  const email = document.getElementById('creditEmail').value.trim();
  const rawAmount = parseFloat(document.getElementById('creditAmount').value);
  const defaultReason = action === 'add' ? 'Пополнение баланса' : 'Списание баланса';
  const reason = document.getElementById('creditReason').value.trim() || defaultReason;

  if (isNaN(rawAmount) || rawAmount <= 0) {
    creditMessage.textContent = 'Введите корректную сумму.';
    creditMessage.className = 'message error';
    return;
  }

  try {
    const usersQuery = query(collection(db, 'users'), where('email', '==', email));
    const querySnapshot = await getDocs(usersQuery);

    if (querySnapshot.empty) {
      creditMessage.textContent = 'Пользователь не найден.';
      creditMessage.className = 'message error';
      return;
    }

    const userDoc = querySnapshot.docs[0];
    const targetUid = userDoc.id;

    await runTransaction(db, async (transaction) => {
      const targetUserRef = doc(db, 'users', targetUid);
      const targetSnap = await transaction.get(targetUserRef);

      if (!targetSnap.exists()) {
        throw new Error('Профиль пользователя не существует.');
      }

      const currentBalance = targetSnap.data().balance || 0;
      let newBalance = currentBalance;
      let changeAmount = rawAmount;

      if (action === 'sub') {
        if (currentBalance < rawAmount) {
          throw new Error(`Недостаточно средств. Текущий баланс: ${currentBalance} ₸`);
        }
        newBalance = currentBalance - rawAmount;
        changeAmount = -rawAmount; // Отрицательная сумма в историю
      } else {
        newBalance = currentBalance + rawAmount;
      }

      // Обновляем баланс
      transaction.update(targetUserRef, { balance: newBalance });

      // Записываем историю транзакции
      const txRef = doc(collection(db, `users/${targetUid}/transactions`));
      transaction.set(txRef, {
        title: reason,
        amount: changeAmount,
        createdAt: serverTimestamp()
      });
    });

    creditMessage.textContent = action === 'add' ? 'Средства начислены!' : 'Средства списаны!';
    creditMessage.className = 'message success';
    creditForm.reset();
  } catch (err) {
    creditMessage.textContent = err.message || 'Ошибка выполнения.';
    creditMessage.className = 'message error';
  }
});
