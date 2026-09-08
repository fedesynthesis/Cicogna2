/* NIDO — scheduler notifiche push (gira su GitHub Actions)
 * 1) Vitamina D: ogni mattina alle 10:00 (ora italiana) se non ancora segnata oggi.
 * 2) Pesata: la domenica alle 10:00 se non ancora pesato/segnato.
 * Legge il documento condiviso di Nido (cicogna-57ae0) e manda push via FCM.
 * Token e stato invii stanno DENTRO lo stesso documento (le regole autorizzano solo quello).
 */
const admin = require('firebase-admin');

const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
if (!raw) { console.error('Manca il secret FIREBASE_SERVICE_ACCOUNT'); process.exit(1); }
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(raw)) });
const db = admin.firestore();
const fcm = admin.messaging();
const FieldPath = admin.firestore.FieldPath;

const COL = 'LL09Rb8OO0yjHQnJBsPCPSu1';
const DOC = 'YXZm9MNsAFCNNQiTgQnU7LEg';
const TZ = 'Europe/Rome';
const VITD_START = '2026-09-08';
const HOUR = 10;                 // 10:00 per entrambe
const APP_URL = 'https://fedesynthesis.github.io/Cicogna2/';

function romeNow(d = new Date()) {
  const f = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year:'numeric', month:'2-digit', day:'2-digit',
    hour:'2-digit', minute:'2-digit', hour12:false, weekday:'short' });
  const p = Object.fromEntries(f.formatToParts(d).map(x => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour), minute: Number(p.minute), weekday: p.weekday };
}
function romeDay(ms) {
  const f = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year:'numeric', month:'2-digit', day:'2-digit' });
  const p = Object.fromEntries(f.formatToParts(new Date(Number(ms))).map(x => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}`;
}

async function sendAll(tokens, title, body) {
  if (!tokens.length) return;
  const res = await fcm.sendEachForMulticast({
    tokens,
    notification: { title, body },
    webpush: { notification: { title, body, icon: '/Cicogna2/icon-192.png', badge: '/Cicogna2/icon-192.png' },
               fcmOptions: { link: APP_URL } }
  });
  const dead = [];
  res.responses.forEach((r, i) => {
    if (!r.success) {
      const c = (r.error && r.error.code) || '';
      if (c.includes('registration-token-not-registered') || c.includes('invalid-argument') || c.includes('mismatched-credential')) dead.push(tokens[i]);
    }
  });
  if (dead.length) {   // ripulisco i token non più validi
    const ref = db.collection(COL).doc(DOC);
    for (const t of dead) { try { await ref.update(new FieldPath('pushTokens', t), admin.firestore.FieldValue.delete()); } catch(_){} }
  }
  console.log('Inviati:', title, '→', res.successCount, '/', tokens.length);
}

(async () => {
  const ref = db.collection(COL).doc(DOC);
  const snap = await ref.get();
  const d = snap.data() || {};
  const tokens = Object.keys(d.pushTokens || {});
  if (!tokens.length) { console.log('Nessun token registrato — niente da fare.'); return; }

  const now = romeNow();
  const events = Array.isArray(d.events) ? d.events : [];
  const weights = Array.isArray(d.weights) ? d.weights : [];
  const weighDone = Array.isArray(d.weighDone) ? d.weighDone : [];
  const meta = d.nidoPush || {};   // { vitdLast, weighLast }

  // 1) VITAMINA D — ogni mattina dalle 10:00, se non ancora segnata oggi
  if (now.date >= VITD_START && now.hour >= HOUR && meta.vitdLast !== now.date) {
    const dataOggi = events.some(e => e && e.type === 'custom' && e.catId === 'vitd' && romeDay(e.at) === now.date);
    if (!dataOggi) {
      await sendAll(tokens, '💊 Vitamina D di Gabri', "Ricordati le 4 gocce di oggi. Segna 'Fatto' quando l'hai data.");
    } else {
      console.log('Vitamina D già data oggi.');
    }
    await ref.set({ nidoPush: { vitdLast: now.date } }, { merge: true });   // una volta al giorno comunque
  }

  // 2) PESATA — la domenica dalle 10:00, se non ancora pesato/segnato
  const isSunday = now.weekday === 'Sun';
  if (isSunday && now.hour >= HOUR && meta.weighLast !== now.date) {
    const pesatoOggi = weights.some(w => w && romeDay(w.at) === now.date);
    const segnato = weighDone.includes(now.date);
    if (!pesatoOggi && !segnato) {
      await sendAll(tokens, '⚖️ Pesata di Gabri', 'È domenica: ricordati di pesarlo.');
    } else {
      console.log('Pesata già fatta/segnata oggi.');
    }
    await ref.set({ nidoPush: { weighLast: now.date } }, { merge: true });
  }

  console.log('Fatto.', now.date, now.hour + ':' + now.minute, now.weekday);
})().catch(e => { console.error(e); process.exit(1); });
