// Rehearsal bots: N fake audience members that check in, send keywords, vote, ask questions and race.
// Usage: node scripts/simulate.js [url] [count]      e.g. node scripts/simulate.js http://localhost:3000 40
const { io } = require('socket.io-client');

const URL = process.argv[2] || 'http://localhost:3000';
const N = Number(process.argv[3]) || 30;
const NAMES = ['Minh', 'Lan', 'Huy', 'Trang', 'Tuấn', 'Ngọc', 'Phúc', 'Vy', 'Khoa', 'Thảo', 'Duy', 'Hà', 'Quân', 'My', 'Long', 'Anh', 'Bảo', 'Chi', 'Đạt', 'Hương'];
const WORDS = ['GenAI', 'Agentic AI', 'LLM', 'Networking', 'Roadmap', 'Data Platform', 'Fraud', 'Recsys', 'Học hỏi', 'Kết nối', 'MLOps', 'Foundation Model', 'Vui', 'Quà', 'Career path', 'GenAI', 'LLM', 'Agentic AI'];
const QUESTIONS = ['Roadmap AI của MoMo năm tới là gì?', 'Team mình đang tuyển thêm vị trí nào?', 'Làm sao để đưa model lên production nhanh hơn?', 'Chị chia sẻ thêm về cách đo impact của data project?', 'Anh nghĩ agentic AI sẽ thay đổi cách làm việc thế nào?'];
const pick = (a) => a[Math.floor(Math.random() * a.length)];

for (let i = 0; i < N; i++) {
  setTimeout(() => {
    const s = io(URL, { transports: ['websocket'] });
    const me = { done: new Set(), tapper: null, skill: 3 + Math.random() * 8 };
    s.on('connect', () => s.emit('checkin', { name: `${pick(NAMES)} ${i + 1}`, team: pick(['Data Platform', 'AI Lab', 'Risk', 'Growth']) }, () => {}));
    s.on('me', (m) => { me.duck = m.duck; });
    s.on('state', (st) => {
      const sl = st.slide;
      const once = (k, fn) => { if (!me.done.has(k)) { me.done.add(k); setTimeout(fn, 300 + Math.random() * 4000); } };
      if (sl.type === 'wordcloud') once('w', () => { s.emit('word:add', { slideId: sl.id, word: pick(WORDS) }, () => {}); setTimeout(() => s.emit('word:add', { slideId: sl.id, word: pick(WORDS) }, () => {}), 1500); });
      if (sl.type === 'poll') once('p', () => s.emit('poll:vote', { slideId: sl.id, option: Math.random() < 0.4 ? 2 : Math.floor(Math.random() * sl.options.length) }, () => {}));
      if (sl.type === 'qa' || sl.type === 'speaker') {
        if (Math.random() < 0.15) once('q' + sl.id, () => s.emit('qa:ask', { text: pick(QUESTIONS), target: sl.speaker || 'Chung' }, () => {}));
        (st.questions || []).forEach((q) => { if (Math.random() < 0.3) once('u' + q.id, () => s.emit('qa:upvote', q.id, () => {})); });
      }
      if (sl.type === 'race') {
        if (st.race.phase === 'lobby' && !me.duck && !me.joining) {
          me.joining = true;
          setTimeout(() => s.emit('race:join', () => { me.joining = false; }), 300 + Math.random() * 3000);
        }
        // like the real phone: taps batched every 250ms
        if (st.race.phase === 'racing' && !me.tapper) me.tapper = setInterval(() => s.emit('race:tap', Math.round(me.skill * 0.25 + Math.random() - 0.5)), 250);
        if (st.race.phase !== 'racing' && me.tapper) { clearInterval(me.tapper); me.tapper = null; }
      }
      if (sl.type === 'feedback') once('f', () => s.emit('feedback:submit', { overall: 4 + (Math.random() < 0.6 ? 1 : 0), content: 4, organization: 5, suggestion: 'Thêm demo thực tế' }, () => {}));
    });
  }, i * 60);
}
console.log(`Spawning ${N} bots against ${URL}`);
