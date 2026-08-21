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
let creditUnsub = null;

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

const transferForm = document.getElementById('transferForm');
const transferCardNumber = document.getElementById('transferCardNumber');
const transferAmount = document.getElementById('transferAmount');
const transferSubmitBtn = document.getElementById('transferSubmitBtn');
const transferMessage = document.getElementById('transferMessage');

const creditRequestForm = document.getElementById('creditRequestForm');
const reqCreditAmount = document.getElementById('reqCreditAmount');
const reqCreditTerm = document.getElementById('reqCreditTerm');
const calcMonthly = document.getElementById('calcMonthly');
const creditReqMessage = document.getElementById('creditReqMessage');
const activeCreditCard = document.getElementById('activeCreditCard');
const creditDebtEl = document.getElementById('creditDebt');
const creditMonthlyPaymentEl = document.getElementById('creditMonthlyPayment');
const payCreditBtn = document.getElementById('payCreditBtn');
const creditPayMessage = document.getElementById('creditPayMessage');

const cardSection = document.getElementById('cardSection');
const cardNumberEl = document.getElementById('cardNumber');
const cardExpiryEl = document.getElementById('cardExpiry');
const cardCvvEl = document.getElementById('cardCvv');
const cardHolderEl = document.getElementById('cardHolder');

const infoCardNumberEl = document.getElementById('infoCardNumber');
const infoCardHolderEl = document.getElementById('infoCardHolder');
const infoCardExpiryEl = document.getElementById('infoCardExpiry');
const infoCardCvvEl = document.getElementById('infoCardCvv');
const copyCardBtn = document.getElementById('copyCardBtn');

const transactionsEl = document.getElementById('transactions');
const adminSection = document.getElementById('adminSection');
const creditForm = document.getElementById('creditForm');
const creditActionSelect = document.getElementById('creditAction');
const creditMessage = document.getElementById('creditMessage');

// Проверка алгоритмом Луна
function validateLuhn(cardNumber) {
  const digits = cardNumber.replace(/\D/g, '');
  if (digits.length < 13 || digits.length > 19) return false;
  let sum = 0;
  let shouldDouble = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let digit = parseInt(digits.charAt(i), 10);
    if (shouldDouble) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    shouldDouble = !shouldDouble;
  }
  return sum % 10 === 0;
}

// Форматирование ввода карты
transferCardNumber?.addEventListener('input', (e) => {
  let val = e.target.value.replace(/\D/g, '');
  val = val.match(/.{1,4}/g)?.join(' ') || val;
  e.target.value = val.substring(0, 19);
});

// Перевод по номеру карты
transferForm?.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!currentUser) return;

  transferMessage.textContent = 'Обработка перевода...';
  transferMessage.className = 'message muted';
  transferSubmitBtn.disabled = true;

  const targetCardNum = transferCardNumber.value.trim();
  const amount = parseFloat(transferAmount.value);

  if (!validateLuhn(targetCardNum)) {
    transferMessage.textContent = 'Некорректный номер карты.';
    transferMessage.className = 'message error';
    transferSubmitBtn.disabled = false;
    return;
  }

  if (isNaN(amount) || amount <= 0) {
    transferMessage.textContent = 'Укажите корректную сумму.';
    transferMessage.className = 'message error';
    transferSubmitBtn.disabled = false;
    return;
  }

  try {
    const cardsQuery = query(collection(db, 'cards'), where('cardNumber', '==', targetCardNum));
    const cardSnap = await getDocs(cardsQuery);

    if (cardSnap.empty) {
      throw new Error('Карта получателя не найдена.');
    }

    const recipientCardData = cardSnap.docs[0].data();
    const recipientUid = recipientCardData.uid;

    if (recipientUid === currentUser.uid) {
      throw new Error('Нельзя перевести деньги на свою же карту.');
    }

    await runTransaction(db, async (transaction) => {
      const senderRef = doc(db, 'users', currentUser.uid);
      const recipientRef = doc(db, 'users', recipientUid);

      const senderSnap = await transaction.get(senderRef);
      const recipientSnap = await transaction.get(recipientRef);

      if (!senderSnap.exists() || !recipientSnap.exists()) {
        throw new Error('Ошибка взаимодействия с аккаунтами.');
      }

      const senderBalance = senderSnap.data().balance || 0;
      if (senderBalance < amount) {
        throw new Error('Недостаточно средств на балансе.');
      }

      const recipientBalance = recipientSnap.data().balance || 0;

      // Списание у отправителя
      transaction.update(senderRef, { balance: senderBalance - amount });
      // Зачисление получателю
      transaction.update(recipientRef, { balance: recipientBalance + amount });

      // Запись транзакции отправителю
      const senderTxRef = doc(collection(db, `users/${currentUser.uid}/transactions`));
      transaction.set(senderTxRef, {
        title: `Перевод на карту ${targetCardNum.slice(-4)}`,
        amount: -amount,
        createdAt: serverTimestamp()
      });

      // Запись транзакции получателю
      const recipientTxRef = doc(collection(db, `users/${recipientUid}/transactions`));
      transaction.set(recipientTxRef, {
        title: `Перевод с карты`,
        amount: amount,
        createdAt: serverTimestamp()
      });
    });

    transferMessage.textContent = 'Перевод успешно выполнен!';
    transferMessage.className = 'message success';
    transferForm.reset();

  } catch (err) {
    transferMessage.textContent = err.message || 'Ошибка выполнения перевода.';
    transferMessage.className = 'message error';
  } finally {
    transferSubmitBtn.disabled = false;
  }
});

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

