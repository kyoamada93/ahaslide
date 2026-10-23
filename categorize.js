'use strict';
// Rough Q&A topic for the MC: light/fun, OKR & direction, or the hard ones (pay, people, resources).
// Keyword scoring, so it works offline and instantly; the moderator/MC can override any question.
const CATEGORIES = {
  fun: { label: 'Vui vẻ', icon: '😄' },
  okr: { label: 'OKR & định hướng', icon: '🎯' },
  hard: { label: 'Lương & resource', icon: '🔥' },
};

const RULES = {
  fun: [/độc thân|(^|\s)ế($|[\s,.-])|người yêu|crush|hẹn hò|tương tác.*(nam|nữ)|bạn (nam|nữ)/, /vui|hài|giải trí|tiệc|party|team ?building|du lịch|\bquà\b|ăn uống|trà sữa|cà phê/,
    /máy in|macbook|laptop|bàn phím|màn hình rời|wifi|ubuntu|cài (đặt )?phần mềm|chỗ ngồi|gửi xe|pantry/],
  okr: [/\bokr\b|\bkpi\b|mục tiêu|top.?down/, /chiến lược|strategy|định hướng|tầm nhìn|vision|roadmap|lộ trình sản phẩm/,
    /vai trò|tái định vị|kỳ vọng|data.?driven|decision intelligence|a\/b test/, /infrastructure|hạ tầng dữ liệu|lakehouse|\bbq\b|bigquery|platform|kiến trúc/,
    /\bq[1-4]\b|mid.?year|năm 20\d\d|12 tháng tới/],
  hard: [/lương|thưởng|đãi ngộ|thu nhập|compensation|salary|bonus|benefit|phúc lợi|recognition/, /công bằng|fairness|đánh giá|evaluat|performance|contribution|ghi nhận/,
    /nghỉ việc|rời (khỏi|đi)|giữ chân|nhân tài|turnover|retention|domino/, /thăng tiến|promotion|career|lộ trình thăng/,
    /resource|nguồn lực|tài nguyên|thiếu người|thiếu (nhân sự|resource)|headcount|\bgpu\b|compute|tính toán/,
    /áp lực|workload|cường độ|quá tải|burn.?out|\bot\b|tăng ca/, /chi phí|hội nghị phí|tài trợ|ngân sách|budget/],
};

const memo = new Map();
function categorize(text) {
  const t = String(text || '').toLocaleLowerCase('vi').normalize('NFC');
  if (memo.has(t)) return memo.get(t);
  // Score = distinct keywords found, so "GPU … tài nguyên … nguồn lực" outweighs a passing "định hướng".
  const score = Object.fromEntries(Object.entries(RULES).map(([k, rs]) => [k, new Set(rs.flatMap((r) => t.match(new RegExp(r.source, 'g')) || [])).size]));
  // Ties go to the more sensitive topic so the MC is warned rather than surprised.
  const cat = ['hard', 'okr', 'fun'].reduce((best, k) => (score[k] > score[best] ? k : best), 'hard');
  const out = score[cat] ? cat : 'okr'; // nothing matched: a general question about direction
  if (memo.size > 5000) memo.clear();
  memo.set(t, out);
  return out;
}

module.exports = { CATEGORIES, categorize };
