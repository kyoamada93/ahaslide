// Topic groups for the MC: checked against real Townhall questions (Google Form, Oct 2026).
const assert = require('assert');
const { categorize } = require('../categorize');
const cases = [
  ['hard', 'Công ty có chính sách hỗ trợ hội nghị phí và chi phí đi lại, lưu trú trong trường hợp member của AI & BigData có paper được accepted tại các hội nghị khoa học không?'],
  ['okr', 'KPI năm 2026 của AI&Data là gì và KPI đó tới Mid year là đã đạt chưa ? Cần làm gì ở Q4 để đạt. Em thấy cách đặt mục tiêu như hiện tại khá phân mảnh ko giống theo framework OKR'],
  ['okr', 'Khi các công cụ GenAI và Self-serve BI ngày càng giúp các team Product/Business tự truy xuất dữ liệu, anh chị kỳ vọng đội ngũ Data & Analytics sẽ tái định vị vai trò như thế nào trong 12 tháng tới? Chúng ta sẽ chuyển dịch cơ cấu nguồn lực ra sao để đóng vai trò dẫn dắt quyết định chiến lược (Decision Intelligence)?'],
  ['okr', 'Một tổ chức thực sự Data-driven là nơi dữ liệu có thể bác bỏ ý kiến chủ quan của lãnh đạo. Anh chị kỳ vọng các cấp quản lý sẽ hành xử thế nào khi kết quả A/B Testing đi ngược lại kỳ vọng?'],
  ['okr', "What's your vision about centralized data infrastructure? The move from BQ to other lakehouses is happening"],
  ['fun', 'Team đông nhưng tình trạng ế- độc thân khá nhiều, làm sao để các bạn nam có nhiều cơ hội tương tác thêm với các ban nữ để tăng sự hòa đồng không ạ'],
  ['hard', 'Anh chị cho hỏi là làm sao để bảo đảm fairness trong team, công bằng lương thưởng giữa các vị trí với nhau?'],
  ['fun', 'Cài phần mềm sử dụng máy in cho lap dùng Ubuntu'],
  ['hard', 'How are individual contributions and business impact evaluated when several people contribute to the same project?'],
  ['fun', 'Dạ có hay không khả năng được cấp macbook (ko cần quá xịn) cũng được ạ.'],
  ['hard', 'Trong thời gian gần đây, nhiều nhân sự có kinh nghiệm đã rời khỏi tổ chức. Những hành động cụ thể nào đang được triển khai để giữ chân nhân tài?'],
  ['hard', 'Em thấy mức lương của team ITC thấp hơn thị trường rất nhiều mà làm việc thì nhiều workload hơn hẳn.'],
  ['hard', 'For employees who have been with the company for many years, are there any plans to introduce long-term benefits or recognition programs beyond the usual annual compensation and performance bonuses?'],
  ['hard', 'Một số team phải làm việc với cường độ công việc nhiều và mức độ áp lực cao, anh chị có quan sát thấy cùng điều đó không?'],
  ['hard', 'Có quan điểm là hiện tại các vị trí chủ chốt đã không còn available, cơ hội thăng tiến cho người trẻ trở nên khó khăn hơn.'],
  ['hard', 'Một vài team đang phải làm việc với tình trạng thiếu resource trầm trọng. Anh chị đã có solution short term cũng như long term như thế nào rồi ạ?'],
  ['hard', 'Người cũ nghỉ việc, việc của người cũ dồn lại cho người ở lại, tạo nên hiệu ứng domino khá nặng nề.'],
  ['hard', 'Hiện tại, công ty đang có định hướng đẩy mạnh AI innovation. Tuy nhiên tài nguyên GPU còn hạn chế. Công ty đã có chiến lược dài hạn để mở rộng GPU infrastructure, cũng như giải pháp ngắn hạn để đảm bảo nguồn lực tính toán đáp ứng mục tiêu chưa ạ?'],
];
for (const [want, text] of cases) assert.equal(categorize(text), want, text);
console.log('✅ categorize test passed');