logoutBtn?.addEventListener('click', () => {
  signOut(auth);
});

onAuthStateChanged(auth, (user) => {
  currentUser = user;

  if (userUnsub) userUnsub();
  if (txUnsub) txUnsub();
  if (creditUnsub) creditUnsub();

  if (user) {
    authView.classList.add('hidden');
    appView.classList.remove('hidden');
    userArea.classList.remove('hidden');
    userEmailEl.textContent = user.email;

    listenUserData(user.uid);
    listenUserCard(user.uid);
    listenTransactions(user.uid);
    listenUserCredit(user.uid);
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

function calculateMonthlyPayment(amount, months) {
  const annualRate = 0.12;
  const monthlyRate = annualRate / 12;
  return (amount * monthlyRate * Math.pow(1 + monthlyRate, months)) / (Math.pow(1 + monthlyRate, months) - 1);
}

function updateCreditCalc() {
  const amount = parseFloat(reqCreditAmount.value) || 0;
  const months = parseInt(reqCreditTerm.value) || 6;
  if (amount > 0) {
    const monthly = calculateMonthlyPayment(amount, months);
    calcMonthly.textContent = monthly.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  } else {
    calcMonthly.textContent = '0.00';
  }
}

reqCreditAmount?.addEventListener('input', updateCreditCalc);
reqCreditTerm?.addEventListener('change', updateCreditCalc);
updateCreditCalc();

creditRequestForm?.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!currentUser) return;

  creditReqMessage.textContent = 'Оформление кредита...';
  creditReqMessage.className = 'message muted';

  const amount = parseFloat(reqCreditAmount.value);
  const months = parseInt(reqCreditTerm.value);
  const monthlyPayment = calculateMonthlyPayment(amount, months);
  const totalDebt = monthlyPayment * months;

  try {
    await runTransaction(db, async (transaction) => {
      const userRef = doc(db, 'users', currentUser.uid);
      const creditRef = doc(db, 'credits', currentUser.uid);

      const userSnap = await transaction.get(userRef);
      if (!userSnap.exists()) throw new Error("Профиль пользователя не найден.");

      const creditSnap = await transaction.get(creditRef);
      if (creditSnap.exists() && creditSnap.data().debt > 0) {
        throw new Error("У вас уже есть активный кредит.");
      }

      const currentBalance = userSnap.data().balance || 0;

      transaction.update(userRef, { balance: currentBalance + amount });
      transaction.set(creditRef, {
        uid: currentUser.uid,
        amountGranted: amount,
        debt: totalDebt,
        monthlyPayment: monthlyPayment,
        termMonths: months,
        createdAt: serverTimestamp()
      });

      const txRef = doc(collection(db, `users/${currentUser.uid}/transactions`));
      transaction.set(txRef, {
        title: 'Зачисление кредита',
        amount: amount,
        createdAt: serverTimestamp()
      });
    });

    creditReqMessage.textContent = 'Кредит успешно зачислен!';
    creditReqMessage.className = 'message success';
  } catch (err) {
    creditReqMessage.textContent = err.message;
    creditReqMessage.className = 'message error';
  }
});

function listenUserCredit(uid) {
  creditUnsub = onSnapshot(doc(db, 'credits', uid), (docSnap) => {
    if (docSnap.exists() && docSnap.data().debt > 0.01) {
      const data = docSnap.data();
      creditDebtEl.textContent = data.debt.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      creditMonthlyPaymentEl.textContent = data.monthlyPayment.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

      activeCreditCard.classList.remove('hidden');
      creditRequestForm.classList.add('hidden');
    } else {
      activeCreditCard.classList.add('hidden');
      creditRequestForm.classList.remove('hidden');
    }
  });
}

