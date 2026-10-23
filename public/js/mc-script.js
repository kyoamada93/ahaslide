/* MC script: what to say on each slide, and how to lead into each kind of Q&A question.
   Edit freely — plain text. {event} = event name, {checkins} = number checked in,
   {fun} / {okr} / {hard} = number of approved questions in each group,
   {top3} = vote Top 3 with speakers (read from 3rd to 1st), once results are public. */
window.MC_SCRIPT = {
  // Suggested time per answer on the MC timer: yellow after warnMin, red after maxMin.
  answerTime: { warnMin: 3, maxMin: 5 },

  slides: {
    checkin: [
      { cue: 'Mở màn (khi khách đang vào)', lines: [
        'Xin chào cả nhà AI & Data! Chào mừng mọi người đến với {event}.',
        'Trong lúc chờ mọi người ổn định chỗ ngồi, cả nhà lấy điện thoại ra quét mã QR trên màn hình để check-in giúp mình nhé — nhập phần trước @ của email công ty là xong.',
        'Hôm nay toàn bộ phần tương tác, vote, đặt câu hỏi và cả đua vịt đều làm trên điện thoại này, nên giữ trang đó mở suốt buổi nha.',
      ] },
      { cue: 'Khi đã đông người', lines: [
        'Wow, đã có {checkins} bạn check-in rồi! Ai chưa quét thì nhanh tay nhé, lát nữa có đua vịt mà chưa check-in là mất lượt đó.',
        'Nếu ai quét không được: mở trình duyệt, gõ địa chỉ in dưới mã QR là vào được.',
      ] },
      { cue: 'Giới thiệu chương trình', lines: [
        'Hôm nay chúng ta có: khởi động với word cloud → vote chủ đề sharing → phần chia sẻ Food of Thought → Q&A trực tiếp với ban lãnh đạo → đua vịt có quà → và góp ý cuối buổi.',
        'Mọi câu hỏi đều ẩn danh, nên cả nhà cứ thoải mái hỏi những gì mình thật sự quan tâm nhé.',
      ] },
      { cue: '➡ Chuyển sang word cloud', lines: [
        'Mọi người đã sẵn sàng chưa? Mình bắt đầu khởi động nhé!',
      ] },
    ],
    wordcloud: [
      { cue: 'Khởi động', lines: [
        'Để khởi động, mình muốn nghe mọi người trước: hôm nay bạn mong muốn gì ở Townhall này?',
        'Gõ 1 đến 3 từ khoá lên điện thoại — từ nào được nhiều người gõ sẽ hiện to nhất trên màn hình.',
      ] },
      { cue: 'Khi word cloud đã lên', lines: [
        'Nhìn nè, từ to nhất đang là… [đọc 2–3 từ nổi bật]. Có vẻ cả nhà rất quan tâm chuyện này — lát nữa phần sharing và Q&A sẽ chạm tới nhé.',
        'Mình thấy có cả từ [đọc 1 từ vui] — cảm ơn bạn nào đã mang năng lượng tích cực tới đây!',
      ] },
      { cue: 'Nếu ít người gõ', lines: [
        'Mới có vài từ thôi, cả nhà còn ngại hả? Gõ thử 1 từ thôi cũng được — "networking", "lương thưởng", hay "quà" cũng được hết!',
      ] },
      { cue: '➡ Chuyển sang vote', lines: [
        'Cảm ơn cả nhà! Những mong muốn này BTC sẽ ghi lại hết. Giờ thì đến lượt mọi người chọn nội dung…',
      ] },
    ],
    poll: [
      { cue: 'Mở vote', lines: [
        'Tiếp theo là phần cả nhà được quyền quyết định: vote chủ đề sharing mà bạn muốn nghe nhất.',
        'Mỗi người 1 phiếu, có thể đổi ý cho tới khi BTC đóng vote. Mình cho cả nhà khoảng 1 phút nhé!',
      ] },
      { cue: 'Trong lúc vote', lines: [
        'Có 11 chủ đề rất đa dạng: từ multimodal, foundation model, coding agent, TTS… cho tới cả lịch sử Lê – Trịnh – Nguyễn!',
        'Hiện đang có [số] phiếu. Chủ đề nào đang dẫn đầu thì xin giữ bí mật một chút nha.',
      ] },
      { cue: 'Sắp đóng vote', lines: [
        'Còn 10 giây… ai chưa vote thì nhanh tay! 3… 2… 1… Đóng vote!',
      ] },
      { cue: 'Công bố Top 3', lines: [
        'Và đây là Top 3 chủ đề được yêu thích nhất! Mình sẽ công bố từ hạng 3 lên hạng 1 nhé…',
        '{top3}',
        'Xin mời các speaker của Top 3 lên sân khấu nhận giải! Xin một tràng pháo tay thật lớn!',
        'Cảm ơn tất cả speaker đã đăng ký chủ đề. Các chủ đề này sẽ được ưu tiên trong các buổi sharing sắp tới.',
      ] },
      { cue: '➡ Chuyển sang phần chia sẻ', lines: [
        'Nói về sharing thì không thể thiếu phần quan trọng nhất hôm nay…',
      ] },
    ],
    speaker: [
      { cue: 'Giới thiệu phần chia sẻ', lines: [
        'Bây giờ là phần chính của buổi hôm nay: Food of Thought, gồm 3 phần Insight, Highlight và People.',
        'Trong lúc nghe, có câu hỏi gì cả nhà cứ gửi ngay trên điện thoại — câu hỏi hoàn toàn ẩn danh, và mọi người có thể upvote câu hỏi mình cũng muốn hỏi.',
        'Xin mời [tên người chia sẻ] lên sân khấu!',
      ] },
      { cue: 'Phần 1 · Insight', lines: [
        'Bắt đầu với Insight: bức tranh vĩ mô và công ty, những gì đang diễn ra bên ngoài từ APAC tới MoMo, đối thủ, và những thay đổi bên trong.',
      ] },
      { cue: 'Phần 2 · Highlight', lines: [
        'Tiếp theo là Highlight: những thay đổi mới, và những điểm chúng ta cần củng cố.',
      ] },
      { cue: 'Phần 3 · People', lines: [
        'Và phần mà mình nghĩ ai cũng quan tâm: People, gồm MoMo Talent 2026 và văn hoá làm việc của chúng ta.',
      ] },
      { cue: 'Kết thúc phần chia sẻ', lines: [
        'Cảm ơn [tên] vì những chia sẻ rất thẳng thắn. Xin một tràng pháo tay!',
        'Và đây cũng là lúc chuyển sang phần mà mình biết nhiều người chờ nhất: Q&A.',
      ] },
    ],
    qa: [
      { cue: 'Mở Q&A', lines: [
        'Chúng ta đã nhận được rất nhiều câu hỏi, cả từ Google Form trước buổi và ngay tại đây. Cảm ơn mọi người đã hỏi thật lòng!',
        'Hôm nay có {fun} câu vui vẻ, {okr} câu về OKR & định hướng, và {hard} câu "khó" về lương, nhân sự và resource. Mình sẽ không né câu nào cả.',
        'Câu hỏi đều ẩn danh, nên mọi người cứ yên tâm. Vẫn có thể gửi thêm và upvote trên điện thoại nhé.',
      ] },
      { cue: 'Gợi ý nhịp Q&A', lines: [
        'Mở đầu bằng 1 câu 😄 cho không khí thoải mái → sang 🎯 OKR & định hướng → vào các câu 🔥 khó khi mọi người đã "nóng máy" → chốt lại bằng 1 câu 😄 nhẹ nhàng.',
        'Mỗi câu khoảng 3 phút. Đồng hồ "Câu này" ngả vàng sau 3 phút và đỏ sau 5 phút. Lúc đó MC xin phép chuyển câu.',
      ] },
      { cue: 'Khi hết giờ', lines: [
        'Thời gian có hạn nên mình xin phép dừng phần Q&A ở đây. Những câu chưa kịp trả lời, BTC đã ghi nhận đầy đủ và sẽ phản hồi sau buổi.',
        'Xin một tràng pháo tay thật lớn cho anh chị lãnh đạo vì đã trả lời rất thẳng thắn!',
      ] },
      { cue: '➡ Chuyển sang đua vịt', lines: [
        'Nói chuyện nghiêm túc nãy giờ rồi, giờ mình chơi một chút cho vui nha!',
      ] },
    ],
    race: [
      { cue: 'Giới thiệu đua vịt', lines: [
        'Sau phần Q&A khá "nóng", giờ là lúc xả hơi: ĐUA VỊT MOMO!',
        'Ai chưa tham gia thì quét QR trên màn hình, bấm "Tham gia đua". Chọn màu cho chú vịt của bạn luôn nhé.',
        'Luật đơn giản: khi đếm ngược xong, TAP thật nhanh vào màn hình để vịt bơi. Ai về đích trước thì thắng!',
      ] },
      { cue: 'Trước khi xuất phát', lines: [
        'Đã có [số] chú vịt xuống nước! Mọi người sẵn sàng chưa? Ngón tay đặt lên màn hình… Chuẩn bị… 3… 2… 1… TAP!',
      ] },
      { cue: 'Trong lúc đua (bình luận)', lines: [
        'Vịt số [số] đang bứt lên dẫn đầu! Nhưng còn xa lắm, chưa biết ai thắng đâu!',
        'Ối, có một pha vượt mặt ngoạn mục! Tap nữa đi, tap nữa đi!',
        'Đã qua 50%… 75%… sắp về đích rồi!',
      ] },
      { cue: 'Khi có kết quả', lines: [
        'Và nhà vô địch hôm nay là… [đọc tên hạng 1]! Xin chúc mừng! Hạng 2 là [tên], hạng 3 là [tên].',
        'Mời 3 bạn lên nhận quà nhé!',
      ] },
      { cue: 'Muốn đua thêm lượt', lines: [
        'Chưa đã đúng không? Mình đua thêm một lượt nữa nhé, các chú vịt vẫn ở nguyên vạch xuất phát!',
      ] },
      { cue: '➡ Chuyển sang góp ý', lines: [
        'Sau màn đua nghẹt thở, mình xin 1 phút cuối của cả nhà…',
      ] },
    ],
    feedback: [
      { cue: 'Kết thúc chương trình', lines: [
        'Chương trình {event} hôm nay đến đây là kết thúc. Cảm ơn tất cả mọi người đã tham gia, đặt câu hỏi và cổ vũ hết mình!',
        'Trước khi về, cả nhà dành 1 phút đánh giá và góp ý trên điện thoại giúp BTC nhé. Mọi góp ý đều được đọc kỹ để kỳ Townhall sau tốt hơn.',
        'Hẹn gặp lại cả nhà ở Townhall lần tới!',
      ] },
      { cue: 'Nhắc lại khi mọi người đang về', lines: [
        'Mã QR góp ý vẫn ở trên màn hình. Ai chưa đánh giá thì làm giúp BTC nhé, chỉ mất 1 phút thôi. Cảm ơn cả nhà!',
      ] },
    ],
  },

  // Lead-in lines when a question of this kind goes on screen (one is picked per question).
  leadIns: {
    fun: [
      'Đổi gió một chút với một câu hỏi rất "đời" nè…',
      'Câu tiếp theo nghe là thấy vui rồi, mời anh chị cùng xem trên màn hình…',
      'Một câu nhẹ nhàng để cả nhà thư giãn…',
    ],
    okr: [
      'Câu tiếp theo về định hướng và mục tiêu, chắc chắn nhiều người cùng quan tâm…',
      'Một câu hỏi rất chiến lược, xin mời anh chị chia sẻ góc nhìn…',
      'Để mọi người cùng nhìn về một hướng, mình mời anh chị trả lời câu hỏi này…',
    ],
    hard: [
      'Câu tiếp theo khá thẳng thắn. Cảm ơn bạn đã dám hỏi, và mình tin đây cũng là điều nhiều người đang nghĩ…',
      'Đây là một câu hỏi khó, nhưng Townhall là để nói những chuyện thật. Xin mời anh chị…',
      'Câu này nhận được nhiều sự quan tâm, mình xin phép đọc nguyên văn để anh chị trả lời…',
    ],
  },

  // Extra note under the question for the MC, by kind.
  notes: {
    fun: 'Giữ nhịp nhanh, khoảng 1–2 phút. Có thể hỏi thêm khán giả cho vui.',
    okr: 'Nếu câu trả lời dài, tóm lại 1 ý chính trước khi chuyển câu.',
    hard: 'Đọc nguyên văn, giữ giọng trung lập và không đùa. Nếu cần số liệu cụ thể chưa có ngay, gợi ý: "BTC ghi nhận và sẽ phản hồi sau buổi". Cảm ơn người hỏi.',
  },
};