payCreditBtn?.addEventListener('click', async () => {
  if (!currentUser) return;

  creditPayMessage.textContent = 'Обработка платежа...';
  creditPayMessage.className = 'message muted';

  try {
    await runTransaction(db, async (transaction) => {
      const userRef = doc(db, 'users', currentUser.uid);
      const creditRef = doc(db, 'credits', currentUser.uid);

      const userSnap = await transaction.get(userRef);
      const creditSnap = await transaction.get(creditRef);

      if (!userSnap.exists() || !creditSnap.exists()) {
        throw new Error("Ошибка доступа к данным.");
      }

      const currentBalance = userSnap.data().balance || 0;
      const currentDebt = creditSnap.data().debt || 0;
      const monthlyPayment = creditSnap.data().monthlyPayment || 0;

      const payAmount = Math.min(monthlyPayment, currentDebt);

      if (currentBalance < payAmount) {
        throw new Error(`Недостаточно средств для платежа (${payAmount.toFixed(2)} ₸).`);
      }

      const newBalance = currentBalance - payAmount;
      const newDebt = Math.max(0, currentDebt - payAmount);

      transaction.update(userRef, { balance: newBalance });
      transaction.update(creditRef, { debt: newDebt });

      const txRef = doc(collection(db, `users/${currentUser.uid}/transactions`));
      transaction.set(txRef, {
        title: 'Погашение кредита',
        amount: -payAmount,
        createdAt: serverTimestamp()
      });
    });

    creditPayMessage.textContent = 'Оплата прошла успешно!';
    creditPayMessage.className = 'message success';
  } catch (err) {
    creditPayMessage.textContent = err.message;
    creditPayMessage.className = 'message error';
  }
});

// Генерирует валидный по алгоритму Луна номер карты (начинается на 4400)
function generateLuhnCardNumber() {
  const prefix = [4, 4, 0, 0];
  const randomDigits = Array.from({ length: 11 }, () => Math.floor(Math.random() * 10));
  const full15 = [...prefix, ...randomDigits];

  let sum = 0;
  for (let i = 0; i < full15.length; i++) {
    let digit = full15[i];
    if (i % 2 === 0) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
  }

  const checkDigit = (10 - (sum % 10)) % 10;
  const rawNumber = [...full15, checkDigit].join('');
  return rawNumber.match(/.{1,4}/g).join(' ');
}

openCardBtn?.addEventListener('click', async () => {
  if (!currentUser) return;
  openCardBtn.disabled = true;

  try {
    const cardRef = doc(db, 'cards', currentUser.uid);
    const cardSnap = await getDoc(cardRef);

    if (!cardSnap.exists()) {
      const validCardNumber = generateLuhnCardNumber();
      const randomCvv = Math.floor(100 + Math.random() * 900).toString();

      await setDoc(cardRef, {
        uid: currentUser.uid,
        cardNumber: validCardNumber,
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

      if (infoCardNumberEl) infoCardNumberEl.textContent = data.cardNumber;
      if (infoCardHolderEl) infoCardHolderEl.textContent = data.holder;
      if (infoCardExpiryEl) infoCardExpiryEl.textContent = data.expiry;
      if (infoCardCvvEl) infoCardCvvEl.textContent = data.cvv;

      cardSection.classList.remove('hidden');
      openCardBtn.classList.add('hidden');
    } else {
      cardSection.classList.add('hidden');
      openCardBtn.classList.remove('hidden');
    }
  });
}

copyCardBtn?.addEventListener('click', () => {
  const num = infoCardNumberEl ? infoCardNumberEl.textContent : '';
  if (num) {
    navigator.clipboard.writeText(num).then(() => {
      alert('Номер карты скопирован!');
    }).catch(() => {
      alert('Не удалось скопировать.');
    });
  }
});

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

creditForm?.addEventListener('submit', async (e) => {
  e.preventDefault();
  creditMessage.textContent = 'Обработка...';
  creditMessage.className = 'message muted';

  const action = creditActionSelect.value;
  const email = document.getElementById('creditEmail').value.trim();
  const rawAmount = parseFloat(document.getElementById('creditAmount').value);
  const defaultReason = action === 'add' ? 'Пополнение баланса' : 'Списание средств';
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
        throw new Error('Профиль пользователя отсутствует.');
      }

      const currentBalance = targetSnap.data().balance || 0;
      let newBalance = currentBalance;
      let changeAmount = rawAmount;

      if (action === 'sub') {
        if (currentBalance < rawAmount) {
          throw new Error(`Недостаточно средств. Текущий баланс: ${currentBalance} ₸`);
        }
        newBalance = currentBalance - rawAmount;
        changeAmount = -rawAmount;
      } else {
        newBalance = currentBalance + rawAmount;
      }

      transaction.update(targetUserRef, { balance: newBalance });

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
    creditMessage.textContent = err.message || 'Ошибка исполнения.';
    creditMessage.className = 'message error';
  }
});
